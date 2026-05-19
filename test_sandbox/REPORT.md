# Admin-Panel Access-Loss Bug — QA Report

**Date:** 2026-05-19
**Author:** sandbox repro under `test_sandbox/`
**Production user under investigation:** `tg_id=457081438` (role=superadmin), MAX twin `user_id=-166320182` (role=linked).

---

## Reproduction status: **REPRODUCED**

In the sandbox, user `100099` was logged in as `foreman`, the DB role was
mutated server-side to `superadmin` *without* logging the user out, and the
page was reloaded. The admin-panel link stayed hidden even though the
backend correctly returned `role: superadmin` on the very same session.

## Root cause: **(A) frontend reads stale `user_role` from localStorage and gates UI on that.**

Hypotheses (B), (C), (D), (E) are all ruled out by the captured artifacts below.

---

## File-level evidence

### Frontend gate uses `localStorage.user_role` as the source of truth

`frontend/src/components/Layout.jsx:29`
```jsx
const [role, setRole] = useState(localStorage.getItem('user_role') || 'Гость');
```
`role` is captured **once** at mount, from localStorage. It is never refreshed
when `/api/auth/session` updates localStorage later (it would have to be
refreshed via `setRole` triggered by an effect, but there is none).

`frontend/src/features/layout/components/Sidebar.jsx:128`
```jsx
const canSeeAdmin = ['boss', 'superadmin'].includes(role);
```
…and at line 298–305 the admin nav entry is rendered iff `canSeeAdmin`. The
`role` here is the stale prop from Layout.

### The async refresh path is short-circuited by the fast-path

`frontend/src/App.jsx:28–46`
```jsx
function ProtectedRoute({ children }) {
  const [authState, setAuthState] = useState(() => {
    const role = localStorage.getItem('user_role');
    const tgId = localStorage.getItem('tg_id');
    if (role && tgId) return 'authenticated';     // ← fast-path: skip /api/auth/session
    return 'checking';
  });

  useEffect(() => {
    if (authState === 'authenticated') {           // ← fast-path branch
      const role = localStorage.getItem('user_role');
      const tgId = localStorage.getItem('tg_id');
      if (role && tgId) {
        saveAuthData(tgId, role);                  // re-saves the *same* stale role
      }
      return;                                       // ← never calls /api/auth/session
    }
    async function checkAuth() {
      const stored = await loadAuthData();
      if (stored?.user_role && stored?.tg_id) {
        const res = await axios.get('/api/auth/session');   // only on miss
        ...
      }
      ...
```
So whenever localStorage already has `tg_id + user_role`, the FE never asks
the backend what the role actually is. The role is essentially pinned to
"whatever it was at the most recent explicit login or registration".

### Backend role is always fresh (rules out B/C)

`web/auth_deps.py:24–65 (get_current_user)` re-fetches the row every call:
```python
async with db.conn.execute(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')",
    (token,),
) as cur:
    row = await cur.fetchone()
...
user = await db.get_user(user_id)          # ← fresh role from users table
```
And `sessions` schema (`database/db_manager.py:342–347`) is just
`(token, user_id, created_at, expires_at)` — there is no role column to be
stale. So **no snapshot exists on the server**.

`web/routers/auth.py:447–493 (/api/auth/session)` returns `role` straight
from `db.get_user(user_id)` — confirmed live in the run (see artifacts).

### Backend ACL is wired correctly (rules out E)

`web/auth_deps.py:101` declares `require_superadmin = require_role("superadmin")`.
`web/routers/system.py:30` aliases it as `_require_superadmin` and every
`/api/system/*` endpoint depends on it. Calling `/api/system/server-logs`
with the bug-repro session returned **HTTP 200** at the same instant the
sidebar hid the admin link. The backend gate is fine; the UI is what lies.

### Linked-twin not involved (rules out D)

`web/utils.py:31` (`resolve_id`) maps a secondary id to its primary via
`account_links`. The session cookie was minted on the primary `100099` and
`get_current_user` resolved it directly. Even when a session belongs to a
MAX twin (negative id), `resolve_id` would still hand the primary to
`db.get_user`. In the production complaint the user has `linked_user_id =
-166320182`, but the twin's role being `linked` is irrelevant — the
primary is the one being authenticated.

---

## Captured artifacts (in this sandbox run)

### After `users.role` mutated 100099 → superadmin, page reloaded (NO logout)

| Source                       | Reported role                         |
|------------------------------|---------------------------------------|
| `localStorage.user_role`     | `foreman`        (stale, written at login) |
| `GET /api/auth/session`      | `superadmin`     (live, from DB)      |
| `GET /api/system/server-logs`| **HTTP 200**     (backend allows it)  |
| Sidebar admin link visible?  | **NO**           (Layout.role = 'foreman') |

Raw JSON captured from the page:
```json
{
  "hasAdminLink": false,
  "localStorage_user_role": "foreman",
  "localStorage_tg_id": "100099",
  "session_endpoint": {
    "status": "ok",
    "tg_id": 100099,
    "role": "superadmin",
    "fio": "Bug Repro User"
  }
}
```

### Sessions table row for the bug-repro user
```
schema: (token, user_id, created_at, expires_at)   # NO 'role' column
row:    (Bmjm6gyRbBFBnXx0..., user_id=100099, created=2026-05-19 02:36:17, expires=2026-06-18 02:36:17)
```
The session is just a `token → user_id` map. There is nothing to snapshot.

### Fix verification (Step 4.4)

`localStorage.removeItem('user_role')` then reload → App.jsx falls off the
fast-path → async `checkAuth` calls `/api/auth/session` → `saveAuthData`
writes `superadmin` to localStorage → Layout reads `superadmin` → admin
link appears. Confirmed:
```json
{ "hasAdminLink": true, "localStorage_user_role": "superadmin" }
```

### Screenshots

- `step_4_1_baseline_superadmin.png` — Real superadmin (100001): admin link visible.
- `step_4_2a_foreman_no_admin.png` — Foreman (100099, pre-mutation): no admin link (expected).
- `step_4_4_admin_restored.png` — After role mutation + localStorage clear + reload: admin link visible.
  (The "bug-active" reload looked identical to `step_4_2a_*` — the role
  upgrade silently failed to surface in the UI.)

---

## Proposed minimal fix

The cheapest fix is to **drop the fast-path** so every authenticated render
goes through `/api/auth/session` once, and let that response be the source
of truth for `user_role`. The current fast-path was added for iOS PWA
launch speed; on a typical session this is one extra request to the
already-running API.

`frontend/src/App.jsx` (diff sketch):
```diff
 function ProtectedRoute({ children }) {
-  const [authState, setAuthState] = useState(() => {
-    const role = localStorage.getItem('user_role');
-    const tgId = localStorage.getItem('tg_id');
-    if (role && tgId) return 'authenticated';
-    return 'checking';
-  });
+  const [authState, setAuthState] = useState('checking');
@@
   useEffect(() => {
-    if (authState === 'authenticated') {
-      const role = localStorage.getItem('user_role');
-      const tgId = localStorage.getItem('tg_id');
-      if (role && tgId) {
-        saveAuthData(tgId, role);  // fire-and-forget
-      }
-      return;
-    }
-
     async function checkAuth() {
       const stored = await loadAuthData();
       if (stored?.user_role && stored?.tg_id) {
         try {
           const res = await axios.get('/api/auth/session');
           if (res.data?.tg_id) {
             await saveAuthData(res.data.tg_id, res.data.role);
             setAuthState('authenticated');
             return;
           }
         } catch { await clearAuthData(); }
       }
       try {
         const res = await axios.get('/api/auth/session');
         if (res.data?.tg_id) {
           await saveAuthData(res.data.tg_id, res.data.role);
           setAuthState('authenticated');
           return;
         }
       } catch {}
       setAuthState('unauthenticated');
     }
     checkAuth();
   }, [authState]);
```

This keeps the localStorage-write side of `saveAuthData` (which still
helps iOS PWA persistence on next cold start), but it stops *trusting*
localStorage as the source of truth.

A defense-in-depth tweak in `Layout.jsx` is also worth considering:
listen for a `user_role` change event after `/api/auth/session` settles
and `setRole(localStorage.getItem('user_role'))`. Today, even if App.jsx
refreshes localStorage post-mount, the Layout instance still renders with
the value captured in the initial `useState`. With the fix above, Layout
only mounts *after* the refresh completes, so this is no longer required
— but a small `useEffect` watcher would make Layout robust to any future
caller that mutates localStorage during a session.

There is no backend change needed.

---

## Can production user `tg_id=457081438` be unblocked without a code fix?

**Yes — without touching any session row.** Two options:

1. **User-side (1 step):** the user opens DevTools or the PWA-clear flow
   and runs `localStorage.removeItem('user_role')`, then reloads. Or
   simply logs out and back in via the bot (which forces
   `saveAuthData(...)` with the fresh role from the auth response). A
   full app reinstall / clear-site-data also works.

2. **Operator-side (0 steps for the user):** delete the user's session
   row in the DB:
   ```sql
   DELETE FROM sessions WHERE user_id = 457081438;
   ```
   On the user's next page load `/api/auth/session` will 401, App.jsx
   will hit `clearAuthData()` → localStorage cleared → user logs in
   again → fresh `superadmin` saved. **This works** because the bug is
   downstream of the session, not in it.

Either workaround unblocks the user. The code fix is still required to
prevent recurrence on *any* DB-side role change (promotion or demotion).

---

## Notes / caveats

- `graphify` refresh via `npx safishamsi/graphify` failed on Windows
  (`npm error ENOENT` on its own clone cache). Existing
  `graphify-out/GRAPH_REPORT.md` (2026-04-21) was consulted alongside
  direct grep — the four touchpoints are unchanged from that snapshot.
- The sandbox FastAPI ran without `pillow` / `pandas` (no Python 3.14
  wheels available). None of the codepaths exercised in the repro touch
  those modules, so the API came up clean.
- The dev-only `web/routers/_test_auth.py` is double-guarded (env-var
  check at both registration time *and* per-request) and 404s outside
  development. **It must still be removed before production deploy** —
  the file header carries the same warning.

---

## RESOLUTION (2026-05-19)

Both bugs were fixed in one pass against the same sandbox. The
underlying invariant is now: **the server is the only source of truth
for `role`; localStorage is a cache, never a verdict.**

### Changed files

| File | One-line rationale |
|---|---|
| `frontend/src/utils/tokenStorage.js` | `saveAuthData` now dispatches `auth:role-changed`; new `clearAuthAndRedirect()` clears all three persistence layers (localStorage + IDB + Cache API) *and awaits the IDB clear* before navigating — without that, `loadAuthData`'s back-fill repopulated localStorage and bounced the user back into the protected area. |
| `frontend/src/App.jsx` | `ProtectedRoute` no longer short-circuits on localStorage. It still renders optimistically, but **always** reconciles against `GET /api/auth/session` in the background; 401 → silent `clearAuthAndRedirect('/login')` (no modal flash on cold start); 200 → `saveAuthData` overwrites localStorage which fires the role-changed event. Added explicit `/login` route alongside `/`. |
| `frontend/src/components/Layout.jsx` | Listens to `auth:role-changed` and `auth:session-expired`. The former updates `role` state live so the sidebar admin gate (`canSeeAdmin`) flips without a remount; the latter opens `SessionModal` instead of the previous reload-loop trigger. |
| `frontend/src/features/layout/components/SessionModal.jsx` | Button handler swapped from `logoutAndRedirect` (which left IDB populated, allowing a back-fill loop) to `clearAuthAndRedirect('/login')`. Inline comment forbids future ✕ controls from skipping the helper. |
| `frontend/src/main.jsx` | Axios 401 interceptor split: `/api/auth/session` 401 → `clearAuthAndRedirect('/login')` (cold-start case); any other 401 → dispatch `auth:session-expired` event; `/api/auth/logout` 401 → ignore (avoid recursion). `sessionStorage.auth_redirecting` flag still guards a burst of in-flight 401s. |
| `web/routers/auth.py` | One-line invariant comment above the `/api/auth/session` response body — no behaviour change, just a hint for the next reader. |

### Regression test results

All run inside `test_sandbox/` with the seeded users from `seed.py`.

| # | Scenario | Result | Screenshot |
|---|---|---|---|
| 1 | **Promotion** — user 100099 was foreman, role flipped to superadmin DB-side without logout. Reload (no localStorage clear). Admin link appears within ~500ms. | **PASS** — `hasAdminLink:true, ls_role:"superadmin"` | `test_sandbox/screenshots/test_1_promotion.png` |
| 2 | **Demotion** — same user, role flipped back to foreman DB-side without logout. Reload. Admin link disappears. | **PASS** — `hasAdminLink:false, ls_role:"foreman"` | `test_sandbox/screenshots/test_2_demotion.png` |
| 3 | **Session-expiry loop fix** — login as superadmin 100001, delete `sessions` row, dispatch `auth:session-expired` (simulating the axios interceptor on a non-probe 401). Modal opens; clicking "Войти заново" lands on `/login` with all three storage layers clean. | **PASS** — `location:"/login", ls_role:null, ls_tg_id:null, idbRow:"empty", modalGone:true` | `test_sandbox/screenshots/test_3a_modal_opens.png`, `test_3b_loop_broken.png` |
| 4 | **Offline resilience** — login as superadmin, kill the API, reload. UI mounts with cached role, no `/login` redirect; `useApiHealth` flips the maintenance screen after ~6s as designed. | **PASS** — `ls_role:"superadmin", location:"/dashboard"`, maintenance screen showed after threshold | `test_sandbox/screenshots/test_4_offline_resilience.png` |
| 5 | **Cold-start 401** — manually plant fake `tg_id`/`user_role`, reload. App.jsx reconcile fires `/api/auth/session`, gets 401, silently `clearAuthAndRedirect('/login')` clears all layers, no modal flash. | **PASS** — `location:"/login", ls_role:null, ls_tg_id:null, modalShown:false` | `test_sandbox/screenshots/test_5_cold_start_401.png` |

### Bugs closed

- **BUG 1 (stale role in UI):** closed by App.jsx unconditional reconcile
  + Layout.jsx event listener + tokenStorage.js event dispatch. Validated
  by tests 1, 2.
- **BUG 2 (auth-expired modal loop):** closed by `clearAuthAndRedirect`
  clearing all three persistence layers (not just localStorage), the
  SessionModal routing through it, and the main.jsx interceptor splitting
  the cold-start vs. expired-session paths. Validated by tests 3, 5.

### A note on the "clear all three layers" decision

The first pass at `clearAuthAndRedirect` only cleared localStorage. TEST
3 caught the regression instantly: after the redirect to `/login`,
Login.jsx's `useEffect` called `loadAuthData()`, which fell through to
IndexedDB, found the row populated, **back-filled localStorage from
IDB**, and redirected the user back to `/dashboard` — the exact loop we
were trying to break, just on a longer path. Now the helper awaits the
IDB+Cache clear before navigating. This is also why `clearAuthAndRedirect`
is *not* the same as `logoutAndRedirect`: the former is surgical (drops
auth tokens, keeps installed-app state), the latter is heavy-handed
(drops push subscription, all caches, every IDB DB).


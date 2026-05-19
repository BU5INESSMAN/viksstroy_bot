/**
 * Triple-layer token persistence for iOS PWA compatibility.
 *
 * iOS Safari standalone mode (home-screen PWA) aggressively evicts
 * localStorage. We store auth credentials in three places and read
 * them back in priority order:
 *   1. localStorage  — fastest, works everywhere, but iOS evicts it
 *   2. IndexedDB      — more durable on iOS than localStorage
 *   3. Cache API      — most persistent storage available to a PWA
 *
 * On write we fan-out to all three; on read we try each in order and
 * back-fill the faster layers from whichever succeeds.
 */

const DB_NAME = 'viks_auth';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const CACHE_NAME = 'viks-auth-v1';   // must match sw.js exclusion
const CACHE_KEY = '/auth-token-store';

// ───────────────────── IndexedDB layer ─────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbSet(data) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, 'auth');
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch { /* silent */ }
}

async function idbGet() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('auth');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbClear() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch { /* silent */ }
}

// ───────────────────── Cache API layer ─────────────────────

async function cacheSet(data) {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(new Request(CACHE_KEY), new Response(JSON.stringify(data)));
  } catch { /* silent */ }
}

async function cacheGet() {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(new Request(CACHE_KEY));
    return res ? await res.json() : null;
  } catch { return null; }
}

async function cacheClear() {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(new Request(CACHE_KEY));
  } catch { /* silent */ }
}

// ───────────────────── Public API ─────────────────────

/**
 * Save auth credentials to all three storage layers.
 * Call after every successful login / registration.
 */
export async function saveAuthData(tgId, role) {
  const data = {
    tg_id: String(tgId),
    user_role: role,
    saved_at: Date.now(),
  };

  // Layer 1 — localStorage (synchronous)
  try {
    localStorage.setItem('tg_id', data.tg_id);
    localStorage.setItem('user_role', data.user_role);
  } catch { /* quota / private-mode */ }

  // Notify listeners (Layout.jsx) that the role may have changed so
  // components rendering off `role` can re-read without remounting.
  // Used by the App.jsx /api/auth/session reconciliation path.
  try {
    window.dispatchEvent(new CustomEvent('auth:role-changed', { detail: { role } }));
  } catch { /* SSR / non-DOM env */ }

  // Session token lives ONLY in the HttpOnly cookie (set by server).
  // It is NOT stored in localStorage/IndexedDB/Cache API.

  // Layer 2 + 3 — async, fire in parallel
  await Promise.all([idbSet(data), cacheSet(data)]);
}

/**
 * Load auth credentials from the first available layer.
 * Returns { tg_id, user_role, session_token } or null.
 */
export async function loadAuthData() {
  // Layer 1 — localStorage (role + tgId required)
  const role = localStorage.getItem('user_role');
  const tgId = localStorage.getItem('tg_id');
  if (role && tgId) {
    return { tg_id: tgId, user_role: role };
  }

  // Layer 2 — IndexedDB
  const idbData = await idbGet();
  if (idbData?.tg_id && idbData?.user_role) {
    // Back-fill localStorage for fast path next time
    try {
      localStorage.setItem('tg_id', idbData.tg_id);
      localStorage.setItem('user_role', idbData.user_role);
    } catch { /* silent */ }
    return { tg_id: idbData.tg_id, user_role: idbData.user_role };
  }

  // Layer 3 — Cache API
  const cacheData = await cacheGet();
  if (cacheData?.tg_id && cacheData?.user_role) {
    // Back-fill localStorage + IndexedDB
    try {
      localStorage.setItem('tg_id', cacheData.tg_id);
      localStorage.setItem('user_role', cacheData.user_role);
    } catch { /* silent */ }
    await idbSet(cacheData);
    return { tg_id: cacheData.tg_id, user_role: cacheData.user_role };
  }

  return null;
}

/**
 * Wipe auth credentials from all layers.
 * Call on explicit logout or expired-session cleanup.
 */
export async function clearAuthData() {
  try {
    localStorage.removeItem('tg_id');
    localStorage.removeItem('user_role');
    localStorage.removeItem('session_token'); // cleanup legacy entries
  } catch { /* silent */ }
  await Promise.all([idbClear(), cacheClear()]);
}

/**
 * Full auth cleanup: wipes localStorage, sessionStorage, cookies,
 * push subscription, IndexedDB databases, and Cache API entries.
 * Preserves non-auth UI preferences ('theme').
 *
 * Synchronous best-effort — async side effects fire-and-forget so the
 * caller can redirect immediately without waiting.
 */
export function fullAuthCleanup() {
  // 1. localStorage — preserve theme only
  try {
    const preserved = {};
    const keep = ['theme'];
    keep.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) preserved[k] = v;
    });
    localStorage.clear();
    Object.entries(preserved).forEach(([k, v]) => {
      try { localStorage.setItem(k, v); } catch { /* silent */ }
    });
  } catch { /* silent */ }

  // 2. sessionStorage — full wipe
  try { sessionStorage.clear(); } catch { /* silent */ }

  // 3. Cookies — expire every cookie for this host + root host
  try {
    const host = window.location.hostname;
    document.cookie.split(';').forEach(raw => {
      const name = raw.split('=')[0].trim();
      if (!name) return;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${host}`;
    });
  } catch { /* silent */ }

  // 4. Push subscription — unsubscribe best-effort
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          if (sub) sub.unsubscribe().catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    } catch { /* silent */ }
  }

  // 5. IndexedDB — drop every database
  try {
    if (window.indexedDB && typeof indexedDB.databases === 'function') {
      indexedDB.databases().then(dbs => {
        (dbs || []).forEach(d => {
          if (d?.name) {
            try { indexedDB.deleteDatabase(d.name); } catch { /* silent */ }
          }
        });
      }).catch(() => {});
    } else if (window.indexedDB) {
      // Safari fallback: at least drop the known auth DB
      try { indexedDB.deleteDatabase(DB_NAME); } catch { /* silent */ }
    }
  } catch { /* silent */ }

  // 6. Cache API — drop every cache bucket
  try {
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(n => caches.delete(n).catch(() => {}));
      }).catch(() => {});
    }
  } catch { /* silent */ }
}

/**
 * One-shot logout: best-effort server logout call, full local cleanup,
 * hard redirect to login. Uses window.location.href (full page reload)
 * so all React state is destroyed.
 */
export function logoutAndRedirect() {
  // Fire-and-forget server logout; cookie may already be invalid.
  try {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  } catch { /* silent */ }

  fullAuthCleanup();

  window.location.href = '/';
}

/**
 * Surgical logout used by the session-expired flow.
 *
 * Why not just call logoutAndRedirect()?
 *   - logoutAndRedirect() runs fullAuthCleanup() which wipes IndexedDB
 *     databases, all caches, the push subscription, etc. — useful on an
 *     explicit "log out" click but heavy-handed for an expired session
 *     where the user is about to log back in as the same account.
 *   - We need a deterministic ordering: clear localStorage BEFORE the
 *     navigation so the next App.jsx mount doesn't fast-path back into
 *     the broken state (the cause of the session-expired modal loop).
 *
 * Steps:
 *   1. Drop the role markers from ALL THREE persistence layers
 *      (localStorage, IndexedDB, Cache API) so App.jsx falls off its
 *      optimistic fast-path AND so loadAuthData()'s IDB/Cache fall-back
 *      paths don't back-fill localStorage on the next page mount.
 *      (Clearing only localStorage was an early bug — the next mount
 *      ran loadAuthData(), found IDB populated, re-seeded localStorage,
 *      and the user bounced right back into the protected area from
 *      Login.jsx's useEffect — see test_sandbox/REPORT.md TEST 3.)
 *   2. Best-effort POST /api/auth/logout — the cookie is HttpOnly so
 *      JS cannot delete it; only the server can mark the session row
 *      invalid + clear the cookie via Set-Cookie.
 *   3. Either-way (`.finally`) hard-navigate to `target` so all in-memory
 *      React state is destroyed and the next mount re-runs auth from
 *      scratch.
 *
 * Why not just call logoutAndRedirect()? That helper wipes IndexedDB
 * databases, all Cache API buckets, the push subscription, etc. — useful
 * on an explicit "log out" click but heavy-handed for an expired session
 * where the user is about to log back in as the same account. We only
 * need to drop the auth tokens, not the entire installed-app state.
 *
 * @param {string} target  destination URL; defaults to '/login'.
 */
export function clearAuthAndRedirect(target = '/login') {
  // Synchronous localStorage clear so App.jsx's fast-path can't read
  // stale data even if the async clears below take a tick.
  try {
    localStorage.removeItem('tg_id');
    localStorage.removeItem('user_role');
  } catch { /* silent */ }

  // Settle both side-effects (IDB+Cache clear, server logout) before
  // we navigate. If we don't await the IDB clear, Login.jsx mounts on
  // the next page, calls loadAuthData() which finds the IDB row still
  // there, back-fills localStorage from it, and bounces the user
  // straight back into the protected area.
  const idbCacheClear = clearAuthData().catch(() => {});
  const serverLogout = (() => {
    try {
      return fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .catch(() => {});
    } catch {
      return Promise.resolve();
    }
  })();

  Promise.allSettled([idbCacheClear, serverLogout]).then(() => {
    // Full navigation, NOT reload — reload would re-mount with whatever
    // state survived (sessionStorage flags, cached modules) and could
    // race into the same expired-session UI before the new mount picks
    // up the cleared localStorage.
    window.location.href = target;
  });
}

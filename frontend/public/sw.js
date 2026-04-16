// Bump this integer whenever sw.js or cache strategy changes.
const CACHE_VERSION = 2;
const CACHE_NAME = 'viks-cache-v' + CACHE_VERSION;

const MAINTENANCE_HTML = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>ВИКС — Обновление</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #111827; color: #f3f4f6;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; text-align: center; padding: 20px;
        }
        .container { max-width: 400px; }
        .spinner { width: 48px; height: 48px; border: 4px solid #374151; border-top-color: #3b82f6;
            border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 24px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        h1 { font-size: 24px; font-weight: 800; margin-bottom: 12px; }
        p { font-size: 14px; color: #9ca3af; margin-bottom: 24px; line-height: 1.6; }
        .btn { background: #3b82f6; color: white; border: none; padding: 14px 32px;
            border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer;
            transition: background 0.2s; }
        .btn:hover { background: #2563eb; }
        .status { font-size: 12px; color: #6b7280; margin-top: 16px; }
        .updated { display: none; background: #065f46; color: #6ee7b7; padding: 12px 20px;
            border-radius: 12px; font-weight: 700; font-size: 14px; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner" id="spinner"></div>
        <h1>Обновление платформы</h1>
        <p>Приложение обновляется. Это займёт несколько секунд.</p>
        <button class="btn" onclick="location.reload()">Перезагрузить страницу</button>
        <div class="status" id="status">Проверка соединения...</div>
        <div class="updated" id="updated">✅ Приложение обновлено! Перезагрузите страницу.</div>
    </div>
    <script>
        let checkInterval;
        function checkServer() {
            fetch('/api/settings', { method: 'GET', cache: 'no-store' })
                .then(r => {
                    if (r.ok) {
                        document.getElementById('spinner').style.display = 'none';
                        document.getElementById('status').style.display = 'none';
                        document.getElementById('updated').style.display = 'block';
                        clearInterval(checkInterval);
                        setTimeout(() => location.reload(), 2000);
                    }
                })
                .catch(() => {
                    document.getElementById('status').textContent = 'Сервер перезапускается...';
                });
        }
        checkInterval = setInterval(checkServer, 3000);
        checkServer();
    </script>
</body>
</html>
`;

// Install: cache maintenance page, skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.put(
        new Request('offline-page'),
        new Response(MAINTENANCE_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      )
    ).catch(() => {}) // never block install on cache failure
  );
  self.skipWaiting();
});

// Activate: delete old caches, but PRESERVE auth token cache
const AUTH_CACHE = 'viks-auth-v1';
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== AUTH_CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Message listener for frontend-triggered actions
self.addEventListener('message', (event) => {
  const data = event.data;
  // String-form legacy signals
  if (data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (data === 'clearCache') {
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== AUTH_CACHE).map(k => caches.delete(k))));
    return;
  }
  // Object-form signals (preferred)
  if (data && typeof data === 'object') {
    if (data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  }
});

// Safe cache write — never throws
function safeCachePut(request, response) {
  try {
    if (!response || !response.ok || response.type !== 'basic') return;
    const clone = response.clone();
    caches.open(CACHE_NAME)
      .then((cache) => cache.put(request, clone))
      .catch(() => {}); // silently ignore quota / put errors
  } catch { /* silent */ }
}

// ─── Push Notifications ───────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const options = {
      body: payload.body || '',
      icon: payload.icon || '/push-icons/app-new.png',
      badge: payload.badge || '/push-icons/badge.png',
      data: { url: payload.url || '/' },
      vibrate: [200, 100, 200],
      tag: payload.tag || 'viks-notification',
      renotify: true,
    };
    event.waitUntil(
      self.registration.showNotification(payload.title || 'ВиКС Расписание', options)
    );
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification('ВиКС Расписание', { body: event.data.text() })
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try { client.navigate(url); } catch (_) { /* cross-origin safety */ }
          }
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ─── Fetch Handler ────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: NETWORK ONLY — never cache
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Hashed assets (/assets/*): CACHE FIRST — safe to cache forever
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          safeCachePut(event.request, response);
          return response;
        });
      }).catch(() => fetch(event.request)) // fallback to network on any cache error
    );
    return;
  }

  // Navigation (HTML pages): NETWORK FIRST — fall back to maintenance page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('offline-page').then((r) => r || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Everything else (icons, manifest, etc.): NETWORK FIRST with cache fallback
  event.respondWith(
    fetch(event.request).then((response) => {
      safeCachePut(event.request, response);
      return response;
    }).catch(() =>
      caches.match(event.request).then((r) => r || new Response('', { status: 503 }))
    )
  );
});

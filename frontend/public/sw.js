const CACHE_VERSION = Date.now();
const CACHE_NAME = 'viks-cache-' + CACHE_VERSION;

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
    )
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
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'clearCache') {
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== AUTH_CACHE).map(k => caches.delete(k))));
  }
});

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
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => {})
    );
    return;
  }

  // Navigation (HTML pages): NETWORK FIRST — fall back to maintenance page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('offline-page'))
    );
    return;
  }

  // Everything else (icons, manifest, etc.): NETWORK FIRST with cache fallback
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});

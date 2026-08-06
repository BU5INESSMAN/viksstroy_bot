// The service worker is deliberately push-only. Application pages and assets
// always go straight to the network/browser HTTP cache. Intercepting them here
// previously allowed an old worker to keep serving a maintenance page after
// the server had recovered, causing the visible endless-update loop.
// Activate immediately so a previously cached maintenance worker is replaced
// even when the React application itself cannot finish booting.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Delete every old runtime cache, but preserve the auth fallback cache.
const AUTH_CACHE = 'viks-auth-v1';
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== AUTH_CACHE).map((key) => caches.delete(key)))
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
  } catch {
    event.waitUntil(
      self.registration.showNotification('ВиКС Расписание', { body: event.data.text() })
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  let url = '/';
  try {
    const requested = new URL(event.notification.data?.url || '/', self.location.origin);
    if (requested.origin === self.location.origin) {
      url = requested.pathname + requested.search + requested.hash;
    }
  } catch { /* malformed payload — open the safe default */ }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try { client.navigate(url); } catch { /* cross-origin safety */ }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// No fetch handler by design: HTML, API calls and assets can never be trapped
// behind a stale service-worker cache. Push notifications remain fully usable.

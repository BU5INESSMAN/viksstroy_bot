/**
 * PWA update detection.
 *
 * initPWAUpdate(onUpdateAvailable) → subscribes to the active service-worker
 * registration and invokes onUpdateAvailable(newWorker) when a new version
 * finishes installing while another SW is still controlling the page.
 *
 * Also polls for updates every 5 minutes and reloads the page once the new
 * SW takes control.
 */
export function initPWAUpdate(onUpdateAvailable) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          onUpdateAvailable(newWorker);
        }
      });
    });
    setInterval(() => registration.update(), 5 * 60 * 1000);
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

export function applyUpdate(worker) {
  if (!worker) return;
  worker.postMessage({ type: 'SKIP_WAITING' });
}

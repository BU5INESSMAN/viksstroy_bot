import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'
import { initPWAInstall } from './utils/pwaInstall'
import { logoutAndRedirect } from './utils/tokenStorage'

// Send HttpOnly cookies on all requests (required for session persistence)
axios.defaults.withCredentials = true;

// 401 interceptor — on expired session, do a full cleanup and redirect
// to login exactly once. The sessionStorage flag guards against the
// burst of 401s that arrives when the user had several requests in
// flight; only the first one triggers the redirect.
// The flag lives in sessionStorage, which fullAuthCleanup() clears, so
// the next login starts from a clean slate.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || '';
    // /api/auth/session is the probe ProtectedRoute uses to test the
    // cookie — a 401 there is expected on first load, not a sign of an
    // expired session. Skip the redirect for that one path.
    const isSessionProbe = url.includes('/api/auth/session');
    if (error?.response?.status === 401 && !isSessionProbe) {
      if (!sessionStorage.getItem('auth_redirecting')) {
        try { sessionStorage.setItem('auth_redirecting', '1'); } catch { /* silent */ }
        logoutAndRedirect();
      }
    }
    return Promise.reject(error);
  }
);

// Capture beforeinstallprompt + appinstalled early so the banner/sidebar can offer install.
initPWAInstall();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Check for updates every 5 minutes
      setInterval(() => reg.update(), 5 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            window.location.reload();
          }
        });
      });
    }).catch(() => {});
  });
}

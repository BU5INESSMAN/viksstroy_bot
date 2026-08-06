import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'
import { initPWAInstall } from './utils/pwaInstall'
import { clearAuthAndRedirect } from './utils/tokenStorage'
import RootErrorBoundary, { BootSignal } from './components/RootErrorBoundary'

// Send HttpOnly cookies on all requests (required for session persistence)
axios.defaults.withCredentials = true;

// 401 interceptor — split into two paths:
//
//   /api/auth/session 401  →  cold-start: localStorage was lying about
//                              the user being logged in. Skip the modal
//                              (modal is for *running* sessions whose
//                              cookie just got revoked) and silently
//                              bounce to /login via clearAuthAndRedirect.
//                              ProtectedRoute also handles this case in
//                              its own catch block; the interceptor
//                              guards endpoints that bypass it (eg.
//                              Login.jsx loadAuthData fast-path).
//
//   /api/auth/logout 401   →  ignore — the logout helper itself triggers
//                              this on a stale cookie and we'd recurse.
//
//   anything else 401      →  fire `auth:session-expired`; Layout.jsx
//                              opens the SessionModal whose only action
//                              is clearAuthAndRedirect. This breaks the
//                              previous reload-loop (BUG 2): the modal
//                              cannot navigate back into the broken
//                              state because every exit clears
//                              localStorage first.
//
// The sessionStorage flag survives a burst of 401s (multiple in-flight
// requests fail at once) so we fire the modal-open event only once per
// session-expiry incident; Login.jsx clears it on mount.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || '';
    const isSessionProbe = url.includes('/api/auth/session');
    const isLogoutCall = url.includes('/api/auth/logout');

    if (error?.response?.status === 401 && !isLogoutCall) {
      let isRedirecting = false;
      try { isRedirecting = Boolean(sessionStorage.getItem('auth_redirecting')); } catch { /* private mode */ }
      if (!isRedirecting) {
        try { sessionStorage.setItem('auth_redirecting', '1'); } catch { /* silent */ }
        if (isSessionProbe) {
          // ProtectedRoute's own catch will also handle this — keep
          // both paths so the redirect is robust even if reconciliation
          // is bypassed (e.g. someone hits /api/auth/session from a
          // pre-mount loader script).
          clearAuthAndRedirect('/login');
        } else {
          try {
            window.dispatchEvent(new CustomEvent('auth:session-expired'));
          } catch { /* SSR / non-DOM env */ }
        }
      }
    }

    // v2.4.4: server-down scenarios are handled by the maintenance
    // screen (useApiHealth hook). Suppress the noisy "Network Error"
    // console trace for them — the rejection is still propagated so
    // component-level callers can react, but we keep the console clean.
    const status = error?.response?.status;
    const isServerDown = !error.response || status === 502 || status === 503 || status === 504;
    if (isServerDown) {
      console.warn('[api] unreachable — maintenance screen will handle it:', error.message || status);
    }

    return Promise.reject(error);
  }
);

// Capture beforeinstallprompt + appinstalled early so the banner/sidebar can offer install.
initPWAInstall();

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <React.StrictMode>
      <BootSignal />
      <App />
    </React.StrictMode>
  </RootErrorBoundary>,
)

// Register the push-only service worker immediately after the React root is
// scheduled. Waiting for window.load meant a single slow image could prevent
// registration and push setup altogether on mobile networks. The worker never
// caches application pages, so updating it does not require a forced reload.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then((registration) => registration.update().catch(() => {}))
    .catch(() => {});
}

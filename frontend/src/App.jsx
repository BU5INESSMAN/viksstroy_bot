import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import Layout from './components/Layout';
import SplashScreen from './components/SplashScreen';
import { loadAuthData, saveAuthData, clearAuthData, clearAuthAndRedirect } from './utils/tokenStorage';

// Lazy-loaded pages
const Login = lazy(() => import('./pages/Login'));
const TMAAuth = lazy(() => import('./pages/TMAAuth'));
const MAXAuth = lazy(() => import('./pages/MAXAuth'));
const Home = lazy(() => import('./pages/Home'));
const Guide = lazy(() => import('./pages/Guide'));
const Updates = lazy(() => import('./pages/Updates'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));
const MyApps = lazy(() => import('./pages/MyApps'));
const Review = lazy(() => import('./pages/Review'));
const Resources = lazy(() => import('./pages/Resources'));
const Objects = lazy(() => import('./pages/Objects'));
const KP = lazy(() => import('./pages/KP'));
const JoinTeam = lazy(() => import('./pages/JoinTeam'));
const JoinEquipment = lazy(() => import('./pages/JoinEquipment'));
const AuthRedirect = lazy(() => import('./pages/AuthRedirect'));
const Support = lazy(() => import('./pages/Support'));

function ProtectedRoute({ children }) {
  const [authState, setAuthState] = useState(() => {
    // Optimistic render: if localStorage already has auth markers, mount
    // the protected tree immediately to avoid a flash of the checking
    // spinner. Reconciliation against /api/auth/session always happens
    // in the useEffect below — see comment block there for the why.
    const role = localStorage.getItem('user_role');
    const tgId = localStorage.getItem('tg_id');
    if (role && tgId) return 'authenticated';
    return 'checking';
  });

  useEffect(() => {
    // Background reconciliation — the source of truth for `role` is the
    // server, not localStorage. We ALWAYS probe /api/auth/session on
    // mount, regardless of whether the optimistic fast-path already
    // marked us authenticated. If the server reports a different role
    // (promotion or demotion happened while logged in), saveAuthData
    // rewrites localStorage and fires `auth:role-changed` so already-
    // mounted components (Layout.jsx) update their `role` state without
    // a remount. Cf. test_sandbox/REPORT.md hypothesis (A).
    let cancelled = false;

    async function reconcileWithServer() {
      try {
        const res = await axios.get('/api/auth/session');
        if (cancelled) return;
        if (res?.data?.tg_id) {
          // Always saveAuthData — even when the role matches, this
          // back-fills IndexedDB + Cache API for iOS PWA persistence.
          await saveAuthData(res.data.tg_id, res.data.role);
          setAuthState('authenticated');
        } else {
          // Shouldn't happen (server returns 200 + payload OR 401), but
          // be defensive.
          await clearAuthData();
          if (!cancelled) setAuthState('unauthenticated');
        }
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 401) {
          // Stored localStorage was lying. Don't flash the session-
          // expired modal on cold start — that flow is for *running*
          // sessions that just got their cookie revoked. Cold-start
          // 401 is just a stale page after a logout; silently bounce.
          clearAuthAndRedirect('/login');
          return;
        }
        // Network / 5xx — keep whatever we optimistically rendered.
        // useApiHealth will surface the maintenance screen if the API
        // stays down. We log so the cause is visible in DevTools.
        // eslint-disable-next-line no-console
        console.warn('[auth] /api/auth/session reconciliation failed:', err?.message || status);
        // If we never had localStorage to optimistically render from,
        // we can't stay on 'checking' forever — drop to the Login page.
        setAuthState((s) => (s === 'checking' ? 'unauthenticated' : s));
      }
    }

    reconcileWithServer();

    return () => { cancelled = true; };
  }, []);  // run once per ProtectedRoute mount

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    const isTMA = window.Telegram?.WebApp?.initData ||
                  window.location.search.includes('tgWebAppData') ||
                  window.location.hash.includes('tgWebAppData');

    const isMAX = window.location.pathname.includes('/max') ||
                  window.location.search.includes('WebAppData') ||
                  window.location.hash.includes('WebAppData');

    if (isMAX) {
      return <Navigate to={`/max?return_to=${window.location.pathname}${window.location.hash}`} replace />;
    }
    if (isTMA) {
      return <Navigate to={`/tma?return_to=${window.location.pathname}${window.location.hash}`} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
}

const SuspenseFallback = (
  <div className="flex h-screen items-center justify-center text-gray-500">Загрузка...</div>
);

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const hasShown = sessionStorage.getItem('splash_shown');
    return !hasShown && (isStandalone || !document.referrer);
  });

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
    sessionStorage.setItem('splash_shown', 'true');
  }, []);

  useEffect(() => {
    document.body.style.overscrollBehaviorY = 'none';

    if (window.Telegram?.WebApp?.disableVerticalSwipes) {
        window.Telegram.WebApp.disableVerticalSwipes();
    }
  }, []);

  return (
    <BrowserRouter>
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
      <Toaster
        position="top-center"
        containerStyle={{ zIndex: 99999 }}
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          },
          success: { style: { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' } },
          error: { style: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }, duration: 4000 },
        }}
      />
      <Suspense fallback={SuspenseFallback}>
        <Routes>
          <Route path="/" element={<Login />} />
          {/* /login is the explicit target of clearAuthAndRedirect — alias to Login */}
          <Route path="/login" element={<Login />} />
          <Route path="/auth" element={<AuthRedirect />} />
          <Route path="/tma" element={<TMAAuth />} />
          <Route path="/max" element={<MAXAuth />} />

          {/* Публичные роуты для приглашений */}
          <Route path="/invite/:code" element={<JoinTeam />} />
          <Route path="/equip-invite/:code" element={<JoinEquipment />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Home />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
            {/* Legacy /system redirect → /admin */}
            <Route path="/system" element={<Navigate to="/admin" replace />} />
            <Route path="/my-apps" element={<MyApps />} />
            <Route path="/review" element={<Review />} />
            <Route path="/resources" element={<Resources />} />

            {/* Этап 2: Новые страницы */}
            <Route path="/objects" element={<Objects />} />
            <Route path="/kp" element={<KP />} />
            <Route path="/support" element={<Support />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

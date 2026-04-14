import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import Layout from './components/Layout';

// Lazy-loaded pages
const Login = lazy(() => import('./pages/Login'));
const TMAAuth = lazy(() => import('./pages/TMAAuth'));
const MAXAuth = lazy(() => import('./pages/MAXAuth'));
const Home = lazy(() => import('./pages/Home'));
const Guide = lazy(() => import('./pages/Guide'));
const Updates = lazy(() => import('./pages/Updates'));
const System = lazy(() => import('./pages/System'));
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
    // Synchronous fast-path: if localStorage already has auth data, skip the check
    const role = localStorage.getItem('user_role');
    const tgId = localStorage.getItem('tg_id');
    if (role && tgId) return 'authenticated';
    return 'checking';
  });

  useEffect(() => {
    if (authState === 'authenticated') return;

    // Medium path: localStorage has session_token but missing role/tgId
    const token = localStorage.getItem('session_token');
    if (token) {
      axios.get(`/api/auth/session?token=${encodeURIComponent(token)}`)
        .then(res => {
          if (res.data?.tg_id) {
            localStorage.setItem('tg_id', String(res.data.tg_id));
            localStorage.setItem('user_role', res.data.role);
            setAuthState('authenticated');
          } else {
            localStorage.removeItem('session_token');
            setAuthState('unauthenticated');
          }
        })
        .catch(() => {
          localStorage.removeItem('session_token');
          setAuthState('unauthenticated');
        });
      return;
    }

    // Slow path: localStorage is completely empty — try HttpOnly cookie
    // Browser sends the cookie automatically with withCredentials
    axios.get('/api/auth/session')
      .then(res => {
        if (res.data?.tg_id) {
          localStorage.setItem('tg_id', String(res.data.tg_id));
          localStorage.setItem('user_role', res.data.role);
          setAuthState('authenticated');
        } else {
          setAuthState('unauthenticated');
        }
      })
      .catch(() => {
        setAuthState('unauthenticated');
      });
  }, [authState]);

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
  useEffect(() => {
    document.body.style.overscrollBehaviorY = 'none';

    if (window.Telegram?.WebApp?.disableVerticalSwipes) {
        window.Telegram.WebApp.disableVerticalSwipes();
    }
  }, []);

  return (
    <BrowserRouter>
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
            <Route path="/system" element={<System />} />
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

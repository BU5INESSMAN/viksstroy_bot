import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import TMAAuth from './pages/TMAAuth';
import MAXAuth from './pages/MAXAuth';
import Home from './pages/Home';
import Guide from './pages/Guide';
import Updates from './pages/Updates';
import System from './pages/System';
import MyApps from './pages/MyApps';
import Review from './pages/Review';
import Resources from './pages/Resources';

// Новые маршруты
import Objects from './pages/Objects';
import KP from './pages/KP';

// Подключаем страницы инвайтов
import JoinTeam from './pages/JoinTeam';
import JoinEquipment from './pages/JoinEquipment';

function ProtectedRoute({ children }) {
  const isAuth = localStorage.getItem('user_role');

  const isTMA = window.Telegram?.WebApp?.initData ||
                window.location.search.includes('tgWebAppData') ||
                window.location.hash.includes('tgWebAppData');

  const isMAX = window.location.pathname.includes('/max') ||
                window.location.search.includes('WebAppData') ||
                window.location.hash.includes('WebAppData');

  if (!isAuth) {
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

export default function App() {
  useEffect(() => {
    document.body.style.overscrollBehaviorY = 'none';

    if (window.Telegram?.WebApp?.disableVerticalSwipes) {
        window.Telegram.WebApp.disableVerticalSwipes();
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
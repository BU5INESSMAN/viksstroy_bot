import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import TMAAuth from './pages/TMAAuth';
import MAXAuth from './pages/MAXAuth';
import Home from './pages/Home';
import Teams from './pages/Teams';
import Guide from './pages/Guide';
import Updates from './pages/Updates';
import System from './pages/System';
import MyApps from './pages/MyApps';
import Review from './pages/Review';
import Equipment from './pages/Equipment';

function ProtectedRoute({ children }) {
  const isAuth = localStorage.getItem('user_role');

  // Проверяем, открыт ли сайт внутри Telegram
  const isTMA = window.Telegram?.WebApp?.initData ||
                window.location.search.includes('tgWebAppData') ||
                window.location.hash.includes('tgWebAppData');

  const isMAX = window.location.pathname.includes('/max');

  if (!isAuth) {
    if (isTMA) {
      // ВАЖНО: сохраняем путь (куда кликнул юзер) и хэш авторизации Телеграма
      return <Navigate to={`/tma?return_to=${window.location.pathname}${window.location.hash}`} replace />;
    }
    if (isMAX) {
      return <Navigate to={`/max?return_to=${window.location.pathname}${window.location.hash}`} replace />;
    }
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  useEffect(() => {
    // 1. Универсальная защита от свайпов (pull-to-refresh) для всех платформ
    document.body.style.overscrollBehaviorY = 'none';

    // 2. Специфичная защита от вертикальных свайпов для Telegram Mini App
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

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Home />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/updates" element={<Updates />} />
          <Route path="/system" element={<System />} />
          <Route path="/my-apps" element={<MyApps />} />
          <Route path="/review" element={<Review />} />
          <Route path="/equipment" element={<Equipment />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
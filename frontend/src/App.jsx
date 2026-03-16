import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

// ИМПОРТИРУЕМ ОБА ФАЙЛА АВТОРИЗАЦИИ
import Login from './pages/Login';       // Для обычного браузера
import TMAAuth from './pages/TMAAuth';   // Для Telegram Mini App (бота)

// ВНУТРЕННИЕ СТРАНИЦЫ
import Home from './pages/Home';
import Teams from './pages/Teams';
import Guide from './pages/Guide';
import Updates from './pages/Updates';
import System from './pages/System';
import MyApps from './pages/MyApps';
import Review from './pages/Review';
import Equipment from './pages/Equipment';

function ProtectedRoute({ children }) {
  // Если пользователь не авторизован, отправляем его на главную (Login)
  if (!localStorage.getItem('user_role')) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ========================================= */}
        {/* ПУБЛИЧНЫЕ МАРШРУТЫ (АВТОРИЗАЦИЯ)          */}
        {/* ========================================= */}

        {/* 1. Вход через обычный браузер (Safari, Chrome) */}
        <Route path="/" element={<Login />} />

        {/* 2. Вход через Telegram-бота (Mini App) */}
        <Route path="/tma" element={<TMAAuth />} />

        {/* ========================================= */}
        {/* ЗАЩИЩЕННЫЕ МАРШРУТЫ (ТОЛЬКО ДЛЯ СВОИХ)    */}
        {/* ========================================= */}
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

        {/* ========================================= */}
        {/* ЗАГЛУШКА ОТ БЕЛОГО ЭКРАНА                 */}
        {/* ========================================= */}
        {/* Если ссылка не существует, кидаем на страницу входа */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
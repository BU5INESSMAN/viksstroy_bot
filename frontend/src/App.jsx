import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import TMAAuth from './pages/TMAAuth';
import JoinTeam from './pages/JoinTeam';
import JoinEquipment from './pages/JoinEquipment';
import Guide from './pages/Guide';
import Layout from './components/Layout';
import Home from './pages/Home';
import Teams from './pages/Teams';
import Review from './pages/Review';
import System from './pages/System';
import Equipment from './pages/Equipment';

function App() {
  // ОПТИМИЗАЦИЯ ДЛЯ ТЕЛЕГРАМ: отключаем свайп вниз
  useEffect(() => {
      const tg = window.Telegram?.WebApp;
      if (tg) {
          tg.expand();
          if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      }
      document.body.style.overscrollBehaviorY = 'none'; // защита для мобильных браузеров
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/tma" element={<TMAAuth />} />
        <Route path="/invite/:code" element={<JoinTeam />} />
        <Route path="/equip-invite/:code" element={<JoinEquipment />} />
        <Route path="/guide" element={<Guide />} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="dashboard" element={<Home />} />
            <Route path="teams" element={<Teams />} />
            <Route path="review" element={<Review />} />
            <Route path="system" element={<System />} />
            <Route path="equipment" element={<Equipment />} />
        </Route>
      </Routes>
    </Router>
  );
}

const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem('user_role');
  return role ? children : <Navigate to="/" />;
};

export default App;
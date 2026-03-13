import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TMAAuth from './pages/TMAAuth';
import JoinTeam from './pages/JoinTeam';
import JoinEquipment from './pages/JoinEquipment';
import Equipment from './pages/Equipment';
import Guide from './pages/Guide';
import SupportButton from './components/SupportButton';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/tma" element={<TMAAuth />} />
        <Route path="/invite/:code" element={<JoinTeam />} />
        <Route path="/equip-invite/:code" element={<JoinEquipment />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/equipment" element={<ProtectedRoute><Equipment /></ProtectedRoute>} />
      </Routes>
      <SupportButton />
    </Router>
  );
}

const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem('user_role');
  return role ? children : <Navigate to="/" />;
};

export default App;
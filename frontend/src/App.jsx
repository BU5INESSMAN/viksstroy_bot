import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TMAAuth from './pages/TMAAuth';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/tma" element={<TMAAuth />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem('user_role');
  return role ? children : <Navigate to="/" />;
};

export default App;
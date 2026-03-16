import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Auth from './pages/TMAAuth';
import Home from './pages/Home';
import Teams from './pages/Teams';
import Guide from './pages/Guide';
import Updates from './pages/Updates'; // <--- Добавлен новый файл
import System from './pages/System';
import MyApps from './pages/MyApps';
import Review from './pages/Review';
import Equipment from './pages/Equipment';

function ProtectedRoute({ children }) {
  if (!localStorage.getItem('user_role')) return <Navigate to="/" />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Auth />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Home />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/updates" element={<Updates />} /> {/* <--- Добавлен роут */}
          <Route path="/system" element={<System />} />
          <Route path="/my-apps" element={<MyApps />} />
          <Route path="/review" element={<Review />} />
          <Route path="/equipment" element={<Equipment />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
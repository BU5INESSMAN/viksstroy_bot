import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function TMAAuth() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [tgUser, setTgUser] = useState(null);
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) tg.expand();

    const user = tg?.initDataUnsafe?.user;
    if (!user || !user.id) {
      setError("Откройте это приложение внутри Telegram.");
      return;
    }

    const formData = new FormData();
    formData.append('tg_id', user.id);
    formData.append('first_name', user.first_name || '');
    formData.append('last_name', user.last_name || '');

    axios.post('/api/tma/auth', formData)
      .then(res => {
        if (res.data.status === 'ok') {
          localStorage.setItem('user_role', res.data.role);
          navigate('/dashboard');
        } else if (res.data.status === 'needs_password') {
          setTgUser(res.data);
          setNeedsPassword(true);
        }
      })
      .catch((err) => {
        setError(err.response?.data?.detail || "Ошибка доступа");
      });
  }, [navigate]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData();
      formData.append('tg_id', tgUser.tg_id);
      formData.append('first_name', tgUser.first_name);
      formData.append('last_name', tgUser.last_name);
      formData.append('password', password);

      const response = await axios.post('/api/register_telegram', formData);
      if (response.data.status === 'ok') {
        localStorage.setItem('user_role', response.data.role);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      {!error && !needsPassword ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Подключение...</p>
        </div>
      ) : needsPassword ? (
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
          <h2 className="text-xl font-bold mb-4 text-center">Требуется регистрация</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <p className="text-sm text-gray-600 text-center mb-4">Введите пароль для привязки вашего аккаунта Telegram.</p>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Пароль доступа..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition">
              Войти
            </button>
          </form>
        </div>
      ) : (
        <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-sm w-full border-t-4 border-red-500">
          <span className="text-5xl block mb-4">❌</span>
          <h2 className="text-xl font-bold mb-2 text-gray-800">Ошибка</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}
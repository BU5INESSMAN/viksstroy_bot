import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function TMAAuth() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [tgUser, setTgUser] = useState(null);
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) tg.expand();

    const user = tg?.initDataUnsafe?.user;
    if (!user || !user.id) {
      setError("Пожалуйста, откройте это приложение внутри мессенджера Telegram.");
      return;
    }

    // Достаем из URL параметр return_to (куда юзер кликнул в боте)
    const searchParams = new URLSearchParams(location.search);
    const returnUrl = searchParams.get('return_to') || '/dashboard';

    const formData = new FormData();
    formData.append('tg_id', user.id);
    formData.append('first_name', user.first_name || '');
    formData.append('last_name', user.last_name || '');

    axios.post('/api/tma/auth', formData)
      .then(res => {
        if (res.data.status === 'ok') {
          localStorage.setItem('user_role', res.data.role);
          localStorage.setItem('tg_id', res.data.tg_id);
          navigate(returnUrl); // Направляем на нужную страницу
        } else if (res.data.status === 'needs_password') {
          setTgUser(res.data);
          setNeedsPassword(true);
        }
      })
      .catch((err) => {
        setError(err.response?.data?.detail || "Ошибка доступа к серверу");
      });
  }, [navigate, location]);

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
        localStorage.setItem('tg_id', response.data.tg_id);

        const searchParams = new URLSearchParams(location.search);
        const returnUrl = searchParams.get('return_to') || '/dashboard';
        navigate(returnUrl); // Направляем на нужную страницу
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      {!error && !needsPassword ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 font-bold text-lg tracking-wide animate-pulse">Запуск системы...</p>
        </div>
      ) : needsPassword ? (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-sm border border-transparent dark:border-gray-700">
          <h2 className="text-xl font-bold mb-4 text-center dark:text-white">Регистрация</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">Введите пароль от администратора.</p>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Системный пароль..."
                className="w-full px-4 py-3 border dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">
              Привязать аккаунт
            </button>
            {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}
          </form>
        </div>
      ) : (
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full border-t-4 border-red-500">
          <span className="text-6xl block mb-4">❌</span>
          <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">Доступ запрещен</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{error}</p>
          <a href="https://t.me/BU5INESSMAN" className="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold px-6 py-2.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition">
             Написать в техподдержку
          </a>
        </div>
      )}
    </div>
  );
}
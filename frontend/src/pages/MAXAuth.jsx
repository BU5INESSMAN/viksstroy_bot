import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function MAXAuth() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [maxUser, setMaxUser] = useState(null);
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // В MAX параметры пользователя передаются в URL при открытии приложения
    const searchParams = new URLSearchParams(location.search);
    const userId = searchParams.get('user_id');
    const firstName = searchParams.get('first_name') || '';
    const lastName = searchParams.get('last_name') || '';

    if (!userId) {
      setError("Пожалуйста, откройте это приложение внутри мессенджера MAX.");
      return;
    }

    const returnUrl = searchParams.get('return_to') || '/dashboard';

    const formData = new FormData();
    formData.append('max_id', userId);
    formData.append('first_name', firstName);
    formData.append('last_name', lastName);

    axios.post('/api/max/auth', formData)
      .then(res => {
        if (res.data.status === 'ok') {
          localStorage.setItem('user_role', res.data.role);
          localStorage.setItem('tg_id', res.data.tg_id);
          navigate(returnUrl);
        } else if (res.data.status === 'needs_password') {
          setMaxUser({ id: userId, first_name: firstName, last_name: lastName });
          setNeedsPassword(true);
        }
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Ошибка авторизации');
      });
  }, [navigate, location.search]);

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('max_id', maxUser.id);
      formData.append('first_name', maxUser.first_name || '');
      formData.append('last_name', maxUser.last_name || '');
      formData.append('password', password);

      const response = await axios.post('/api/max/register', formData);
      localStorage.setItem('user_role', response.data.role);
      localStorage.setItem('tg_id', response.data.tg_id);

      const searchParams = new URLSearchParams(location.search);
      const returnUrl = searchParams.get('return_to') || '/dashboard';
      navigate(returnUrl);
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      {!error && !needsPassword ? (
        <div className="flex flex-col items-center justify-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-gray-500 dark:text-gray-400 font-medium tracking-wide animate-pulse">Авторизация...</p>
        </div>
      ) : needsPassword ? (
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full border-t-4 border-blue-500">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shadow-inner">
                <span className="text-4xl text-blue-600 dark:text-blue-400">🛡️</span>
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">
            Привет, {maxUser?.first_name || 'Пользователь'}!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">
            Вы у нас впервые. Введите системный пароль для завершения регистрации.
          </p>
          <form onSubmit={handleRegister} className="space-y-4">
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
        </div>
      )}
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [tgUser, setTgUser] = useState(null);
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const telegramWrapperRef = useRef(null);

  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      setError('');
      try {
        const response = await axios.post('/api/telegram_auth', user);
        if (response.data.status === 'ok') {
          localStorage.setItem('user_role', response.data.role);
          localStorage.setItem('tg_id', response.data.tg_id);
          navigate('/dashboard');
        } else if (response.data.status === 'needs_password') {
          setTgUser(response.data);
          setNeedsPassword(true);
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Ошибка авторизации');
      }
    };

    if (!needsPassword && telegramWrapperRef.current && telegramWrapperRef.current.children.length === 0) {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', 'viksstroy_bot'); // ЗАМЕНИТЬ НА НИК БОТА
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.async = true;
      telegramWrapperRef.current.appendChild(script);
    }
  }, [navigate, needsPassword]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData();
      formData.append('tg_id', tgUser.tg_id);
      formData.append('first_name', tgUser.first_name);
      formData.append('last_name', tgUser.last_name);
      formData.append('password', password);
      formData.append('photo_url', tgUser.photo_url || '');

      const response = await axios.post('/api/register_telegram', formData);
      if (response.data.status === 'ok') {
        localStorage.setItem('user_role', response.data.role);
        localStorage.setItem('tg_id', response.data.tg_id);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="absolute top-6 right-6">
        <button onClick={() => navigate('/guide')} className="bg-white dark:bg-gray-800 shadow-sm border dark:border-gray-700 px-4 py-2 rounded-lg font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
          📖 Инструкция
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-sm border border-transparent dark:border-gray-700">
        <h1 className="text-2xl font-bold text-center text-blue-600 dark:text-blue-400 mb-6">ВИКС Расписание</h1>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded-xl mb-4 text-center">
            <p className="font-bold text-sm mb-1">Ошибка: {error}</p>
            <p className="text-xs">Нужна помощь? <a href="https://t.me/BU5INESSMAN" className="underline font-bold hover:text-red-900 dark:hover:text-red-200">Техподдержка</a></p>
          </div>
        )}

        {!needsPassword ? (
          <div>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-4 text-sm">Авторизуйтесь для доступа к панели</p>
            <div className="flex justify-center min-h-[40px]" ref={telegramWrapperRef}></div>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="text-center mb-4">
              <p className="font-bold text-gray-800 dark:text-gray-100 text-lg">Привет, {tgUser.first_name}!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Вы у нас впервые. Введите системный пароль для регистрации.</p>
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Системный пароль..."
                className="w-full px-4 py-3 border dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-md">
              Подтвердить и войти
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
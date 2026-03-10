import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const telegramWrapperRef = useRef(null);

  // Инициализация виджета Telegram
  useEffect(() => {
    // Эта функция вызовется, когда пользователь нажмет кнопку Telegram
    window.onTelegramAuth = async (user) => {
      setError('');
      try {
        const response = await axios.post('/api/telegram_auth', user);
        if (response.data.status === 'ok') {
          localStorage.setItem('user_role', response.data.role);
          navigate('/dashboard');
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Ошибка авторизации через Telegram');
      }
    };

    // Создаем скрипт виджета
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    // ВАЖНО: Замени на username твоего бота!
    script.setAttribute('data-telegram-login', 'viksstroy_bot');
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    // Вставляем скрипт в наш div, если он еще пустой
    if (telegramWrapperRef.current && telegramWrapperRef.current.children.length === 0) {
      telegramWrapperRef.current.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
    };
  }, [navigate]);

  // Обычный вход по паролю
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const formData = new FormData();
      formData.append('password', password);

      const response = await axios.post('/api/login', formData);
      if (response.data.status === 'ok') {
        localStorage.setItem('user_role', response.data.role);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка соединения с сервером');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-6">ВИКС Расписание</h1>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-sm text-center font-medium">
            {error}
          </div>
        )}

        {/* Контейнер для кнопки Telegram */}
        <div className="mb-6 flex justify-center">
          <div ref={telegramWrapperRef}></div>
        </div>

        <div className="flex items-center my-4 before:flex-1 before:border-t before:border-gray-300 before:mt-0.5 after:flex-1 after:border-t after:border-gray-300 after:mt-0.5">
          <p className="text-center font-semibold mx-4 mb-0 text-gray-400 text-sm">ИЛИ</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пароль доступа</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Введите пароль..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition duration-200 font-medium shadow-sm">
            Войти по паролю
          </button>
        </form>
      </div>
    </div>
  );
}
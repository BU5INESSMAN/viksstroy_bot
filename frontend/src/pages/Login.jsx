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
      // ВАЖНО: ЗАМЕНИ ТЕКСТ НИЖЕ НА ЮЗЕРНЕЙМ ТВОЕГО БОТА (БЕЗ @) !!!
      script.setAttribute('data-telegram-login', 'viksstroy_bot');
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
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-6">ВИКС Расписание</h1>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-sm text-center font-medium">
            {error}
          </div>
        )}

        {!needsPassword ? (
          <div>
            <p className="text-center text-gray-600 mb-4 text-sm">Авторизуйтесь для доступа к панели</p>
            <div className="flex justify-center" ref={telegramWrapperRef}></div>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="text-center mb-4">
              <p className="font-medium text-gray-800">Привет, {tgUser.first_name}!</p>
              <p className="text-sm text-gray-500">Вы у нас впервые. Введите системный пароль для регистрации.</p>
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Системный пароль..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition">
              Подтвердить и войти
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
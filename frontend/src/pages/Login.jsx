import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [tgUser, setTgUser] = useState(null);
  const [password, setPassword] = useState('');

  // Состояние для входа по коду из бота
  const [loginCode, setLoginCode] = useState('');

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
      script.setAttribute('data-telegram-login', 'viksstroy_bot');
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      telegramWrapperRef.current.appendChild(script);
    }
  }, [navigate, needsPassword]);

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('tg_id', tgUser.id);
      formData.append('first_name', tgUser.first_name || '');
      formData.append('last_name', tgUser.last_name || '');
      formData.append('password', password);
      formData.append('photo_url', tgUser.photo_url || '');

      const response = await axios.post('/api/register_telegram', formData);
      localStorage.setItem('user_role', response.data.role);
      localStorage.setItem('tg_id', response.data.tg_id);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  const handleCodeLogin = async (e) => {
      e.preventDefault();
      setError('');
      try {
          const fd = new FormData();
          fd.append('code', loginCode);
          const res = await axios.post('/api/auth/code', fd);

          if (res.data.status === 'ok') {
              localStorage.setItem('user_role', res.data.role);
              localStorage.setItem('tg_id', res.data.tg_id);
              navigate('/dashboard');
          }
      } catch (err) {
          setError(err.response?.data?.detail || 'Ошибка авторизации. Проверьте код.');
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="max-w-md w-full">

        {/* Шапка логотип */}
        <div className="flex flex-col items-center justify-center mb-10">
            <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-3xl shadow-xl flex items-center justify-center mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                <div className="w-16 h-16 bg-blue-600 dark:bg-blue-500 rounded-2xl flex items-center justify-center shadow-inner">
                    <span className="text-3xl font-black text-white">В</span>
                </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center">ВИКС Расписание</h1>
            <p className="text-gray-500 dark:text-gray-400 text-center font-medium">Система управления строительными ресурсами</p>
        </div>

        {/* Карточка авторизации */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 border border-gray-100 dark:border-gray-700 relative overflow-hidden">

        {/* Декоративные элементы */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-50 dark:bg-gray-700 rounded-full blur-3xl opacity-50"></div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 rounded-r-xl">
            <p className="font-bold text-sm">Ошибка</p>
            <p className="text-sm">{error}</p>
            <p className="text-xs mt-2 font-medium"><a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900 dark:hover:text-red-200">Техподдержка</a></p>
          </div>
        )}

        {!needsPassword ? (
          <div>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-4 text-sm font-medium">Авторизуйтесь для доступа к панели</p>

            {/* Виджет Telegram */}
            <div className="flex justify-center min-h-[40px] mb-8" ref={telegramWrapperRef}></div>

            {/* Вход по коду из бота */}
            <div className="mt-8 border-t border-gray-100 dark:border-gray-700 pt-8">
                <p className="text-center text-gray-500 dark:text-gray-400 mb-4 text-xs font-bold uppercase tracking-wider">Или войдите по коду из бота</p>
                <form onSubmit={handleCodeLogin} className="flex space-x-2">
                    <input
                        type="text"
                        maxLength={6}
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        required
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-center font-mono text-lg tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                    />
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md active:scale-95">
                        Войти
                    </button>
                </form>
            </div>
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
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all active:scale-95">
              Создать аккаунт
            </button>
            <button type="button" onClick={() => {setNeedsPassword(false); setError('');}} className="w-full bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium py-3 px-4 rounded-xl transition-all">
                Отмена
            </button>
          </form>
        )}
        </div>

        {/* Футер */}
        <div className="text-center mt-8">
            <p className="text-gray-400 dark:text-gray-500 text-xs flex items-center justify-center space-x-1">
                <span>© {new Date().getFullYear()} ВИКС Строй.</span>
            </p>
        </div>
      </div>
    </div>
  );
}
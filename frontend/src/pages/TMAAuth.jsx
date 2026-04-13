import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { ShieldAlert, KeyRound, XCircle } from 'lucide-react';

export default function TMAAuth() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [tgUser, setTgUser] = useState(null);
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    function tryAuth() {
      const tg = window.Telegram?.WebApp;
      if (!tg || !tg.initDataUnsafe?.user?.id) return false;

      tg.ready();
      tg.expand();

      const user = tg.initDataUnsafe.user;

      const searchParams = new URLSearchParams(location.search);
      const returnUrl = searchParams.get('return_to') || '/dashboard';

      const formData = new FormData();
      formData.append('tg_id', user.id);
      formData.append('first_name', user.first_name || '');
      formData.append('last_name', user.last_name || '');

      axios.post('/api/tma/auth', formData)
        .then(res => {
          if (cancelled) return;
          if (res.data.status === 'ok') {
            localStorage.setItem('user_role', res.data.role);
            localStorage.setItem('tg_id', res.data.tg_id);
            if (res.data.session_token) localStorage.setItem('session_token', res.data.session_token);
            navigate(returnUrl);
          } else if (res.data.status === 'needs_password') {
            setTgUser(res.data);
            setNeedsPassword(true);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.response?.data?.detail || "Ошибка доступа к серверу");
        });

      return true;
    }

    if (tryAuth()) return () => { cancelled = true; };

    // SDK may not be injected yet — poll briefly
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryAuth() || attempts >= 15) {
        clearInterval(interval);
        if (attempts >= 15 && !cancelled) {
          setError("Пожалуйста, откройте это приложение внутри мессенджера Telegram.");
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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
        if (response.data.session_token) localStorage.setItem('session_token', response.data.session_token);
        const searchParams = new URLSearchParams(location.search);
        const returnUrl = searchParams.get('return_to') || '/dashboard';
        navigate(returnUrl);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      {!error && !needsPassword ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-500 mx-auto mb-5"></div>
          <p className="text-gray-500 dark:text-gray-400 font-bold tracking-wide animate-pulse">Запуск системы...</p>
        </div>
      ) : needsPassword ? (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-xl w-full max-w-sm border border-gray-100 dark:border-gray-700">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-center dark:text-white">Регистрация</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">Введите системный пароль от администратора.</p>
          <form onSubmit={handleRegister} className="space-y-4">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Пароль..." className="w-full px-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner transition-colors text-center font-bold tracking-widest" />
            <button type="submit" className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95">Привязать аккаунт</button>
            {error && <p className="text-red-500 text-sm text-center font-medium mt-2">{error}</p>}
          </form>
        </div>
      ) : (
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-red-500">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">Доступ запрещен</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{error}</p>
          <a href="https://t.me/BU5INESSMAN" className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 font-bold px-6 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-95 border border-gray-200 dark:border-gray-600">
             <ShieldAlert className="w-4 h-4" /> Написать в поддержку
          </a>
        </div>
      )}
    </div>
  );
}
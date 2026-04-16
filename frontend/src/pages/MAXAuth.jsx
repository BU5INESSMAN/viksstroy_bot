import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { KeyRound, XCircle, ShieldCheck } from 'lucide-react';
import { saveAuthData } from '../utils/tokenStorage';

export default function MAXAuth() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [maxUser, setMaxUser] = useState(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  const getParam = (key) => {
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.replace('#', '?'));
    return searchParams.get(key) || hashParams.get(key);
  };

  useEffect(() => {
    // Check if a one-time code is provided in the URL (deep-link from bot)
    const urlCode = getParam('code');
    if (urlCode) {
      submitCode(urlCode);
      return;
    }

    // Detect MAX user info from URL/SDK (for display only, NOT for auth)
    let userId = getParam('user_id') || getParam('max_user_id') || getParam('max_id') || getParam('id');
    let firstName = getParam('first_name') || '';
    let lastName = getParam('last_name') || '';

    const webAppDataStr = getParam('WebAppData') || getParam('maxWebAppData') || getParam('tgWebAppData');
    if (webAppDataStr) {
      try {
        const params = new URLSearchParams(webAppDataStr);
        const userParam = params.get('user');
        if (userParam) {
          const u = JSON.parse(userParam);
          userId = u.id || u.user_id || userId;
          firstName = u.first_name || firstName;
          lastName = u.last_name || lastName;
        }
      } catch(e) {}
    }

    const userStr = getParam('user');
    if (userStr && !webAppDataStr) {
      try {
        const u = JSON.parse(decodeURIComponent(userStr));
        userId = u.id || u.user_id || userId;
        firstName = u.first_name || firstName;
        lastName = u.last_name || lastName;
      } catch(e) {}
    }

    if (window.max?.initDataUnsafe?.user) {
      const u = window.max.initDataUnsafe.user;
      userId = u.id || userId;
      firstName = u.first_name || firstName;
      lastName = u.last_name || lastName;
    }

    // Store detected info for registration form (if needed later)
    if (userId) {
      setMaxUser({ id: userId, first_name: firstName, last_name: lastName });
    }

    // Show code entry form — no auto-auth with raw max_id
    setNeedsCode(true);
    setLoading(false);
  }, [navigate, location]);

  const submitCode = async (codeValue) => {
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('code', codeValue);

      const res = await axios.post('/api/max/auth', formData);
      if (res.data.status === 'ok') {
        await saveAuthData(res.data.tg_id, res.data.role, res.data.session_token);
        const returnUrl = getParam('return_to') || '/dashboard';
        navigate(returnUrl);
      } else if (res.data.status === 'needs_password') {
        setMaxUser(prev => ({ ...prev, id: res.data.max_id }));
        setNeedsCode(false);
        setNeedsPassword(true);
        setLoading(false);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный или истёкший код');
      setLoading(false);
      setNeedsCode(true);
    }
  };

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    if (code.trim()) submitCode(code.trim());
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData();
      formData.append('max_id', maxUser?.id || 0);
      formData.append('first_name', maxUser?.first_name || '');
      formData.append('last_name', maxUser?.last_name || '');
      formData.append('password', password);

      const response = await axios.post('/api/max/register', formData);
      await saveAuthData(response.data.tg_id, response.data.role, response.data.session_token);

      const returnUrl = getParam('return_to') || '/dashboard';
      navigate(returnUrl);
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      {loading && !error ? (
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-500 mx-auto mb-1"></div>
          <p className="text-gray-500 dark:text-gray-400 font-bold tracking-wide animate-pulse">Авторизация...</p>
        </div>
      ) : needsCode ? (
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-blue-500">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">
            Вход через MAX
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6 font-medium">
            Отправьте <span className="font-bold text-blue-600 dark:text-blue-400">/login</span> боту в MAX и введите полученный код.
          </p>
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="Код из бота..."
              autoComplete="off"
              className="w-full px-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner transition-colors text-center font-bold tracking-widest"
            />
            <button type="submit" className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95">
              Войти
            </button>
            {error && <p className="text-red-500 text-sm font-medium mt-2">{error}</p>}
          </form>
        </div>
      ) : needsPassword ? (
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-blue-500">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center shadow-inner transform rotate-3">
              <span className="text-3xl text-blue-600 dark:text-blue-400 font-black">M</span>
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">
            Привет, {maxUser?.first_name || 'Пользователь'}!
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6 font-medium">
            Вы у нас впервые. Введите системный пароль для завершения регистрации.
          </p>
          <form onSubmit={handleRegister} className="space-y-4">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Системный пароль..." className="w-full px-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner transition-colors text-center font-bold tracking-widest" />
            <button type="submit" className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95">Привязать аккаунт</button>
            {error && <p className="text-red-500 text-sm font-medium mt-2">{error}</p>}
          </form>
        </div>
      ) : error ? (
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-red-500">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">Доступ запрещен</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{error}</p>
        </div>
      ) : null}
    </div>
  );
}

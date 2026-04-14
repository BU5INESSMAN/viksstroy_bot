import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { KeyRound, XCircle } from 'lucide-react';
import { saveAuthData } from '../utils/tokenStorage';

export default function MAXAuth() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [maxUser, setMaxUser] = useState(null);
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const getParam = (key) => {
        const searchParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.replace('#', '?'));
        return searchParams.get(key) || hashParams.get(key);
    };

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

    if (!userId) {
      setError("Доступ запрещен. Пожалуйста, откройте это приложение через системную кнопку внутри мессенджера MAX.");
      return;
    }

    const returnUrl = getParam('return_to') || '/dashboard';
    const formData = new FormData();
    formData.append('max_id', userId);
    formData.append('first_name', firstName);
    formData.append('last_name', lastName);

    axios.post('/api/max/auth', formData)
      .then(res => {
        if (res.data.status === 'ok') {
          saveAuthData(res.data.tg_id, res.data.role, res.data.session_token);
          navigate(returnUrl);
        } else if (res.data.status === 'needs_password') {
          setMaxUser({ id: userId, first_name: firstName, last_name: lastName });
          setNeedsPassword(true);
        }
      })
      .catch(err => setError(err.response?.data?.detail || 'Ошибка авторизации'));
  }, [navigate, location]);

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('max_id', maxUser.id);
      formData.append('first_name', maxUser.first_name || '');
      formData.append('last_name', maxUser.last_name || '');
      formData.append('password', password);

      const response = await axios.post('/api/max/register', formData);
      await saveAuthData(response.data.tg_id, response.data.role, response.data.session_token);

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
            <div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-500 mx-auto mb-1"></div>
            <p className="text-gray-500 dark:text-gray-400 font-bold tracking-wide animate-pulse">Авторизация...</p>
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
      ) : (
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-red-500">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">Доступ запрещен</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{error}</p>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function MAXAuth() {
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [maxUser, setMaxUser] = useState(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Включаем защиту от свайпов
    document.body.style.overscrollBehaviorY = 'none';

    const searchParams = new URLSearchParams(location.search);

    // Получаем параметры, которые зашил бот в ссылку
    const userId = searchParams.get('user_id');
    const firstName = searchParams.get('first_name') || '';
    const lastName = searchParams.get('last_name') || '';

    if (userId) {
        handleDirectAuth(userId, firstName, lastName);
    } else {
        setError("Пожалуйста, откройте платформу по ссылке из сообщения бота @viksstroy");
        setIsLoading(false);
    }
  }, [location]);

  const handleDirectAuth = async (maxId, firstName, lastName) => {
    try {
        const formData = new FormData();
        formData.append('max_id', maxId);
        formData.append('first_name', firstName);
        formData.append('last_name', lastName);

        const response = await axios.post('/api/max/auth', formData);

        if (response.data.status === 'ok') {
            localStorage.setItem('user_role', response.data.role);
            localStorage.setItem('tg_id', response.data.tg_id);

            const searchParams = new URLSearchParams(location.search);
            const returnUrl = searchParams.get('return_to') || '/dashboard';
            navigate(returnUrl);
        } else if (response.data.status === 'needs_password') {
            setMaxUser({ max_id: maxId, first_name: firstName, last_name: lastName });
            setNeedsPassword(true);
            setIsLoading(false);
        }
    } catch (err) {
        setError(err.response?.data?.detail || 'Ошибка авторизации');
        setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
        const formData = new FormData();
        formData.append('max_id', maxUser.max_id);
        formData.append('first_name', maxUser.first_name);
        formData.append('last_name', maxUser.last_name);
        formData.append('password', password);

        const response = await axios.post('/api/max/register', formData);

        if (response.data.status === 'ok') {
            localStorage.setItem('user_role', response.data.role);
            localStorage.setItem('tg_id', response.data.tg_id);
            navigate('/dashboard');
        }
    } catch (err) {
        setError(err.response?.data?.detail || 'Неверный пароль');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
        <div className="space-y-4 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">Вход в систему...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden transition-colors border border-gray-100 dark:border-gray-700">
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4 transform rotate-3">
            <span className="text-4xl font-black text-blue-600">В</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">ВИКС Расписание</h2>
          <p className="text-blue-100 text-sm mt-2 opacity-90">Единая система управления ресурсами</p>
        </div>

        <div className="p-8">
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm text-center font-medium">
                    ⚠️ {error}
                </div>
            )}

            {needsPassword ? (
                <form onSubmit={handleRegister} className="space-y-4">
                    <div className="text-center mb-4">
                        <p className="font-bold text-gray-800 dark:text-gray-100 text-lg">Привет, {maxUser.first_name}!</p>
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
                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95">
                        Зарегистрироваться
                    </button>
                </form>
            ) : null}
        </div>
      </div>
    </div>
  );
}
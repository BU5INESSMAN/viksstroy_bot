import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function MAXAuth() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Дублируем защиту от свайпов для страницы входа
    document.body.style.overscrollBehaviorY = 'none';
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('code', code.trim());

      const response = await axios.post('/api/max/web_auth', formData);

      if (response.data.status === 'ok') {
        localStorage.setItem('user_role', response.data.role);
        localStorage.setItem('tg_id', response.data.tg_id);

        const searchParams = new URLSearchParams(location.search);
        const returnUrl = searchParams.get('return_to') || '/dashboard';
        navigate(returnUrl);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Неверный или устаревший код');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden transition-colors border border-gray-100 dark:border-gray-700">
        <div className="bg-green-600 p-8 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4 transform rotate-3">
            <span className="text-4xl font-black text-green-600">M</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Авторизация MAX</h2>
          <p className="text-green-100 text-sm mt-2 opacity-90">Введите код из бота @viksstroy</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength="6"
                placeholder="000000"
                className="w-full px-4 py-4 text-center text-2xl tracking-widest font-mono border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 uppercase"
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center font-bold">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || code.length < 6}
              className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Проверка...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
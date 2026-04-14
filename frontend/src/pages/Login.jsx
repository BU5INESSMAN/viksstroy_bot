import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, MessageCircle, Send, XCircle } from 'lucide-react';
import { saveAuthData, loadAuthData } from '../utils/tokenStorage';

export default function Login() {
  const [error, setError] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const navigate = useNavigate();

  // Redirect already-authenticated users to dashboard
  useEffect(() => {
    loadAuthData().then(stored => {
      if (stored?.tg_id && stored?.user_role) {
        navigate('/dashboard', { replace: true });
      } else {
        setChecking(false);
      }
    }).catch(() => setChecking(false));
  }, [navigate]);

  const handleCodeLogin = async (e) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
          const fd = new FormData();
          fd.append('code', loginCode);
          const res = await axios.post('/api/auth/code', fd);

          if (res.data.status === 'ok') {
              await saveAuthData(res.data.tg_id, res.data.role, res.data.session_token);
              navigate('/dashboard');
          }
      } catch (err) {
          setError(err.response?.data?.detail || 'Ошибка авторизации. Проверьте правильность кода.');
      } finally {
          setIsLoading(false);
      }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="max-w-md w-full">

        <div className="flex flex-col items-center justify-center mb-10">
            <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-3xl shadow-xl flex items-center justify-center mb-6 transform rotate-3 hover:rotate-0 transition-all duration-300 relative z-10 border border-gray-100 dark:border-gray-700">
                <div className="w-16 h-16 bg-blue-600 dark:bg-blue-500 rounded-2xl flex items-center justify-center shadow-inner">
                    <ShieldCheck className="w-10 h-10 text-white" />
                </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center relative z-10 tracking-tight">ВИКС Расписание</h1>
            <p className="text-gray-500 dark:text-gray-400 text-center font-medium relative z-10">Система управления ресурсами</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-2xl p-6 sm:p-8 border border-gray-100 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500"></div>
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-50 dark:bg-gray-700 rounded-full blur-3xl opacity-50"></div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 rounded-r-xl relative z-10 flex gap-3">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold text-sm">Ошибка</p>
                    <p className="text-sm mt-0.5">{error}</p>
                    <p className="text-xs mt-2 font-medium">
                        <a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900 dark:hover:text-red-200">Техподдержка</a>
                    </p>
                </div>
              </div>
            )}

            <div className="relative z-10">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5 text-center">Вход в систему</h2>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 mb-6 border border-blue-100 dark:border-blue-800/50 shadow-inner">
                    <p className="text-sm text-gray-800 dark:text-gray-200 mb-3 font-medium">
                        Для входа на платформу с компьютера или браузера вам понадобится одноразовый код.
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-300 mb-2 font-bold uppercase tracking-wide">Как получить код?</p>
                    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                        <li className="flex items-start gap-2">
                            <MessageCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <span>Откройте бота <a href="https://max.ru/id222264297116_bot" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">MAX</a> или <a href="https://t.me/viksstroy_bot" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Telegram</a></span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Send className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span>Отправьте команду <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 font-mono font-bold shadow-sm">/web</code></span>
                        </li>
                    </ul>
                </div>

                <form onSubmit={handleCodeLogin} className="flex flex-col space-y-4">
                    <input
                        type="text"
                        maxLength={6}
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        required
                        className="w-full px-4 py-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-center font-mono text-3xl sm:text-4xl tracking-[0.3em] sm:tracking-[0.5em] placeholder:tracking-normal placeholder:font-sans placeholder:text-lg shadow-inner"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || loginCode.length < 6}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg active:scale-[0.98] text-base flex justify-center items-center"
                    >
                        {isLoading ? <span className="animate-pulse">Проверка кода...</span> : 'Войти в панель'}
                    </button>
                </form>
            </div>
        </div>

        <div className="text-center mt-8 relative z-10">
            <p className="text-gray-400 dark:text-gray-500 text-xs font-medium">© {new Date().getFullYear()} ВИКС Строй.</p>
        </div>
      </div>
    </div>
  );
}
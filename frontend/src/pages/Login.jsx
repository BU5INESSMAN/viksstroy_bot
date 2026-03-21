import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const [error, setError] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  const handleCodeLogin = async (e) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

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
          setError(err.response?.data?.detail || 'Ошибка авторизации. Проверьте правильность кода.');
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="max-w-md w-full">

        {/* Шапка логотип */}
        <div className="flex flex-col items-center justify-center mb-10">
            <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-3xl shadow-xl flex items-center justify-center mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-300 relative z-10">
                <div className="w-16 h-16 bg-blue-600 dark:bg-blue-500 rounded-2xl flex items-center justify-center shadow-inner">
                    <span className="text-3xl font-black text-white">В</span>
                </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center relative z-10">ВИКС Расписание</h1>
            <p className="text-gray-500 dark:text-gray-400 text-center font-medium relative z-10">Система управления строительными ресурсами</p>
        </div>

        {/* Карточка авторизации */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 sm:p-8 border border-gray-100 dark:border-gray-700 relative overflow-hidden">

            {/* Декоративные элементы */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-50 dark:bg-gray-700 rounded-full blur-3xl opacity-50"></div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 rounded-r-xl relative z-10">
                <p className="font-bold text-sm">Ошибка</p>
                <p className="text-sm">{error}</p>
                <p className="text-xs mt-2 font-medium">
                    <a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900 dark:hover:text-red-200">
                        Техподдержка
                    </a>
                </p>
              </div>
            )}

            <div className="relative z-10">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5 text-center">Вход в систему</h2>

                {/* Блок с инструкцией */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 mb-6 border border-blue-100 dark:border-blue-800/50 shadow-inner">
                    <p className="text-sm text-gray-800 dark:text-gray-200 mb-3 font-medium">
                        Для входа на платформу с компьютера или браузера вам понадобится одноразовый 6-значный код.
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-300 mb-2 font-bold uppercase tracking-wide">Как получить код?</p>
                    <ol className="list-decimal pl-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                        <li>Откройте нашего бота в мессенджере <a href="https://max.ru/id222264297116_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">MAX</a> или <a href="https://t.me/viksstroy_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Telegram</a></li>
                        <li>Отправьте боту команду <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 font-mono font-bold shadow-sm">/web</code></li>
                        <li>Введите полученный код в поле ниже 👇</li>
                    </ol>
                </div>

                <form onSubmit={handleCodeLogin} className="flex flex-col space-y-4">
                    <input
                        type="text"
                        maxLength={6}
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        required
                        className="w-full px-4 py-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-center font-mono text-3xl sm:text-4xl tracking-[0.3em] sm:tracking-[0.5em] placeholder:tracking-normal placeholder:font-sans placeholder:text-lg shadow-inner"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || loginCode.length < 6}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg active:scale-95 text-lg flex justify-center items-center"
                    >
                        {isLoading ? (
                            <span className="animate-pulse">Проверка кода...</span>
                        ) : (
                            'Войти'
                        )}
                    </button>
                </form>
            </div>
        </div>

        {/* Футер */}
        <div className="text-center mt-8 relative z-10">
            <p className="text-gray-400 dark:text-gray-500 text-xs flex items-center justify-center space-x-1">
                <span>© {new Date().getFullYear()} ВИКС Строй.</span>
            </p>
        </div>
      </div>
    </div>
  );
}
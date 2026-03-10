import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function TMAAuth() {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand();
    }

    const user = tg?.initDataUnsafe?.user;

    if (!user || !user.id) {
      setError("Пожалуйста, откройте это приложение внутри Telegram.");
      return;
    }

    const formData = new FormData();
    formData.append('tg_id', user.id);

    axios.post('/api/tma/auth', formData)
      .then(res => {
        if (res.data.status === 'ok') {
          localStorage.setItem('user_role', res.data.role);
          navigate('/dashboard');
        }
      })
      .catch(() => {
        setError("Доступ запрещен. Вы не зарегистрированы в системе ВИКС или были заблокированы.");
      });
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      {!error ? (
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600 font-medium">Подключение к системе ВИКС...</p>
        </div>
      ) : (
        <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-sm w-full border-t-4 border-red-500">
          <span className="text-5xl block mb-4">❌</span>
          <h2 className="text-xl font-bold mb-2 text-gray-800">Ошибка доступа</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function JoinEquipment() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [equipData, setEquipData] = useState(null);
  const [error, setError] = useState('');
  const [tgId, setTgId] = useState(localStorage.getItem('tg_id') || null);

  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);

  useEffect(() => {
    axios.get(`/api/equipment/invite/${code}`)
      .then(res => setEquipData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Ссылка недействительна"));
  }, [code]);

  useEffect(() => {
    // УНИВЕРСАЛЬНЫЙ ПАРСЕР ДЛЯ TELEGRAM И MAX
    const getParam = (key) => {
        const searchParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.replace('#', '?'));
        return searchParams.get(key) || hashParams.get(key);
    };

    let detectedUserId = tgId;

    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
        detectedUserId = window.Telegram.WebApp.initDataUnsafe.user.id;
    }

    const webAppDataStr = getParam('WebAppData') || getParam('tgWebAppData');
    if (webAppDataStr) {
        try {
            const params = new URLSearchParams(webAppDataStr);
            const userParam = params.get('user');
            if (userParam) {
                const u = JSON.parse(userParam);
                if (u.id || u.user_id) detectedUserId = u.id || u.user_id;
            }
        } catch(e) {}
    }

    if (!detectedUserId) {
        const maxId = getParam('user_id') || getParam('max_id');
        if (maxId) detectedUserId = maxId;
    }

    if (detectedUserId && detectedUserId !== tgId) {
        setTgId(detectedUserId);
        localStorage.setItem('tg_id', detectedUserId);
    }
  }, [location, tgId]);

  const handleJoin = async () => {
      if (!tgId) return alert("Не удалось определить ваш ID. Пожалуйста, откройте ссылку из бота.");
      try {
          const fd = new FormData();
          fd.append('invite_code', code);
          fd.append('tg_id', tgId);
          await axios.post('/api/equipment/invite/join', fd);
          alert("Успешно привязано!");

          if (window.location.search.includes('WebAppData') || window.location.pathname.includes('/max')) {
               navigate('/max');
          } else if (window.Telegram?.WebApp?.initData) {
               navigate('/tma');
          } else {
               navigate('/');
          }
      } catch (e) {
          alert(e.response?.data?.detail || "Ошибка привязки");
      }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-sm w-full border-t-4 border-red-500">
            <span className="text-6xl block mb-4">❌</span>
            <h2 className="text-xl font-bold mb-2 dark:text-white">Ошибка</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="w-full max-w-md">
        {!equipData ? (
          <div className="flex justify-center p-10"><div className="animate-spin h-10 w-10 border-b-2 border-blue-600 rounded-full"></div></div>
        ) : (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-xl text-center">
            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl shadow-inner">🚜</div>
            <h2 className="text-2xl font-bold dark:text-white mb-2">Привязка техники</h2>
            <div className="p-4 bg-gray-50 dark:bg-gray-750 rounded-2xl mb-6 border border-gray-100 dark:border-gray-600">
                <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Техника</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{equipData.name}</p>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6 font-medium text-sm">Подтвердите закрепление этой техники за вашим аккаунтом мессенджера.</p>
            <button onClick={() => setConfirmModalOpen(true)} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-blue-700 transition active:scale-95">
                🔗 Подтвердить привязку
            </button>
          </div>
        )}
      </div>

      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl">
                <h3 className="text-2xl font-bold mb-2 dark:text-white">Подтверждение</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">Привязать вас как водителя для: <br/><b className="text-xl text-gray-900 dark:text-white block mt-1">{equipData.name}</b></p>
                <div className="flex space-x-3">
                    <button onClick={() => setConfirmModalOpen(false)} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-3.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition">Отмена</button>
                    <button onClick={handleJoin} className="w-1/2 bg-blue-600 py-3.5 rounded-xl font-bold text-white shadow-lg hover:bg-blue-700 transition active:scale-95">Да, это я</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
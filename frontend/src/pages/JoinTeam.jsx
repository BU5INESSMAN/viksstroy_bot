import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function JoinTeam() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [teamData, setTeamData] = useState(null);
  const [error, setError] = useState('');
  const [tgId, setTgId] = useState(localStorage.getItem('tg_id') || null);

  const [selectedWorker, setSelectedWorker] = useState(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');

  useEffect(() => {
    axios.get(`/api/invite/${code}`)
      .then(res => setTeamData(res.data))
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

    // 1. Проверяем Telegram WebApp JS Bridge
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
        detectedUserId = window.Telegram.WebApp.initDataUnsafe.user.id;
    }

    // 2. Проверяем параметры в URL (MAX WebAppData или Telegram params)
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

    // 3. Прямые параметры MAX
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
        fd.append('worker_id', selectedWorker.id);
        fd.append('tg_id', tgId);

        await axios.post('/api/invite/join', fd);

        alert("Успешно привязано!");

        // Редирект в зависимости от среды
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
        {!teamData ? (
          <div className="flex justify-center p-10"><div className="animate-spin h-10 w-10 border-b-2 border-blue-600 rounded-full"></div></div>
        ) : (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-xl">
            <div className="text-center mb-8">
                <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl shadow-inner">👷‍♂️</div>
                <h2 className="text-2xl font-bold dark:text-white mb-2">Приглашение</h2>
                <p className="text-gray-600 dark:text-gray-300">Бригада: <b className="text-gray-900 dark:text-white">{teamData.team_name}</b></p>
            </div>

            <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider text-center">Выберите ваш профиль из списка:</p>

            {teamData.unclaimed_workers.length === 0 ? (
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Свободных мест нет или все участники уже привязали свои аккаунты.</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {teamData.unclaimed_workers.map(w => (
                    <button key={w.id} onClick={() => { setSelectedWorker(w); setConfirmModalOpen(true); }} className="w-full text-left p-4 bg-gray-50 dark:bg-gray-750 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 rounded-2xl transition-all group active:scale-[0.98]">
                      <p className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-blue-700 dark:group-hover:text-blue-400 text-lg">{w.fio}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">{w.position}</p>
                    </button>
                  ))}
                </div>
            )}
          </div>
        )}
      </div>

      {isConfirmModalOpen && selectedWorker && (
        <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl">
                <h3 className="text-2xl font-bold mb-2 dark:text-white">Подтверждение</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">Привязать ваш мессенджер к профилю: <br/><b className="text-xl text-gray-900 dark:text-white mt-1 block">{selectedWorker.fio}</b></p>

                {/* Пароль мы больше не требуем, так как ссылка уже безопасная */}
                <div className="flex space-x-3">
                    <button onClick={() => setConfirmModalOpen(false)} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-3.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition">Отмена</button>
                    <button onClick={handleJoin} className="w-1/2 bg-blue-600 py-3.5 rounded-xl font-bold text-white shadow-lg hover:bg-blue-700 transition active:scale-95">Привязать</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
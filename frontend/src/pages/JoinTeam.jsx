import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { HardHat, User, CheckCircle, XCircle } from 'lucide-react';

export default function JoinTeam() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [teamData, setTeamData] = useState(null);
  const [error, setError] = useState('');
  const [tgId, setTgId] = useState(localStorage.getItem('tg_id') || null);

  const [selectedWorker, setSelectedWorker] = useState(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);

  useEffect(() => {
    axios.get(`/api/invite/${code}`)
      .then(res => setTeamData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Ссылка недействительна"));
  }, [code]);

  useEffect(() => {
    const getParam = (key) => {
        const searchParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.replace('#', '?'));
        return searchParams.get(key) || hashParams.get(key);
    };

    let detectedUserId = tgId;
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) { detectedUserId = window.Telegram.WebApp.initDataUnsafe.user.id; }

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
    if (!tgId) return toast.error("Не удалось определить ваш ID. Пожалуйста, откройте ссылку из бота.");
    try {
        const fd = new FormData();
        fd.append('invite_code', code);
        fd.append('worker_id', selectedWorker.id);

        await axios.post('/api/invite/join', fd);

        toast.success("Успешно привязано!");
        if (window.location.search.includes('WebAppData') || window.location.pathname.includes('/max')) { navigate('/max'); }
        else if (window.Telegram?.WebApp?.initData) { navigate('/tma'); }
        else { navigate('/'); }
    } catch (e) {
        toast.error(e.response?.data?.detail || "Ошибка привязки");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-red-500">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 dark:text-white">Ошибка</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="w-full max-w-md">
        {!teamData ? (
          <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div></div>
        ) : (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-gray-100 dark:border-gray-700">
            <div className="text-center mb-8">
                <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <HardHat className="w-10 h-10 text-indigo-500" />
                </div>
                <h2 className="text-2xl font-bold dark:text-white mb-2 tracking-tight">Приглашение</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Бригада: <b className="text-indigo-600 dark:text-indigo-400 text-base ml-1">{teamData.team_name}</b></p>
            </div>

            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wider text-center">Выберите ваш профиль из списка:</p>

            {teamData.unclaimed_workers.length === 0 ? (
                <div className="text-center p-5 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Свободных мест нет или все участники уже привязали свои аккаунты.</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {teamData.unclaimed_workers.map(w => (
                    <button key={w.id} onClick={() => { setSelectedWorker(w); setConfirmModalOpen(true); }} className="w-full flex items-center gap-3 p-4 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500 rounded-2xl transition-all group active:scale-[0.98] shadow-sm">
                      <div className="bg-gray-100 dark:bg-gray-700 p-2.5 rounded-full group-hover:bg-indigo-100 dark:group-hover:bg-indigo-800/50 transition-colors">
                          <User className="w-5 h-5 text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                      </div>
                      <div className="text-left">
                          <p className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 text-base leading-tight">{w.fio}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider mt-1">{w.position}</p>
                      </div>
                    </button>
                  ))}
                </div>
            )}
          </div>
        )}
      </div>

      {isConfirmModalOpen && selectedWorker && (
        <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] w-full max-w-sm text-center shadow-2xl border border-gray-100 dark:border-gray-700">
                <h3 className="text-2xl font-bold mb-2 dark:text-white">Подтверждение</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm font-medium leading-relaxed">Привязать ваш мессенджер к профилю: <br/><b className="text-xl text-gray-900 dark:text-white mt-2 block">{selectedWorker.fio}</b></p>

                <div className="flex gap-3">
                    <button onClick={() => setConfirmModalOpen(false)} className="flex-1 bg-gray-100 dark:bg-gray-700 py-3.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95">Отмена</button>
                    <button onClick={handleJoin} className="flex-1 bg-indigo-600 py-3.5 rounded-xl font-bold text-white shadow-md hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Привязать
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
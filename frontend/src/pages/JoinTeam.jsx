import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function JoinTeam() {
  const { code } = useParams();
  const navigate = useNavigate();
  const telegramWrapperRef = useRef(null);

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
    if (teamData && !tgId && telegramWrapperRef.current && telegramWrapperRef.current.children.length === 0) {
      window.onTelegramAuthInvite = async (user) => {
        try {
          const response = await axios.post('/api/telegram_auth', user);
          setTgId(response.data.tg_id);
          localStorage.setItem('tg_id', response.data.tg_id);
          localStorage.setItem('user_role', response.data.role);
        } catch (err) {
          setError(err.response?.data?.detail || 'Ошибка авторизации');
        }
      };
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', 'ТВОЙ_USERNAME_БОТА'); // ЗАМЕНИТЬ НА НИК БОТА
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-onauth', 'onTelegramAuthInvite(user)');
      script.async = true;
      telegramWrapperRef.current.appendChild(script);
    }
  }, [tgId, teamData]);

  const handleWorkerClick = (worker) => { setSelectedWorker(worker); setConfirmModalOpen(true); };

  const handleConfirmJoin = async () => {
    try {
      const formData = new FormData(); formData.append('invite_code', code); formData.append('worker_id', selectedWorker.id); formData.append('tg_id', tgId);
      await axios.post('/api/invite/join', formData);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка сервера");
      setConfirmModalOpen(false);
    }
  };

  if (error && !teamData) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-6 rounded-2xl shadow-xl w-full max-w-sm text-center">
                <p className="font-bold text-lg mb-2">Ошибка: {error}</p>
                <p className="text-sm">Попросите прораба прислать новую ссылку или <a href="https://t.me/BU5INESSMAN" className="underline font-bold">напишите в техподдержку</a>.</p>
                <button onClick={() => navigate('/')} className="mt-6 bg-white dark:bg-gray-800 text-gray-800 dark:text-white border px-4 py-2 rounded-lg font-medium">На главную</button>
            </div>
        </div>
    );
  }

  if (!teamData) return <div className="flex items-center justify-center min-h-screen text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 transition-colors">Загрузка данных...</div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-lg border border-transparent dark:border-gray-700">
        <h1 className="text-2xl font-bold text-center text-blue-600 dark:text-blue-400 mb-2">ВИКС Расписание</h1>
        <h2 className="text-lg text-center font-medium text-gray-700 dark:text-gray-300 mb-6">Приглашение в бригаду<br/><span className="text-blue-600 dark:text-blue-400 font-bold">«{teamData.team_name}»</span></h2>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded-xl mb-4 text-center">
            <p className="font-bold text-sm mb-1">Ошибка: {error}</p>
            <p className="text-xs">Нужна помощь? <a href="https://t.me/BU5INESSMAN" className="underline font-bold">Техподдержка</a></p>
          </div>
        )}

        {!tgId ? (
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm font-medium">Для вступления необходимо авторизоваться:</p>
            <div className="flex justify-center min-h-[40px]" ref={telegramWrapperRef}></div>
          </div>
        ) : teamData.unclaimed_workers.length === 0 ? (
          <div className="text-center bg-gray-100 dark:bg-gray-700 p-6 rounded-xl text-gray-500 dark:text-gray-300 font-medium">В данной бригаде больше нет свободных мест для привязки.</div>
        ) : (
          <div>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-4 font-medium">Выберите себя из списка ниже:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teamData.unclaimed_workers.map(w => (
                <button key={w.id} onClick={() => handleWorkerClick(w)} className="bg-gray-50 dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 transition-all rounded-xl p-4 text-left shadow-sm group">
                  <p className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-blue-700 dark:group-hover:text-blue-400">{w.fio}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">{w.position}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isConfirmModalOpen && selectedWorker && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl transition-colors">
                <h3 className="text-xl font-bold mb-2 dark:text-white">Подтверждение</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Привязать аккаунт к профилю: <br/><b className="text-lg text-gray-900 dark:text-gray-100">{selectedWorker.fio}</b>?</p>
                <div className="flex space-x-3">
                    <button onClick={() => setConfirmModalOpen(false)} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-3 rounded-xl font-medium text-gray-700 dark:text-gray-300">Отмена</button>
                    <button onClick={handleConfirmJoin} className="w-1/2 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 shadow-md">Да, это я</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
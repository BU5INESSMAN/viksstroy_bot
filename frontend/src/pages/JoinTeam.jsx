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

  // 1. Сначала загружаем данные бригады
  useEffect(() => {
    axios.get(`/api/invite/${code}`)
      .then(res => setTeamData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Ссылка недействительна"));
  }, [code]);

  // 2. И ТОЛЬКО ПОСЛЕ загрузки teamData пытаемся отрисовать виджет Telegram
  useEffect(() => {
    // Проверяем: данные загружены? контейнер появился? скрипта еще нет?
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
      // ВАЖНО: Замени на username твоего бота (без @)
      script.setAttribute('data-telegram-login', 'viksstroy_bot');
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-onauth', 'onTelegramAuthInvite(user)');
      script.async = true;
      telegramWrapperRef.current.appendChild(script);
    }
  }, [tgId, teamData]); // Добавили teamData в зависимости!

  const handleWorkerClick = (worker) => {
    setSelectedWorker(worker);
    setConfirmModalOpen(true);
  };

  const handleConfirmJoin = async () => {
    try {
      const formData = new FormData();
      formData.append('invite_code', code);
      formData.append('worker_id', selectedWorker.id);
      formData.append('tg_id', tgId);

      await axios.post('/api/invite/join', formData);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка сервера");
      setConfirmModalOpen(false);
    }
  };

  if (error && !teamData) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
            <div className="bg-red-100 text-red-700 p-6 rounded-lg shadow-md font-medium text-lg">{error}</div>
        </div>
    );
  }

  if (!teamData) return <div className="flex items-center justify-center min-h-screen text-gray-500">Загрузка данных...</div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-lg">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-2">ВИКС Расписание</h1>
        <h2 className="text-lg text-center font-medium text-gray-700 mb-6">Приглашение в бригаду<br/><span className="text-blue-600 font-bold">«{teamData.team_name}»</span></h2>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-sm text-center">{error}</div>}

        {!tgId ? (
          <div className="text-center">
            <p className="text-gray-600 mb-4 text-sm font-medium">Для вступления необходимо авторизоваться:</p>
            {/* Сюда загрузится виджет */}
            <div className="flex justify-center min-h-[40px]" ref={telegramWrapperRef}></div>
          </div>
        ) : teamData.unclaimed_workers.length === 0 ? (
          <div className="text-center bg-gray-100 p-4 rounded-lg text-gray-500 font-medium">В данной бригаде больше нет свободных мест.</div>
        ) : (
          <div>
            <p className="text-center text-gray-600 mb-4 font-medium">Выберите себя из списка ниже:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teamData.unclaimed_workers.map(w => (
                <button
                  key={w.id}
                  onClick={() => handleWorkerClick(w)}
                  className="bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-400 transition-all rounded-lg p-4 text-left shadow-sm group"
                >
                  <p className="font-bold text-gray-800 group-hover:text-blue-700">{w.fio}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">{w.position}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* МОДАЛКА ПОДТВЕРЖДЕНИЯ */}
      {isConfirmModalOpen && selectedWorker && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm text-center shadow-2xl">
                <h3 className="text-xl font-bold mb-2">Подтверждение</h3>
                <p className="text-gray-600 mb-6">Вы уверены, что хотите привязать свой аккаунт к профилю: <br/><b className="text-lg text-gray-900">{selectedWorker.fio}</b>?</p>
                <div className="flex space-x-3">
                    <button onClick={() => setConfirmModalOpen(false)} className="w-1/2 bg-gray-200 py-2.5 rounded-lg font-medium text-gray-700 hover:bg-gray-300 transition">Отмена</button>
                    <button onClick={handleConfirmJoin} className="w-1/2 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition shadow-md">Да, это я</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
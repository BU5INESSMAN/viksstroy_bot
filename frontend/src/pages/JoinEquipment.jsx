import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function JoinEquipment() {
  const { code } = useParams();
  const navigate = useNavigate();
  const telegramWrapperRef = useRef(null);

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
    const tg = window.Telegram?.WebApp;
    const tgUser = tg?.initDataUnsafe?.user;

    // ЕСЛИ ОТКРЫТО В ТЕЛЕГРАМ - АВТОМАТИЧЕСКАЯ АВТОРИЗАЦИЯ
    if (tgUser && tgUser.id && !tgId) {
        const formData = new FormData();
        formData.append('tg_id', tgUser.id);
        formData.append('first_name', tgUser.first_name || '');
        formData.append('last_name', tgUser.last_name || '');
        axios.post('/api/tma/auth', formData).then(res => {
            setTgId(tgUser.id);
            localStorage.setItem('tg_id', tgUser.id);
            if (res.data.role) localStorage.setItem('user_role', res.data.role);
        }).catch(() => setError("Ошибка авторизации TMA"));
    }
    // ЕСЛИ ОТКРЫТО В БРАУЗЕРЕ (САФАРИ/ХРОМ) - ПОКАЗЫВАЕМ ВИДЖЕТ
    else if (equipData && !tgId && telegramWrapperRef.current && telegramWrapperRef.current.children.length === 0) {
        window.onTelegramAuthEquip = async (user) => {
            try {
              const response = await axios.post('/api/telegram_auth', user);
              setTgId(response.data.tg_id);
              localStorage.setItem('tg_id', response.data.tg_id);
              if (response.data.role) localStorage.setItem('user_role', response.data.role);
            } catch (err) { setError(err.response?.data?.detail || 'Ошибка авторизации'); }
        };
        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', 'viksstroy_bot');
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-onauth', 'onTelegramAuthEquip(user)');
        script.async = true;
        telegramWrapperRef.current.appendChild(script);
    }
  }, [tgId, equipData]);

  const handleConfirmJoin = async () => {
    try {
      const fd = new FormData();
      fd.append('invite_code', code);
      fd.append('tg_id', tgId);
      await axios.post('/api/equipment/invite/join', fd);
      alert("Аккаунт успешно привязан к технике!");
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка сервера");
      setConfirmModalOpen(false);
    }
  };

  if (error && !equipData) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-6 rounded-2xl shadow-xl w-full max-w-sm text-center">
                <p className="font-bold text-lg mb-2">Ошибка: {error}</p>
                <p className="text-sm">Попросите прислать новую ссылку или напишите в техподдержку.</p>
                <button onClick={() => navigate('/')} className="mt-6 bg-white dark:bg-gray-800 text-gray-800 dark:text-white border px-4 py-2 rounded-lg font-medium">На главную</button>
            </div>
        </div>
    );
  }

  if (!equipData) return <div className="flex items-center justify-center min-h-screen text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">Загрузка данных...</div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl w-full max-w-md border border-transparent dark:border-gray-700 text-center">
        <div className="w-20 h-20 mx-auto bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner">
            🚜
        </div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Привязка профиля</h1>
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-6">Техника:<br/><span className="text-blue-600 dark:text-blue-400 font-bold text-lg">{equipData.name}</span></h2>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded-xl mb-4 text-center">
            <p className="font-bold text-sm mb-1">Ошибка: {error}</p>
          </div>
        )}

        {!tgId ? (
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm font-medium">Для привязки необходимо авторизоваться через Telegram:</p>
            <div className="flex justify-center min-h-[40px]" ref={telegramWrapperRef}></div>
          </div>
        ) : equipData.tg_id ? (
          <div className="bg-gray-100 dark:bg-gray-700 p-6 rounded-xl text-gray-500 dark:text-gray-300 font-medium">К этой технике уже привязан другой профиль Telegram.</div>
        ) : (
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 font-medium">Нажмите кнопку ниже, чтобы закрепить эту технику за вашим аккаунтом.</p>
            <button onClick={() => setConfirmModalOpen(true)} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-blue-700 transition">
                🔗 Привязать мой аккаунт
            </button>
          </div>
        )}
      </div>

      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl transition-colors">
                <h3 className="text-xl font-bold mb-2 dark:text-white">Подтверждение</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Вы подтверждаете, что являетесь водителем машины <br/><b className="text-lg text-gray-900 dark:text-gray-100">{equipData.name}</b>?</p>
                <div className="flex space-x-3">
                    <button onClick={() => setConfirmModalOpen(false)} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-3 rounded-xl font-bold text-gray-700 dark:text-gray-300">Отмена</button>
                    <button onClick={handleConfirmJoin} className="w-1/2 bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-md hover:bg-emerald-600">Подтверждаю</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Dashboard() {
  const [data, setData] = useState({ stats: {}, teams: [] });
  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState(null);
  const role = localStorage.getItem('user_role') || 'Гость';
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/dashboard')
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user_role');
    navigate('/');
  };

  const handleGenerateInvite = async (teamId) => {
    try {
      const res = await axios.post(`/api/teams/${teamId}/generate_invite`);
      setInviteInfo(res.data);
    } catch (err) {
      alert("Ошибка при генерации ссылок!");
    }
  };

  // --- ЛОГИКА ОТОБРАЖЕНИЯ ПО РОЛЯМ ---
  const showStats = ['moderator', 'boss', 'superadmin'].includes(role);
  const showTeamManagement = ['foreman', 'boss', 'superadmin'].includes(role);
  const showCreateOrder = ['foreman', 'boss', 'superadmin'].includes(role);
  const showPublishOrder = ['moderator', 'boss', 'superadmin'].includes(role);
  const showAdminPanel = ['boss', 'superadmin'].includes(role);
  const showActiveOrder = ['worker', 'foreman'].includes(role); // Блок текущего наряда

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl text-gray-500 flex items-center">
           <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           Загрузка данных...
        </div>
      </div>
    );
  }

  // Перевод ролей для красивого отображения в шапке
  const roleNames = {
      'superadmin': 'Супер-Админ',
      'boss': 'Руководитель',
      'moderator': 'Модератор',
      'foreman': 'Прораб',
      'worker': 'Рабочий бригады',
      'Гость': 'Гость'
  };

  return (
    <div className="bg-gray-100 min-h-screen text-gray-800 pb-10">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-blue-600">ВИКС Расписание</h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">Должность: <b className="text-gray-800">{roleNames[role] || role}</b></span>
          <button onClick={handleLogout} className="text-sm font-medium text-red-500 hover:text-red-700 transition">Выйти</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* БЛОК СТАТИСТИКИ (Только для Модераторов и Руководства) */}
        {showStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Заявок сегодня" value={data.stats.today_total || 0} color="blue" />
            <StatCard title="Одобрено" value={data.stats.today_approved || 0} color="green" text="text-green-600" />
            <StatCard title="Отклонено" value={data.stats.today_rejected || 0} color="red" text="text-red-600" />
            <StatCard title="Ожидают" value={data.stats.waiting_publish || 0} color="yellow" text="text-yellow-600" />
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ЛЕВАЯ КОЛОНКА: БРИГАДЫ */}
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-bold mb-4 flex items-center">
                <span className="text-2xl mr-2">👥</span>
                {showTeamManagement ? "Управление бригадами" : "Моя бригада"}
            </h2>

            {data.teams.length > 0 ? (
                <ul className="space-y-3">
                {data.teams.map(t => (
                    <li key={t.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <span className="font-medium text-gray-800">🏗 {t.name}</span>
                        <div className="flex space-x-3 w-full sm:w-auto justify-end">
                            {showTeamManagement && (
                                <button onClick={() => handleGenerateInvite(t.id)} className="text-green-600 bg-green-50 px-3 py-1.5 rounded hover:bg-green-100 text-sm font-medium transition">
                                    🔗 Пригласить
                                </button>
                            )}
                            <button className="text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 text-sm font-medium transition">
                                {showTeamManagement ? "Настроить" : "Состав"}
                            </button>
                        </div>
                    </li>
                ))}
                </ul>
            ) : (
                <div className="text-center p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-gray-500 text-sm">Список бригад пока пуст.</p>
                </div>
            )}

            {showTeamManagement && (
                <button className="mt-5 w-full bg-gray-50 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-100 transition font-medium">
                    + Создать новую бригаду
                </button>
            )}
          </div>

          {/* ПРАВАЯ КОЛОНКА: АКТИВНЫЕ НАРЯДЫ И ДЕЙСТВИЯ */}
          <div className="space-y-6">

            {/* БЛОК ТЕКУЩЕГО НАРЯДА (Для прорабов и рабочих) */}
            {showActiveOrder && (
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500 relative overflow-hidden">
                    <h2 className="text-lg font-bold mb-2 flex items-center text-gray-800"><span className="text-xl mr-2">📋</span> Действующий наряд</h2>
                    <p className="text-gray-500 text-sm mb-4">Здесь будет отображаться ваш подтвержденный наряд на сегодняшний или завтрашний день.</p>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-center text-blue-600 font-medium text-sm">Активных нарядов пока нет.</p>
                    </div>
                </div>
            )}

            {/* БЛОК ДЕЙСТВИЙ (Создание, публикация, админка) */}
            {(showCreateOrder || showPublishOrder || showAdminPanel) && (
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800"><span className="text-2xl mr-2">⚙️</span> Панель действий</h2>
                    <div className="space-y-3">

                    {showCreateOrder && (
                        <button className="w-full bg-blue-600 text-white py-3.5 rounded-lg shadow-sm hover:bg-blue-700 font-medium transition flex justify-center items-center">
                            📝 Создать новую заявку
                        </button>
                    )}

                    {showPublishOrder && (
                        <button className="w-full bg-emerald-500 text-white py-3.5 rounded-lg shadow-sm hover:bg-emerald-600 font-medium transition flex justify-center items-center">
                            📤 Отправить наряды в группу
                        </button>
                    )}

                    {showAdminPanel && (
                        <button className="w-full bg-gray-800 text-white py-3.5 rounded-lg shadow-sm hover:bg-gray-900 font-medium transition flex justify-center items-center">
                            🛠 Панель управления техникой
                        </button>
                    )}
                    </div>
                </div>
            )}

          </div>
        </div>
      </main>

      {/* МОДАЛЬНОЕ ОКНО С ИНФОРМАЦИЕЙ ДЛЯ ПРИГЛАШЕНИЯ */}
      {inviteInfo && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md transform transition-all">
                <h3 className="text-xl font-bold mb-6 text-center text-gray-800">Приглашение в бригаду</h3>

                <div className="mb-6">
                    <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2 text-center">Пин-код для вступления:</label>
                    <div className="text-4xl font-mono text-center bg-blue-50 py-4 rounded-xl text-blue-700 tracking-[0.25em] border border-blue-200 shadow-inner">
                        {inviteInfo.password}
                    </div>
                    <p className="text-xs text-center text-gray-400 mt-2">Сообщите этот код рабочим</p>
                </div>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center">✈️ Ссылка для Telegram:</label>
                        <input type="text" readOnly value={inviteInfo.tg_bot_link} onClick={(e) => {e.target.select(); navigator.clipboard.writeText(e.target.value);}} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition" title="Нажмите, чтобы скопировать"/>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center">🌐 Web-ссылка (без Telegram):</label>
                        <input type="text" readOnly value={inviteInfo.invite_link} onClick={(e) => {e.target.select(); navigator.clipboard.writeText(e.target.value);}} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition" title="Нажмите, чтобы скопировать"/>
                    </div>
                </div>

                <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 text-white py-3 rounded-xl hover:bg-gray-900 transition font-medium shadow-md">
                    Закрыть
                </button>
            </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color, text = "text-gray-900" }) {
  const borders = { blue: 'border-blue-500', green: 'border-green-500', red: 'border-red-500', yellow: 'border-yellow-500' };
  return (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4 ${borders[color]} flex flex-col justify-center`}>
      <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wide">{title}</p>
      <p className={`text-3xl font-bold ${text}`}>{value}</p>
    </div>
  );
}
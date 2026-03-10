import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Dashboard() {
  const [data, setData] = useState({ stats: {}, teams: [], equipment: [] });
  const [activeApp, setActiveApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState(null);

  // Состояния модальных окон
  const [isTeamModalOpen, setTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const [isAppModalOpen, setAppModalOpen] = useState(false);
  const [appForm, setAppForm] = useState({ date_target: '', object_address: '', time_start: '08', time_end: '17', team_id: '', equip_id: '', comment: '' });

  const role = localStorage.getItem('user_role') || 'Гость';
  const tgId = localStorage.getItem('tg_id') || '0';
  const navigate = useNavigate();

  const fetchData = () => {
    axios.get('/api/dashboard').then(res => setData(res.data)).catch(() => {});
    if (tgId !== '0') {
      axios.get(`/api/applications/active?tg_id=${tgId}`).then(res => setActiveApp(res.data)).catch(() => setActiveApp(null));
    }
  };

  useEffect(() => {
    fetchData();
    setLoading(false);
  }, [tgId]);

  const handleLogout = () => {
    localStorage.removeItem('user_role');
    localStorage.removeItem('tg_id');
    navigate('/');
  };

  const handleGenerateInvite = async (teamId) => {
    try {
      const res = await axios.post(`/api/teams/${teamId}/generate_invite`);
      setInviteInfo(res.data);
    } catch (err) { alert("Ошибка при генерации ссылок!"); }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(); fd.append('name', newTeamName);
      await axios.post('/api/teams/create', fd);
      setTeamModalOpen(false); setNewTeamName(''); fetchData();
      alert("Бригада успешно создана!");
    } catch (err) { alert("Ошибка создания бригады"); }
  };

  const handleCreateApp = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('tg_id', tgId);
      Object.keys(appForm).forEach(k => fd.append(k, appForm[k]));
      await axios.post('/api/applications/create', fd);
      setAppModalOpen(false); fetchData();
      alert("Заявка успешно отправлена на модерацию!");
    } catch (err) { alert("Ошибка создания заявки"); }
  };

  const handlePublishApps = async () => {
    if (!window.confirm("Уверены, что хотите опубликовать все одобренные наряды в Telegram-группу?")) return;
    try {
      const res = await axios.post('/api/applications/publish');
      alert(`Успешно опубликовано нарядов: ${res.data.published}`);
      fetchData();
    } catch (err) { alert(err.response?.data?.detail || "Ошибка при публикации"); }
  };

  const showStats = ['moderator', 'boss', 'superadmin'].includes(role);
  const showTeamManagement = ['foreman', 'boss', 'superadmin'].includes(role);
  const showCreateOrder = ['foreman', 'boss', 'superadmin'].includes(role);
  const showPublishOrder = ['moderator', 'boss', 'superadmin'].includes(role);
  const showAdminPanel = ['boss', 'superadmin'].includes(role);
  const showActiveOrder = ['worker', 'foreman'].includes(role);

  if (loading) return <div className="text-center mt-20">Загрузка...</div>;

  return (
    <div className="bg-gray-100 min-h-screen text-gray-800 pb-10">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-blue-600">ВИКС Расписание</h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">Должность: <b className="uppercase text-gray-800">{role}</b></span>
          <button onClick={handleLogout} className="text-sm font-medium text-red-500 hover:text-red-700 transition">Выйти</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {showStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Заявок сегодня" value={data.stats.today_total || 0} color="blue" />
              <StatCard title="Одобрено" value={data.stats.today_approved || 0} color="green" text="text-green-600" />
              <StatCard title="Отклонено" value={data.stats.today_rejected || 0} color="red" text="text-red-600" />
              <StatCard title="Ожидают публикации" value={data.stats.waiting_publish || 0} color="yellow" text="text-yellow-600" />
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-bold mb-4 flex items-center">👥 {showTeamManagement ? "Управление бригадами" : "Моя бригада"}</h2>
            {data.teams.length > 0 ? (
                <ul className="space-y-3">
                {data.teams.map(t => (
                    <li key={t.id} className="p-4 bg-gray-50 rounded-lg border flex justify-between items-center">
                        <span className="font-medium text-gray-800">🏗 {t.name}</span>
                        {showTeamManagement && (
                            <button onClick={() => handleGenerateInvite(t.id)} className="text-green-600 bg-green-50 px-3 py-1.5 rounded hover:bg-green-100 text-sm font-medium">🔗 Пригласить</button>
                        )}
                    </li>
                ))}
                </ul>
            ) : (<p className="text-gray-500 text-sm">Список пуст.</p>)}

            {showTeamManagement && (
                <button onClick={() => setTeamModalOpen(true)} className="mt-5 w-full bg-gray-50 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-100 font-medium">+ Создать новую бригаду</button>
            )}
          </div>

          <div className="space-y-6">
            {showActiveOrder && (
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500 relative">
                    <h2 className="text-lg font-bold mb-2 flex items-center">📋 Действующий наряд</h2>
                    {activeApp ? (
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm space-y-2">
                           <p><b>Дата:</b> {activeApp.date_target}</p>
                           <p><b>Объект:</b> {activeApp.object_address}</p>
                           <p><b>Время:</b> {activeApp.time_start}:00 - {activeApp.time_end}:00</p>
                           <p><b>Техника:</b> {activeApp.equip_name}</p>
                           <p><b>Бригада:</b> {activeApp.team_name}</p>
                        </div>
                    ) : (
                        <p className="text-center text-blue-600 font-medium text-sm p-4 bg-blue-50 rounded-lg">Активных нарядов пока нет.</p>
                    )}
                </div>
            )}

            {(showCreateOrder || showPublishOrder || showAdminPanel) && (
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <h2 className="text-lg font-bold mb-4 flex items-center">⚙️ Панель действий</h2>
                    <div className="space-y-3">
                    {showCreateOrder && (
                        <button onClick={() => setAppModalOpen(true)} className="w-full bg-blue-600 text-white py-3 rounded-lg shadow hover:bg-blue-700 font-medium">📝 Создать новую заявку</button>
                    )}
                    {showPublishOrder && (
                        <button onClick={handlePublishApps} className="w-full bg-emerald-500 text-white py-3 rounded-lg shadow hover:bg-emerald-600 font-medium">📤 Отправить наряды в группу</button>
                    )}
                    {showAdminPanel && (
                        <button onClick={() => alert('Панель управления техникой перенесена в Telegram-бота. Откройте бота и нажмите "Панель управления".')} className="w-full bg-gray-800 text-white py-3 rounded-lg shadow hover:bg-gray-900 font-medium">🛠 Панель управления техникой</button>
                    )}
                    </div>
                </div>
            )}
          </div>
        </div>
      </main>

      {/* МОДАЛКА: СОЗДАТЬ БРИГАДУ */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                <h3 className="text-xl font-bold mb-4">Новая бригада</h3>
                <form onSubmit={handleCreateTeam}>
                    <input type="text" required value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Название бригады" className="w-full px-3 py-2 border rounded-lg mb-4" />
                    <div className="flex space-x-2">
                        <button type="button" onClick={() => setTeamModalOpen(false)} className="w-1/2 bg-gray-200 py-2 rounded-lg">Отмена</button>
                        <button type="submit" className="w-1/2 bg-blue-600 text-white py-2 rounded-lg">Создать</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* МОДАЛКА: СОЗДАТЬ ЗАЯВКУ */}
      {isAppModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white p-6 rounded-xl w-full max-w-md my-8">
                <h3 className="text-xl font-bold mb-4">Создание заявки</h3>
                <form onSubmit={handleCreateApp} className="space-y-3 text-sm">
                    <div><label className="font-bold">Дата выезда</label><input type="date" required value={appForm.date_target} onChange={e => setAppForm({...appForm, date_target: e.target.value})} className="w-full border p-2 rounded" /></div>
                    <div><label className="font-bold">Адрес объекта</label><input type="text" required value={appForm.object_address} onChange={e => setAppForm({...appForm, object_address: e.target.value})} className="w-full border p-2 rounded" /></div>
                    <div className="flex space-x-2">
                        <div className="w-1/2"><label className="font-bold">Начало (час)</label><input type="number" min="0" max="23" required value={appForm.time_start} onChange={e => setAppForm({...appForm, time_start: e.target.value})} className="w-full border p-2 rounded" /></div>
                        <div className="w-1/2"><label className="font-bold">Конец (час)</label><input type="number" min="0" max="23" required value={appForm.time_end} onChange={e => setAppForm({...appForm, time_end: e.target.value})} className="w-full border p-2 rounded" /></div>
                    </div>
                    <div>
                        <label className="font-bold">Выберите бригаду</label>
                        <select required value={appForm.team_id} onChange={e => setAppForm({...appForm, team_id: e.target.value})} className="w-full border p-2 rounded">
                            <option value="" disabled>-- Выберите --</option>
                            {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="font-bold">Требуемая техника</label>
                        <select required value={appForm.equip_id} onChange={e => setAppForm({...appForm, equip_id: e.target.value})} className="w-full border p-2 rounded">
                            <option value="" disabled>-- Выберите --</option>
                            {data.equipment.map(e => <option key={e.id} value={e.id}>{e.name} ({e.category})</option>)}
                        </select>
                    </div>
                    <div><label className="font-bold">Комментарий (опционально)</label><input type="text" value={appForm.comment} onChange={e => setAppForm({...appForm, comment: e.target.value})} className="w-full border p-2 rounded" /></div>

                    <div className="flex space-x-2 pt-2">
                        <button type="button" onClick={() => setAppModalOpen(false)} className="w-1/3 bg-gray-200 py-2 rounded-lg">Отмена</button>
                        <button type="submit" className="w-2/3 bg-blue-600 text-white py-2 rounded-lg">Отправить заявку</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Модалка Инвайта (осталась без изменений) */}
      {inviteInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="text-xl font-bold mb-4 text-center">Приглашение</h3>
                <div className="text-3xl font-mono text-center bg-blue-50 py-3 rounded-lg text-blue-700 mb-4">{inviteInfo.password}</div>
                <input type="text" readOnly value={inviteInfo.tg_bot_link} className="w-full px-3 py-2 bg-gray-100 border rounded mb-2 text-sm" onClick={e=>e.target.select()}/>
                <input type="text" readOnly value={inviteInfo.invite_link} className="w-full px-3 py-2 bg-gray-100 border rounded mb-4 text-sm" onClick={e=>e.target.select()}/>
                <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 text-white py-2 rounded-lg">Закрыть</button>
            </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color, text = "text-gray-900" }) {
  const borders = { blue: 'border-blue-500', green: 'border-green-500', red: 'border-red-500', yellow: 'border-yellow-500' };
  return (
    <div className={`bg-white p-4 rounded-lg shadow-sm border-l-4 ${borders[color]}`}>
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${text}`}>{value}</p>
    </div>
  );
}
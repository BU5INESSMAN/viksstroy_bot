import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Dashboard() {
  const [data, setData] = useState({ stats: {}, teams: [], equipment: [] });
  const [activeApp, setActiveApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState(null);
  const [copiedLink, setCopiedLink] = useState('');

  // Состояния модалок
  const [isTeamModalOpen, setTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  // Управление бригадой
  const [isManageModalOpen, setManageModalOpen] = useState(false);
  const [manageTeamData, setManageTeamData] = useState(null);
  const [newMember, setNewMember] = useState({ fio: '', position: 'Рабочий' });

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

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(''), 2000);
  };

  const handleGenerateInvite = async (teamId) => {
    try {
      const res = await axios.post(`/api/teams/${teamId}/generate_invite`);
      setInviteInfo(res.data);
    } catch (err) { alert("Ошибка генерации ссылок!"); }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(); fd.append('name', newTeamName);
      await axios.post('/api/teams/create', fd);
      setTeamModalOpen(false); setNewTeamName(''); fetchData();
    } catch (err) { alert("Ошибка создания бригады"); }
  };

  const openManageModal = async (teamId) => {
    try {
      const res = await axios.get(`/api/teams/${teamId}/details`);
      setManageTeamData(res.data);
      setManageModalOpen(true);
    } catch (err) { alert("Ошибка загрузки состава бригады"); }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('fio', newMember.fio);
      fd.append('position', newMember.position);
      await axios.post(`/api/teams/${manageTeamData.id}/members/add`, fd);
      setNewMember({ fio: '', position: 'Рабочий' });
      // Обновляем модалку
      const res = await axios.get(`/api/teams/${manageTeamData.id}/details`);
      setManageTeamData(res.data);
    } catch (err) { alert("Ошибка добавления"); }
  };

  const handleDeleteMember = async (memberId) => {
    if (!window.confirm("Удалить участника?")) return;
    try {
      await axios.post(`/api/teams/members/${memberId}/delete`);
      const res = await axios.get(`/api/teams/${manageTeamData.id}/details`);
      setManageTeamData(res.data);
    } catch (err) { alert("Ошибка удаления"); }
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
    if (!window.confirm("Опубликовать все одобренные наряды в Telegram-группу?")) return;
    try {
      const res = await axios.post('/api/applications/publish');
      alert(`Опубликовано нарядов: ${res.data.published}`);
      fetchData();
    } catch (err) { alert(err.response?.data?.detail || "Ошибка публикации"); }
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
              <StatCard title="Ожидают" value={data.stats.waiting_publish || 0} color="yellow" text="text-yellow-600" />
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-bold mb-4 flex items-center">👥 Управление бригадами</h2>
            {data.teams.length > 0 ? (
                <ul className="space-y-3">
                {data.teams.map(t => (
                    <li key={t.id} className="p-4 bg-gray-50 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <span className="font-medium text-gray-800">🏗 {t.name}</span>
                        <div className="flex space-x-2">
                            {showTeamManagement && (
                                <button onClick={() => handleGenerateInvite(t.id)} className="text-green-600 bg-green-50 px-3 py-1.5 rounded hover:bg-green-100 text-sm font-medium transition">🔗 Пригласить</button>
                            )}
                            <button onClick={() => openManageModal(t.id)} className="text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 text-sm font-medium transition">Состав / Управлять</button>
                        </div>
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
                    </div>
                </div>
            )}
          </div>
        </div>
      </main>

      {/* МОДАЛКА: ИНВАЙТ */}
      {inviteInfo && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md">
                <h3 className="text-xl font-bold mb-6 text-center text-gray-800">Приглашение в бригаду</h3>
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">✈️ Ссылка для Telegram:</label>
                        <button
                          onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')}
                          className={`w-full text-left px-4 py-3 border rounded-lg text-sm transition ${copiedLink === 'tg' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                          {copiedLink === 'tg' ? '✅ Ссылка скопирована!' : '🔗 Нажмите, чтобы скопировать'}
                        </button>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">🌐 Web-ссылка (без Telegram):</label>
                        <button
                          onClick={() => copyToClipboard(inviteInfo.invite_link, 'web')}
                          className={`w-full text-left px-4 py-3 border rounded-lg text-sm transition ${copiedLink === 'web' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                          {copiedLink === 'web' ? '✅ Ссылка скопирована!' : '🔗 Нажмите, чтобы скопировать'}
                        </button>
                    </div>
                </div>
                <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 text-white py-3 rounded-xl hover:bg-gray-900 font-medium shadow-md">Закрыть</button>
            </div>
        </div>
      )}

      {/* МОДАЛКА: УПРАВЛЕНИЕ СОСТАВОМ БРИГАДЫ */}
      {isManageModalOpen && manageTeamData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white p-6 rounded-xl w-full max-w-lg my-8">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Бригада «{manageTeamData.name}»</h3>
                    <button onClick={() => setManageModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
                </div>

                <div className="mb-6">
                    <h4 className="font-bold text-gray-700 mb-2">Текущий состав ({manageTeamData.members.length} чел.)</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-2 bg-gray-50">
                        {manageTeamData.members.length === 0 ? <p className="text-gray-500 text-sm text-center py-2">Состав пуст.</p> : null}
                        {manageTeamData.members.map(m => (
                            <div key={m.id} className="flex justify-between items-center bg-white p-2 rounded border text-sm">
                                <div>
                                    <p className="font-bold">{m.fio}</p>
                                    <p className="text-xs text-gray-500">{m.position} {m.is_linked ? <span className="text-green-600 ml-1">✓ Привязан</span> : ''}</p>
                                </div>
                                {showTeamManagement && (
                                    <button onClick={() => handleDeleteMember(m.id)} className="text-red-500 hover:text-red-700 font-bold px-2 py-1 bg-red-50 rounded">Удалить</button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {showTeamManagement && (
                    <form onSubmit={handleAddMember} className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <h4 className="font-bold text-blue-800 mb-3 text-sm uppercase">Добавить участника</h4>
                        <div className="flex space-x-2 mb-2">
                            <input type="text" required value={newMember.fio} onChange={e => setNewMember({...newMember, fio: e.target.value})} placeholder="ФИО (например: Иванов И.И.)" className="w-2/3 px-3 py-2 border rounded text-sm" />
                            <input type="text" required value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} placeholder="Должность" className="w-1/3 px-3 py-2 border rounded text-sm" />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 transition">Добавить в список</button>
                    </form>
                )}
            </div>
        </div>
      )}

      {/* МОДАЛКА: СОЗДАТЬ БРИГАДУ */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                <h3 className="text-xl font-bold mb-4">Новая бригада</h3>
                <form onSubmit={handleCreateTeam}>
                    <input type="text" required value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Название бригады" className="w-full px-3 py-2 border rounded-lg mb-4" />
                    <div className="flex space-x-2">
                        <button type="button" onClick={() => setTeamModalOpen(false)} className="w-1/2 bg-gray-200 py-2 rounded-lg font-medium hover:bg-gray-300">Отмена</button>
                        <button type="submit" className="w-1/2 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">Создать</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* МОДАЛКА: СОЗДАТЬ ЗАЯВКУ */}
      {isAppModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white p-6 rounded-xl w-full max-w-md my-8 shadow-2xl">
                <h3 className="text-xl font-bold mb-4">Создание заявки</h3>
                <form onSubmit={handleCreateApp} className="space-y-3 text-sm">
                    <div><label className="font-bold">Дата выезда</label><input type="date" required value={appForm.date_target} onChange={e => setAppForm({...appForm, date_target: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="font-bold">Адрес объекта</label><input type="text" required value={appForm.object_address} onChange={e => setAppForm({...appForm, object_address: e.target.value})} placeholder="Ул. Ленина, 10" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" /></div>
                    <div className="flex space-x-2">
                        <div className="w-1/2"><label className="font-bold">Начало (час)</label><input type="number" min="0" max="23" required value={appForm.time_start} onChange={e => setAppForm({...appForm, time_start: e.target.value})} className="w-full border p-2 rounded text-center focus:ring-2 focus:ring-blue-500" /></div>
                        <div className="w-1/2"><label className="font-bold">Конец (час)</label><input type="number" min="0" max="23" required value={appForm.time_end} onChange={e => setAppForm({...appForm, time_end: e.target.value})} className="w-full border p-2 rounded text-center focus:ring-2 focus:ring-blue-500" /></div>
                    </div>
                    <div>
                        <label className="font-bold">Выберите бригаду</label>
                        <select required value={appForm.team_id} onChange={e => setAppForm({...appForm, team_id: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500">
                            <option value="" disabled>-- Выберите --</option>
                            {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="font-bold">Требуемая техника</label>
                        <select required value={appForm.equip_id} onChange={e => setAppForm({...appForm, equip_id: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500">
                            <option value="" disabled>-- Выберите --</option>
                            {data.equipment.map(e => <option key={e.id} value={e.id}>{e.name} ({e.category})</option>)}
                        </select>
                    </div>
                    <div><label className="font-bold">Комментарий</label><input type="text" value={appForm.comment} onChange={e => setAppForm({...appForm, comment: e.target.value})} placeholder="Опционально" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" /></div>

                    <div className="flex space-x-2 pt-4">
                        <button type="button" onClick={() => setAppModalOpen(false)} className="w-1/3 bg-gray-200 py-2.5 rounded-lg font-medium hover:bg-gray-300 transition">Отмена</button>
                        <button type="submit" className="w-2/3 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition">Отправить заявку</button>
                    </div>
                </form>
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
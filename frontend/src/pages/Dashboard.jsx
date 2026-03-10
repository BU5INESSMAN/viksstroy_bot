import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Dashboard() {
  const [data, setData] = useState({ stats: {}, teams: [], equipment: [], equip_categories: [] });
  const [activeApp, setActiveApp] = useState(null);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // ТЕМНАЯ ТЕМА
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const themeIcon = theme === 'light' ? '🌞' : theme === 'dark' ? '🌙' : '💻';
  const themeTitle = theme === 'light' ? 'Светлая тема' : theme === 'dark' ? 'Темная тема' : 'Как в системе';

  // Состояния модалок
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', text: '', onConfirm: null, confirmText: 'Да', color: 'blue' });
  const [isTeamModalOpen, setTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [isManageModalOpen, setManageModalOpen] = useState(false);
  const [manageTeamData, setManageTeamData] = useState(null);
  const [newMember, setNewMember] = useState({ fio: '', position: 'Рабочий' });
  const [isAppModalOpen, setAppModalOpen] = useState(false);
  const [appForm, setAppForm] = useState({ date_target: '', object_address: '', time_start: '08', time_end: '17', team_id: '', equip_id: '', comment: '' });
  const [inviteInfo, setInviteInfo] = useState(null);
  const [copiedLink, setCopiedLink] = useState('');

  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [profileLogs, setProfileLogs] = useState([]);
  const [editProfile, setEditProfile] = useState({});

  // ТЕХНИКА
  const [isEquipModalOpen, setEquipModalOpen] = useState(false);
  const [equipList, setEquipList] = useState([]);
  const [newEquip, setNewEquip] = useState({ name: '', category: '' });
  const [customCategory, setCustomCategory] = useState(''); // Поле для ручного ввода

  const role = localStorage.getItem('user_role') || 'Гость';
  const tgId = localStorage.getItem('tg_id') || '0';
  const navigate = useNavigate();

  const fetchData = () => {
    axios.get('/api/dashboard').then(res => {
      setData(res.data);
      if(res.data.equip_categories?.length > 0 && !newEquip.category) {
        setNewEquip(prev => ({...prev, category: res.data.equip_categories[0]}));
      }
    }).catch(() => {});
    if (tgId !== '0') axios.get(`/api/applications/active?tg_id=${tgId}`).then(res => setActiveApp(res.data)).catch(() => setActiveApp(null));
    if (['boss', 'superadmin', 'moderator'].includes(role)) axios.get('/api/users').then(res => setUsers(res.data)).catch(() => {});
    if (['boss', 'superadmin'].includes(role)) axios.get('/api/logs').then(res => setLogs(res.data)).catch(() => {});
  };

  useEffect(() => { fetchData(); setLoading(false); }, [tgId, role]);

  const handleLogout = () => { localStorage.removeItem('user_role'); localStorage.removeItem('tg_id'); navigate('/'); };
  const copyToClipboard = (text, type) => { navigator.clipboard.writeText(text); setCopiedLink(type); setTimeout(() => setCopiedLink(''), 2000); };

  // --- ЛОГИКА АПИ ---
  const openProfile = async (targetId) => { try { const res = await axios.get(`/api/users/${targetId}/profile`); setProfileData(res.data.profile); setProfileLogs(res.data.logs); setEditProfile({ fio: res.data.profile.fio, role: res.data.profile.role, team_id: res.data.profile.team_id || '', position: res.data.profile.position || '', avatar_url: res.data.profile.avatar_url || '' }); setProfileModalOpen(true); } catch (err) { alert("Ошибка загрузки профиля"); } };
  const handleUpdateAvatar = async () => { const newUrl = prompt("Введите ссылку на новое фото (URL):", editProfile.avatar_url); if (newUrl !== null) { try { const fd = new FormData(); fd.append('avatar_url', newUrl); fd.append('tg_id', tgId); await axios.post(`/api/users/${profileData.user_id}/update_avatar`, fd); setEditProfile({...editProfile, avatar_url: newUrl}); setProfileData({...profileData, avatar_url: newUrl}); } catch (e) { alert("Ошибка обновления фото"); } } };
  const handleSaveProfile = async () => { try { const fd = new FormData(); fd.append('tg_id', tgId); fd.append('fio', editProfile.fio); fd.append('role', editProfile.role); fd.append('team_id', editProfile.team_id); fd.append('position', editProfile.position); await axios.post(`/api/users/${profileData.user_id}/update_profile`, fd); alert("Профиль успешно обновлен!"); setProfileModalOpen(false); fetchData(); } catch (e) { alert("Ошибка сохранения профиля."); } };
  const handleDeleteUser = () => { setConfirmDialog({ isOpen: true, title: 'Удаление пользователя', text: `ПОЛНОСТЬЮ удалить «${profileData.fio}»?`, confirmText: 'Удалить навсегда', color: 'red', onConfirm: async () => { setConfirmDialog({ ...confirmDialog, isOpen: false }); try { const fd = new FormData(); fd.append('tg_id', tgId); await axios.post(`/api/users/${profileData.user_id}/delete`, fd); setProfileModalOpen(false); fetchData(); } catch (e) { alert("Ошибка удаления"); } } }); };

  const openEquipModal = async () => { try { const res = await axios.get('/api/equipment/admin_list'); setEquipList(res.data); setEquipModalOpen(true); } catch (e) { alert("Ошибка загрузки техники"); } };

  const handleAddEquip = async (e) => {
    e.preventDefault();
    try {
      // Если выбрано "Другое", используем текст из поля для ввода
      const finalCategory = newEquip.category === 'Другое' ? (customCategory.trim() || 'Без категории') : newEquip.category;
      const fd = new FormData(); fd.append('name', newEquip.name); fd.append('category', finalCategory); fd.append('tg_id', tgId);
      await axios.post('/api/equipment/add', fd);
      setNewEquip({ name: '', category: data.equip_categories[0] || '' });
      setCustomCategory('');
      const res = await axios.get('/api/equipment/admin_list'); setEquipList(res.data); fetchData();
    } catch (e) { alert("Ошибка добавления"); }
  };

  const handleToggleEquip = async (id, currentStatus) => { try { const fd = new FormData(); fd.append('is_active', currentStatus ? 0 : 1); fd.append('tg_id', tgId); await axios.post(`/api/equipment/${id}/toggle`, fd); const res = await axios.get('/api/equipment/admin_list'); setEquipList(res.data); fetchData(); } catch (e) { alert("Ошибка"); } };
  const handleDeleteEquip = (id, name) => { if (!window.confirm(`Удалить технику ${name}?`)) return; try { const fd = new FormData(); fd.append('tg_id', tgId); axios.post(`/api/equipment/${id}/delete`, fd).then(() => { axios.get('/api/equipment/admin_list').then(res => setEquipList(res.data)); fetchData(); }); } catch (e) { alert("Ошибка"); } };
  const handleGenerateInvite = async (teamId) => { try { const res = await axios.post(`/api/teams/${teamId}/generate_invite`); setInviteInfo(res.data); } catch (err) { alert("Ошибка!"); } };
  const handleCreateTeam = async (e) => { e.preventDefault(); try { const fd = new FormData(); fd.append('name', newTeamName); fd.append('tg_id', tgId); await axios.post('/api/teams/create', fd); setTeamModalOpen(false); setNewTeamName(''); fetchData(); } catch (err) { alert("Ошибка"); } };
  const openManageModal = async (teamId) => { try { const res = await axios.get(`/api/teams/${teamId}/details`); setManageTeamData(res.data); setManageModalOpen(true); } catch (err) { alert("Ошибка"); } };
  const handleAddMember = async (e) => { e.preventDefault(); try { const fd = new FormData(); fd.append('fio', newMember.fio); fd.append('position', newMember.position); fd.append('tg_id', tgId); await axios.post(`/api/teams/${manageTeamData.id}/members/add`, fd); setNewMember({ fio: '', position: 'Рабочий' }); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } };
  const handleDeleteMember = (memberId, memberName) => { setConfirmDialog({ isOpen: true, title: 'Удалить?', text: `Удалить «${memberName}»?`, confirmText: 'Удалить', color: 'red', onConfirm: async () => { setConfirmDialog({ ...confirmDialog, isOpen: false }); try { const fd = new FormData(); fd.append('tg_id', tgId); await axios.post(`/api/teams/members/${memberId}/delete`, fd); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } }}); };
  const handleCreateApp = async (e) => { e.preventDefault(); try { const fd = new FormData(); fd.append('tg_id', tgId); Object.keys(appForm).forEach(k => fd.append(k, appForm[k])); await axios.post('/api/applications/create', fd); setAppModalOpen(false); fetchData(); alert("Отправлено на модерацию!"); } catch (err) { alert("Ошибка"); } };
  const handlePublishAppsClick = () => { setConfirmDialog({ isOpen: true, title: 'Публикация', text: 'Отправить все наряды в чат?', confirmText: 'Опубликовать', color: 'green', onConfirm: async () => { setConfirmDialog({ ...confirmDialog, isOpen: false }); try { const fd = new FormData(); fd.append('tg_id', tgId); const res = await axios.post('/api/applications/publish', fd); alert(`Опубликовано: ${res.data.published}`); fetchData(); } catch (err) { alert("Ошибка"); } }}); };

  const showStats = ['moderator', 'boss', 'superadmin'].includes(role);
  const showTeamManagement = ['foreman', 'boss', 'superadmin', 'moderator'].includes(role);
  const showCreateOrder = ['foreman', 'boss', 'superadmin'].includes(role);
  const showPublishOrder = ['moderator', 'boss', 'superadmin'].includes(role);
  const showAdminPanel = ['boss', 'superadmin'].includes(role);
  const showActiveOrder = ['worker', 'foreman'].includes(role);
  const showUsersAndLogs = ['boss', 'superadmin', 'moderator'].includes(role);
  const canEditUsers = ['boss', 'superadmin', 'moderator'].includes(role);

  const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'Гость': 'Гость' };

  // Умные категории (Берем из БД, добавляем "Другое" в конец)
  const displayCategories = [...(data.equip_categories || [])];
  if (!displayCategories.includes('Другое')) displayCategories.push('Другое');
  if (displayCategories.length === 1) { displayCategories.unshift('Кран', 'Экскаватор'); } // Заглушка если БД пуста

  if (loading) return <div className="text-center mt-20 text-gray-800 dark:text-gray-200">Загрузка...</div>;

  return (
    <div className="bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 pb-10 transition-colors duration-200">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-transparent dark:border-gray-700 px-6 py-4 flex justify-between items-center mb-6 transition-colors duration-200">
        <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">ВИКС Расписание</h1>
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button onClick={toggleTheme} className="text-xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition" title={themeTitle}>
            {themeIcon}
          </button>

          <button onClick={() => openProfile(tgId)} className="flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
             <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center overflow-hidden"><span className="text-blue-600 dark:text-blue-300 font-bold text-sm">👤</span></div>
             <span className="text-sm font-medium hidden sm:block">Мой профиль</span>
          </button>
          <span className="text-sm text-gray-400 dark:text-gray-600 hidden sm:block">|</span>
          <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:block">Должность: <b className="text-gray-800 dark:text-gray-200">{roleNames[role]}</b></span>
          <button onClick={handleLogout} className="text-sm font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">Выйти</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {showStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Заявок сегодня" value={data.stats.today_total || 0} color="blue" />
              <StatCard title="Одобрено" value={data.stats.today_approved || 0} color="green" text="text-green-600 dark:text-green-400" />
              <StatCard title="Отклонено" value={data.stats.today_rejected || 0} color="red" text="text-red-600 dark:text-red-400" />
              <StatCard title="Ожидают" value={data.stats.waiting_publish || 0} color="yellow" text="text-yellow-600 dark:text-yellow-400" />
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
            <h2 className="text-lg font-bold mb-4 flex items-center">👥 {showTeamManagement ? "Управление бригадами" : "Моя бригада"}</h2>
            {data.teams.length > 0 ? (
                <ul className="space-y-3">
                {data.teams.map(t => (
                    <li key={t.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors">
                        <span className="font-medium text-gray-800 dark:text-gray-200">🏗 {t.name}</span>
                        <div className="flex space-x-2 w-full sm:w-auto mt-2 sm:mt-0">
                            {showTeamManagement && (<button onClick={() => handleGenerateInvite(t.id)} className="flex-1 sm:flex-none text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded hover:bg-green-200 dark:hover:bg-green-900/60 text-sm font-medium transition">🔗 Ссылка</button>)}
                            <button onClick={() => openManageModal(t.id)} className="flex-1 sm:flex-none text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 text-sm font-medium transition">Управлять</button>
                        </div>
                    </li>
                ))}
                </ul>
            ) : (<p className="text-gray-500 dark:text-gray-400 text-sm">Список пуст.</p>)}
            {showTeamManagement && (<button onClick={() => setTeamModalOpen(true)} className="mt-5 w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 font-medium transition-colors">+ Создать новую бригаду</button>)}
          </div>

          <div className="space-y-6">
            {showActiveOrder && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border-l-4 border-blue-500 relative transition-colors duration-200">
                    <h2 className="text-lg font-bold mb-2 flex items-center">📋 Действующий наряд</h2>
                    {activeApp ? (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 text-sm space-y-2">
                           <p><b>Дата:</b> {activeApp.date_target}</p><p><b>Объект:</b> {activeApp.object_address}</p><p><b>Время:</b> {activeApp.time_start}:00 - {activeApp.time_end}:00</p>
                           <p><b>Техника:</b> {activeApp.equip_name}</p><p><b>Бригада:</b> {activeApp.team_name}</p>
                        </div>
                    ) : (<p className="text-center text-blue-600 dark:text-blue-400 font-medium text-sm p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">Активных нарядов пока нет.</p>)}
                </div>
            )}
            {(showCreateOrder || showPublishOrder || showAdminPanel) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                    <h2 className="text-lg font-bold mb-4 flex items-center">⚙️ Панель действий</h2>
                    <div className="space-y-3">
                    {showCreateOrder && (<button onClick={() => setAppModalOpen(true)} className="w-full bg-blue-600 text-white py-3 rounded-lg shadow hover:bg-blue-700 font-medium">📝 Создать заявку</button>)}
                    {showPublishOrder && (<button onClick={handlePublishAppsClick} className="w-full bg-emerald-500 text-white py-3 rounded-lg shadow hover:bg-emerald-600 font-medium">📤 Отправить наряды в группу</button>)}
                    {showAdminPanel && (<button onClick={openEquipModal} className="w-full bg-gray-800 dark:bg-gray-700 text-white py-3 rounded-lg shadow hover:bg-gray-900 dark:hover:bg-gray-600 font-medium">🛠 Панель управления техникой</button>)}
                    </div>
                </div>
            )}
          </div>
        </div>

        {showUsersAndLogs && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 mt-6 transition-colors duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">👨‍💼</span> Пользователи системы</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {users.map(u => (
                        <div key={u.user_id} onClick={() => openProfile(u.user_id)} className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-md cursor-pointer transition bg-white dark:bg-gray-700 group hover:border-blue-300 dark:hover:border-blue-500">
                            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 mr-3 flex-shrink-0 overflow-hidden bg-cover bg-center" style={{ backgroundImage: u.avatar_url ? `url(${u.avatar_url})` : 'none' }}>
                                {!u.avatar_url && <span className="flex items-center justify-center w-full h-full text-xl text-gray-400 dark:text-gray-300">👤</span>}
                            </div>
                            <div className="overflow-hidden">
                                <p className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{u.fio}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-0.5">{roleNames[u.role]}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {['boss', 'superadmin'].includes(role) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 mt-6 transition-colors duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📜</span> Журнал действий системы</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700">
                            <tr><th className="px-6 py-3">Время</th><th className="px-6 py-3">Пользователь</th><th className="px-6 py-3">Действие</th></tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('ru-RU')}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">{log.fio}</td>
                                    <td className="px-6 py-4 text-blue-600 dark:text-blue-400">{log.action}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </main>

      {/* --- МОДАЛЬНЫЕ ОКНА С ТЕМНОЙ ТЕМОЙ --- */}

      {/* Техника */}
      {isEquipModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl my-8 overflow-hidden transition-colors">
                <div className="flex justify-between items-center px-6 py-4 bg-gray-800 dark:bg-gray-900 text-white">
                    <h3 className="text-xl font-bold">🛠 Управление автопарком</h3>
                    <button onClick={() => setEquipModalOpen(false)} className="text-gray-300 hover:text-white text-2xl">&times;</button>
                </div>
                <div className="p-6">
                    <div className="mb-6 max-h-64 overflow-y-auto border dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50 p-2">
                        {equipList.length === 0 ? <p className="text-center text-gray-500 py-4">Техника не найдена</p> : null}
                        {equipList.map(eq => (
                            <div key={eq.id} className={`flex flex-col sm:flex-row justify-between sm:items-center p-3 mb-2 rounded-lg border dark:border-gray-600 shadow-sm transition-colors ${eq.is_active ? 'bg-white dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800 opacity-60'}`}>
                                <div className="mb-2 sm:mb-0">
                                    <p className="font-bold text-gray-800 dark:text-gray-200">{eq.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">{eq.category}</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => handleToggleEquip(eq.id, eq.is_active)} className={`px-3 py-1.5 rounded text-xs font-bold ${eq.is_active ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 hover:bg-yellow-200' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-500 hover:bg-green-200'}`}>
                                        {eq.is_active ? 'В ремонт' : 'В строй'}
                                    </button>
                                    <button onClick={() => handleDeleteEquip(eq.id, eq.name)} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded text-xs font-bold">Удалить</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <form onSubmit={handleAddEquip} className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                        <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-3 text-sm uppercase">Добавить новую технику</h4>
                        <div className="mb-3">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Название (например: Кран Ивановец 25т)</label>
                            <input type="text" required value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none" />
                        </div>
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Категория</label>
                            <div className="flex flex-wrap gap-2">
                                {displayCategories.map(cat => (
                                    <button key={cat} type="button" onClick={() => setNewEquip({...newEquip, category: cat})} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${newEquip.category === cat ? 'bg-blue-500 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>{cat}</button>
                                ))}
                            </div>
                            {newEquip.category === 'Другое' && (
                                <input type="text" required placeholder="Введите свою категорию..." value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="mt-3 w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none" />
                            )}
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700">Добавить в автопарк</button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {/* Профиль */}
      {isProfileModalOpen && profileData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 transition-colors">
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 px-6 py-8 text-white relative">
                    <button onClick={() => setProfileModalOpen(false)} className="absolute top-4 right-4 text-white hover:text-gray-200 text-2xl font-bold">&times;</button>
                    <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
                        <div className="relative group cursor-pointer" onClick={handleUpdateAvatar}>
                            <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-200 dark:bg-gray-700 bg-cover bg-center overflow-hidden" style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}>
                                {!profileData.avatar_url && <span className="flex items-center justify-center w-full h-full text-4xl text-gray-400">👤</span>}
                            </div>
                            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><span className="text-xs font-bold text-white text-center px-2">Сменить фото</span></div>
                        </div>
                        <div className="text-center sm:text-left">
                            <h3 className="text-2xl font-bold">{profileData.fio}</h3>
                            <p className="text-blue-200 uppercase tracking-wide text-sm font-semibold mt-1">{roleNames[profileData.role]}</p>
                            <p className="text-xs text-blue-100 mt-2 opacity-75">ID: {profileData.user_id}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider border-b dark:border-gray-700 pb-2">Управление профилем</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">ФИО</label><input type="text" value={editProfile.fio} onChange={e => setEditProfile({...editProfile, fio: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:opacity-70" /></div>
                            <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Специальность</label><input type="text" value={editProfile.position} onChange={e => setEditProfile({...editProfile, position: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:opacity-70" /></div>
                        </div>

                        {canEditUsers && (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Бригада</label>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setEditProfile({...editProfile, team_id: ''})} className={`px-4 py-2 text-sm font-medium rounded-lg border transition ${!editProfile.team_id ? 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-400' : 'bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50'}`}>Без бригады</button>
                                    {data.teams.map(t => (
                                        <button key={t.id} type="button" onClick={() => setEditProfile({...editProfile, team_id: t.id})} className={`px-4 py-2 text-sm font-medium rounded-lg border transition ${Number(editProfile.team_id) === t.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-400 shadow-sm' : 'bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50'}`}>🏗 {t.name}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {canEditUsers && profileData.user_id !== Number(tgId) && (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Роль</label>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(roleNames).filter(([key]) => key !== 'Гость').map(([key, label]) => (
                                        <button key={key} type="button" onClick={() => setEditProfile({...editProfile, role: key})} className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${editProfile.role === key ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50'}`}>{label}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {canEditUsers && (
                            <div className="flex justify-between items-center pt-4 mt-2 border-t border-gray-100 dark:border-gray-700">
                                <button onClick={handleDeleteUser} disabled={profileData.user_id === Number(tgId)} className="text-red-500 dark:text-red-400 font-bold text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2.5 rounded-lg disabled:opacity-50">🗑 Удалить</button>
                                <button onClick={handleSaveProfile} className="bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 px-6 py-2.5 rounded-lg shadow">Сохранить</button>
                            </div>
                        )}
                    </div>

                    <div className="mt-8">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider border-b dark:border-gray-700 pb-2 mb-4">История действий</h4>
                        {profileLogs.length > 0 ? (
                            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                                {profileLogs.map(log => (
                                    <div key={log.id} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border border-gray-100 dark:border-gray-600 flex justify-between items-start text-sm">
                                        <span className="text-gray-700 dark:text-gray-300">{log.action}</span>
                                        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-4">{new Date(log.timestamp).toLocaleString('ru-RU', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (<p className="text-gray-500 dark:text-gray-400 text-sm italic">Действий не найдено.</p>)}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Окно подтверждения */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl transition-colors">
                <h3 className="text-xl font-bold mb-2">{confirmDialog.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">{confirmDialog.text}</p>
                <div className="flex space-x-3">
                    <button onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300">Отмена</button>
                    <button onClick={confirmDialog.onConfirm} className={`w-1/2 text-white py-2.5 rounded-xl font-medium shadow-md ${confirmDialog.color === 'red' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>{confirmDialog.confirmText}</button>
                </div>
            </div>
        </div>
      )}

      {/* Инвайт */}
      {inviteInfo && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl w-full max-w-md transition-colors">
                <h3 className="text-xl font-bold mb-6 text-center">Приглашение</h3>
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">✈️ Ссылка для Telegram:</label>
                        <button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')} className={`w-full text-left px-4 py-3 border rounded-lg text-sm transition ${copiedLink === 'tg' ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-400' : 'bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>{copiedLink === 'tg' ? '✅ Ссылка скопирована!' : '🔗 Нажмите, чтобы скопировать'}</button>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">🌐 Web-ссылка:</label>
                        <button onClick={() => copyToClipboard(inviteInfo.invite_link, 'web')} className={`w-full text-left px-4 py-3 border rounded-lg text-sm transition ${copiedLink === 'web' ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-400' : 'bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>{copiedLink === 'web' ? '✅ Ссылка скопирована!' : '🔗 Нажмите, чтобы скопировать'}</button>
                    </div>
                </div>
                <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 dark:bg-gray-700 text-white py-3 rounded-xl hover:bg-gray-900 font-medium shadow-md">Закрыть</button>
            </div>
        </div>
      )}

      {/* Управление бригадой */}
      {isManageModalOpen && manageTeamData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-lg my-8 relative transition-colors">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Бригада «{manageTeamData.name}»</h3>
                    <button onClick={() => setManageModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <div className="mb-6">
                    <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3">Состав ({manageTeamData.members.length} чел.)</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 border dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900/50">
                        {manageTeamData.members.map(m => (
                            <div key={m.id} className="flex justify-between items-center bg-white dark:bg-gray-700 p-3 rounded-lg border dark:border-gray-600 shadow-sm text-sm">
                                <div><p className="font-bold text-gray-800 dark:text-gray-200">{m.fio}</p><p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">{m.position} {m.is_linked ? <span className="text-green-600 font-bold ml-1">✓ Привязан</span> : ''}</p></div>
                                {showTeamManagement && (<button onClick={() => handleDeleteMember(m.id, m.fio)} className="text-red-500 dark:text-red-400 font-bold px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg">Удалить</button>)}
                            </div>
                        ))}
                    </div>
                </div>
                {showTeamManagement && (
                    <form onSubmit={handleAddMember} className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800">
                        <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-3 text-sm uppercase tracking-wide">Добавить участника</h4>
                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-3">
                            <input type="text" required value={newMember.fio} onChange={e => setNewMember({...newMember, fio: e.target.value})} placeholder="ФИО" className="w-full sm:w-2/3 px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-sm outline-none" />
                            <input type="text" required value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} placeholder="Должность" className="w-full sm:w-1/3 px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-sm outline-none" />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">Добавить</button>
                    </form>
                )}
            </div>
        </div>
      )}

      {/* Создать бригаду */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm transition-colors">
                <h3 className="text-xl font-bold mb-4 text-center">Новая бригада</h3>
                <form onSubmit={handleCreateTeam}>
                    <input type="text" required value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Название" className="w-full px-3 py-3 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl mb-4 outline-none" />
                    <div className="flex space-x-2">
                        <button type="button" onClick={() => setTeamModalOpen(false)} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-3 rounded-xl font-medium">Отмена</button>
                        <button type="submit" className="w-1/2 bg-blue-600 text-white py-3 rounded-xl font-medium">Создать</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Создать заявку */}
      {isAppModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-md my-8 shadow-2xl transition-colors">
                <h3 className="text-xl font-bold mb-4">Создание заявки</h3>
                <form onSubmit={handleCreateApp} className="space-y-4 text-sm">
                    <div><label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Дата выезда</label><input type="date" required value={appForm.date_target} onChange={e => setAppForm({...appForm, date_target: e.target.value})} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg outline-none" /></div>
                    <div><label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Адрес объекта</label><input type="text" required value={appForm.object_address} onChange={e => setAppForm({...appForm, object_address: e.target.value})} placeholder="Ул. Ленина, 10" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg outline-none" /></div>
                    <div className="flex space-x-3">
                        <div className="w-1/2"><label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Начало (час)</label><input type="number" min="0" max="23" required value={appForm.time_start} onChange={e => setAppForm({...appForm, time_start: e.target.value})} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg text-center outline-none" /></div>
                        <div className="w-1/2"><label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Конец (час)</label><input type="number" min="0" max="23" required value={appForm.time_end} onChange={e => setAppForm({...appForm, time_end: e.target.value})} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg text-center outline-none" /></div>
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Бригада</label>
                        <div className="flex flex-wrap gap-2">
                            {data.teams.map(t => (
                                <button key={t.id} type="button" onClick={() => setAppForm({...appForm, team_id: t.id})} className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${Number(appForm.team_id) === t.id ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>🏗 {t.name}</button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Техника</label>
                        <div className="flex flex-wrap gap-2">
                            {data.equipment.map(e => (
                                <button key={e.id} type="button" onClick={() => setAppForm({...appForm, equip_id: e.id})} className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${Number(appForm.equip_id) === e.id ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>🚜 {e.name}</button>
                            ))}
                        </div>
                    </div>

                    <div><label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Комментарий</label><input type="text" value={appForm.comment} onChange={e => setAppForm({...appForm, comment: e.target.value})} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg outline-none" /></div>

                    <div className="flex space-x-3 pt-4">
                        <button type="button" onClick={() => setAppModalOpen(false)} className="w-1/3 bg-gray-100 dark:bg-gray-700 py-3 rounded-xl font-medium">Отмена</button>
                        <button type="submit" className="w-2/3 bg-blue-600 text-white py-3 rounded-xl font-medium shadow-md">Отправить заявку</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color, text = "text-gray-900 dark:text-gray-100" }) {
  const borders = { blue: 'border-blue-500', green: 'border-emerald-500', red: 'border-red-500', yellow: 'border-yellow-500' };
  return (
    <div className={`bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 ${borders[color]} transition-colors`}>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">{title}</p>
      <p className={`text-3xl font-bold ${text}`}>{value}</p>
    </div>
  );
}
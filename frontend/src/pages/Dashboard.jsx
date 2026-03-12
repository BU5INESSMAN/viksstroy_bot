import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const getSmartDates = () => {
    const today = new Date();
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const labels = ['Сегодня', 'Завтра', 'Послезавтра'];
    return [0, 1, 2].map(i => {
        const d = new Date(today); d.setDate(today.getDate() + i);
        return { val: d.toISOString().split('T')[0], label: `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}, ${days[d.getDay()]} (${labels[i]})` };
    });
};

export default function Dashboard() {
  const smartDates = getSmartDates();

  const [data, setData] = useState({ stats: {}, teams: [], equipment: [], equip_categories: [] });
  const [activeApp, setActiveApp] = useState(null);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
  useEffect(() => {
    const root = window.document.documentElement; root.classList.remove('light', 'dark');
    if (theme === 'system') root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    else root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  const themeIcon = theme === 'light' ? '🌞' : theme === 'dark' ? '🌙' : '💻';
  const themeTitle = theme === 'light' ? 'Светлая тема' : theme === 'dark' ? 'Темная тема' : 'Системная тема';

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', text: '', onConfirm: null, confirmText: 'Да', color: 'blue' });
  const [isTeamModalOpen, setTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const [isManageModalOpen, setManageModalOpen] = useState(false);
  const [manageTeamData, setManageTeamData] = useState(null);
  const [newMember, setNewMember] = useState({ fio: '', position: 'Рабочий', is_foreman: false });

  const [inviteInfo, setInviteInfo] = useState(null);
  const [copiedLink, setCopiedLink] = useState('');
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [profileLogs, setProfileLogs] = useState([]);
  const [editProfile, setEditProfile] = useState({});
  const [isEquipModalOpen, setEquipModalOpen] = useState(false);
  const [equipList, setEquipList] = useState([]);
  const [newEquip, setNewEquip] = useState({ name: '', category: '' });
  const [customCategory, setCustomCategory] = useState('');

  // ЗАЯВКА: НОВЫЕ СОСТОЯНИЯ
  const [isAppModalOpen, setAppModalOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activeEqCategory, setActiveEqCategory] = useState(null); // Текущая открытая категория техники

  const [appForm, setAppForm] = useState({
      date_target: smartDates[0].val,
      object_address: '',
      team_id: '',
      members: [],
      equipment: [], // Массив: [{id: 1, name: "Кран", time_start: "08", time_end: "17"}, ...]
      comment: ''
  });

  const role = localStorage.getItem('user_role') || 'Гость';
  const tgId = localStorage.getItem('tg_id') || '0';
  const navigate = useNavigate();

  const fetchData = () => {
    axios.get('/api/dashboard').then(res => {
        setData(res.data || { stats: {}, teams: [], equipment: [], equip_categories: [] });
        if(res.data?.equip_categories?.length > 0 && !newEquip.category) setNewEquip(prev => ({...prev, category: res.data.equip_categories[0]}));
    }).catch(() => {});
    if (tgId !== '0') axios.get(`/api/applications/active?tg_id=${tgId}`).then(res => setActiveApp(res.data)).catch(() => setActiveApp(null));
    if (['boss', 'superadmin', 'moderator'].includes(role)) axios.get('/api/users').then(res => setUsers(res.data || [])).catch(() => {});
    if (['boss', 'superadmin'].includes(role)) axios.get('/api/logs').then(res => setLogs(res.data || [])).catch(() => {});
  };

  useEffect(() => { fetchData(); setLoading(false); }, [tgId, role]);

  useEffect(() => {
      if (appForm.team_id) {
          axios.get(`/api/teams/${appForm.team_id}/details`).then(res => {
              setTeamMembers(res.data?.members || []);
              setAppForm(prev => ({ ...prev, members: (res.data?.members || []).map(m => m.id) }));
          }).catch(() => setTeamMembers([]));
      } else setTeamMembers([]);
  }, [appForm.team_id]);

  const toggleAppMember = (id) => { setAppForm(prev => ({ ...prev, members: prev.members?.includes(id) ? prev.members.filter(m => m !== id) : [...(prev.members || []), id] })); };

  // УПРАВЛЕНИЕ ТЕХНИКОЙ В ЗАЯВКЕ
  const toggleEquipmentSelection = (equip) => {
      setAppForm(prev => {
          const exists = prev.equipment.find(e => e.id === equip.id);
          if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== equip.id) };
          return { ...prev, equipment: [...prev.equipment, { id: equip.id, name: equip.name, time_start: '08', time_end: '17' }] };
      });
  };

  const updateEquipmentTime = (id, field, value) => {
      setAppForm(prev => ({ ...prev, equipment: prev.equipment.map(e => e.id === id ? { ...e, [field]: value } : e) }));
  };

  const handleLogout = () => { localStorage.removeItem('user_role'); localStorage.removeItem('tg_id'); navigate('/'); };
  const copyToClipboard = (text, type) => { navigator.clipboard.writeText(text); setCopiedLink(type); setTimeout(() => setCopiedLink(''), 2000); };

  const openProfile = async (targetId) => { try { const res = await axios.get(`/api/users/${targetId}/profile`); setProfileData(res.data.profile); setProfileLogs(res.data.logs); setEditProfile({ fio: res.data.profile.fio, role: res.data.profile.role, team_id: res.data.profile.team_id || '', position: res.data.profile.position || '', avatar_url: res.data.profile.avatar_url || '' }); setProfileModalOpen(true); } catch (err) { alert("Ошибка загрузки профиля"); } };
  const handleUpdateAvatar = async () => { const newUrl = prompt("Введите ссылку на новое фото (URL):", editProfile.avatar_url); if (newUrl !== null) { try { const fd = new FormData(); fd.append('avatar_url', newUrl); fd.append('tg_id', tgId); await axios.post(`/api/users/${profileData.user_id}/update_avatar`, fd); setEditProfile({...editProfile, avatar_url: newUrl}); setProfileData({...profileData, avatar_url: newUrl}); } catch (e) { alert("Ошибка"); } } };
  const handleSaveProfile = async () => { try { const fd = new FormData(); fd.append('tg_id', tgId); fd.append('fio', editProfile.fio); fd.append('role', editProfile.role); fd.append('team_id', editProfile.team_id); fd.append('position', editProfile.position); await axios.post(`/api/users/${profileData.user_id}/update_profile`, fd); alert("Успешно!"); setProfileModalOpen(false); fetchData(); } catch (e) { alert("Ошибка"); } };
  const handleDeleteUser = () => { setConfirmDialog({ isOpen: true, title: 'Удаление', text: `Удалить «${profileData?.fio}»?`, confirmText: 'Удалить', color: 'red', onConfirm: async () => { setConfirmDialog({ ...confirmDialog, isOpen: false }); try { const fd = new FormData(); fd.append('tg_id', tgId); await axios.post(`/api/users/${profileData.user_id}/delete`, fd); setProfileModalOpen(false); fetchData(); } catch (e) { alert("Ошибка"); } } }); };
  const openEquipModal = async () => { try { const res = await axios.get('/api/equipment/admin_list'); setEquipList(res.data || []); setEquipModalOpen(true); } catch (e) { alert("Ошибка"); } };
  const handleAddEquip = async (e) => { e.preventDefault(); try { const finalCategory = newEquip.category === 'Другое' ? (customCategory.trim() || 'Без категории') : newEquip.category; const fd = new FormData(); fd.append('name', newEquip.name); fd.append('category', finalCategory); fd.append('tg_id', tgId); await axios.post('/api/equipment/add', fd); setNewEquip({ name: '', category: data.equip_categories?.[0] || '' }); setCustomCategory(''); const res = await axios.get('/api/equipment/admin_list'); setEquipList(res.data || []); fetchData(); } catch (e) { alert("Ошибка"); } };
  const handleToggleEquip = async (id, currentStatus) => { try { const fd = new FormData(); fd.append('is_active', currentStatus ? 0 : 1); fd.append('tg_id', tgId); await axios.post(`/api/equipment/${id}/toggle`, fd); const res = await axios.get('/api/equipment/admin_list'); setEquipList(res.data || []); fetchData(); } catch (e) { alert("Ошибка"); } };
  const handleDeleteEquip = (id, name) => { if (!window.confirm(`Удалить технику ${name}?`)) return; try { const fd = new FormData(); fd.append('tg_id', tgId); axios.post(`/api/equipment/${id}/delete`, fd).then(() => { axios.get('/api/equipment/admin_list').then(res => setEquipList(res.data || [])); fetchData(); }); } catch (e) { alert("Ошибка"); } };
  const handleGenerateInvite = async (teamId) => { try { const res = await axios.post(`/api/teams/${teamId}/generate_invite`); setInviteInfo(res.data); } catch (err) { alert("Ошибка!"); } };
  const handleCreateTeam = async (e) => { e.preventDefault(); try { const fd = new FormData(); fd.append('name', newTeamName); fd.append('tg_id', tgId); await axios.post('/api/teams/create', fd); setTeamModalOpen(false); setNewTeamName(''); fetchData(); } catch (err) { alert("Ошибка"); } };
  const openManageModal = async (teamId) => { try { const res = await axios.get(`/api/teams/${teamId}/details`); setManageTeamData(res.data); setManageModalOpen(true); } catch (err) { alert("Ошибка"); } };
  const handleAddMember = async (e) => { e.preventDefault(); try { const fd = new FormData(); fd.append('fio', newMember.fio); fd.append('position', newMember.position); fd.append('is_foreman', newMember.is_foreman ? 1 : 0); fd.append('tg_id', tgId); await axios.post(`/api/teams/${manageTeamData.id}/members/add`, fd); setNewMember({ fio: '', position: 'Рабочий', is_foreman: false }); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } };
  const handleToggleForeman = async (memberId, currentStatus) => { try { const fd = new FormData(); fd.append('is_foreman', currentStatus ? 0 : 1); fd.append('tg_id', tgId); await axios.post(`/api/teams/members/${memberId}/toggle_foreman`, fd); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } };
  const handleDeleteMember = (memberId, memberName) => { setConfirmDialog({ isOpen: true, title: 'Удалить?', text: `Удалить «${memberName}»?`, confirmText: 'Удалить', color: 'red', onConfirm: async () => { setConfirmDialog({ ...confirmDialog, isOpen: false }); try { const fd = new FormData(); fd.append('tg_id', tgId); await axios.post(`/api/teams/members/${memberId}/delete`, fd); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } }}); };

  const handleCreateApp = async (e) => {
      e.preventDefault();
      if (!appForm.team_id) return alert("Выберите бригаду!");
      if (appForm.members.length === 0) return alert("Выберите хотя бы одного рабочего!");
      try {
          const fd = new FormData();
          fd.append('tg_id', tgId);
          fd.append('date_target', appForm.date_target);
          fd.append('object_address', appForm.object_address);
          fd.append('team_id', appForm.team_id);
          fd.append('comment', appForm.comment);
          fd.append('selected_members', appForm.members.join(','));
          fd.append('equipment_data', JSON.stringify(appForm.equipment)); // Передаем JSON

          await axios.post('/api/applications/create', fd);
          setAppModalOpen(false); fetchData(); alert("Отправлено на модерацию!");
      } catch (err) { alert("Ошибка"); }
  };
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
  const displayCategories = [...(data?.equip_categories || [])];
  if (!displayCategories.includes('Другое')) displayCategories.push('Другое');

  // Форматирование активного наряда (парсинг техники)
  let activeEquipText = activeApp?.equip_name || 'Не требуется';
  if (activeApp?.equipment_data) {
      try {
          const eqList = JSON.parse(activeApp.equipment_data);
          if (eqList && eqList.length > 0) activeEquipText = eqList.map(e => `${e.name} (${e.time_start}:00-${e.time_end}:00)`).join(', ');
      } catch(e){}
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-800 dark:text-gray-200"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-500"></div></div>;

  return (
    <div className="bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 pb-10 transition-colors duration-200">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-transparent dark:border-gray-700 px-4 sm:px-6 py-4 flex justify-between items-center mb-6 transition-colors duration-200">
        <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">ВИКС Расписание</h1>
        <div className="flex items-center space-x-2 sm:space-x-4">
          <button onClick={toggleTheme} className="text-xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition" title={themeTitle}>{themeIcon}</button>
          <button onClick={() => navigate('/guide')} className="flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-transparent hover:border-gray-200 dark:hover:border-gray-600"><span className="text-blue-600 dark:text-blue-300 font-bold text-lg">📖</span><span className="text-sm font-medium hidden md:block">Инструкция</span></button>
          <button onClick={() => openProfile(tgId)} className="flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-transparent hover:border-gray-200 dark:hover:border-gray-600"><div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center overflow-hidden"><span className="text-blue-600 dark:text-blue-300 font-bold text-sm">👤</span></div><span className="text-sm font-medium hidden sm:block">Профиль</span></button>
          <span className="text-sm text-gray-400 dark:text-gray-600 hidden lg:block">|</span>
          <span className="text-sm text-gray-500 dark:text-gray-400 hidden lg:block">Должность: <b className="text-gray-800 dark:text-gray-200">{roleNames[role] || 'Гость'}</b></span>
          <button onClick={handleLogout} className="text-sm font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">Выйти</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {showStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Заявок сегодня" value={data?.stats?.today_total || 0} color="blue" />
              <StatCard title="Одобрено" value={data?.stats?.today_approved || 0} color="green" text="text-green-600 dark:text-green-400" />
              <StatCard title="Отклонено" value={data?.stats?.today_rejected || 0} color="red" text="text-red-600 dark:text-red-400" />
              <StatCard title="Ожидают" value={data?.stats?.waiting_publish || 0} color="yellow" text="text-yellow-600 dark:text-yellow-400" />
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
            <h2 className="text-lg font-bold mb-4 flex items-center">👥 {showTeamManagement ? "Управление бригадами" : "Моя бригада"}</h2>
            {data?.teams?.length > 0 ? (
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
                           <p><b>Дата:</b> {activeApp?.date_target}</p><p><b>Объект:</b> {activeApp?.object_address}</p>
                           <p><b>Техника:</b> {activeEquipText}</p><p><b>Бригада:</b> {activeApp?.team_name}</p>
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
                    {users?.map(u => (
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
                            {logs?.map((log) => (
                                <tr key={log.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString('ru-RU') : ''}</td>
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

      {/* --- МОДАЛЬНЫЕ ОКНА --- */}

      {/* 1. СОЗДАНИЕ ЗАЯВКИ (ИСПРАВЛЕН CSS + НОВАЯ ЛОГИКА ТЕХНИКИ) */}
      {isAppModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden">
                    <div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="text-xl font-bold dark:text-white">Создание заявки</h3>
                        <button onClick={() => setAppModalOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold transition">&times;</button>
                    </div>
                    <form onSubmit={handleCreateApp} className="p-6 space-y-6 text-sm">

                        {/* Дата и Адрес */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">📅 Дата выезда</label>
                                <input type="date" required value={appForm.date_target} onChange={e => setAppForm({...appForm, date_target: e.target.value})} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg outline-none font-bold text-gray-800 dark:text-gray-100 shadow-sm mb-2" />
                                <div className="flex flex-wrap gap-2">
                                    {smartDates.map(d => (<button key={d.val} type="button" onClick={() => setAppForm({...appForm, date_target: d.val})} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${appForm.date_target === d.val ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-sm' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{d.label}</button>))}
                                </div>
                            </div>
                            <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">📍 Адрес объекта</label><input type="text" required value={appForm.object_address} onChange={e => setAppForm({...appForm, object_address: e.target.value})} placeholder="г. Москва, ул. Ленина, 10" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg outline-none font-medium dark:text-white shadow-sm" /></div>
                        </div>

                        <hr className="dark:border-gray-700" />

                        {/* Бригада */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">👥 Выбор Бригады</label>
                            <div className="flex flex-wrap gap-2">
                                {data?.teams?.map(t => (<button key={t.id} type="button" onClick={() => setAppForm({...appForm, team_id: t.id})} className={`px-4 py-2 text-sm font-medium rounded-xl border transition ${Number(appForm.team_id) === t.id ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>🏗 {t.name}</button>))}
                            </div>
                            {teamMembers?.length > 0 && (
                                <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50 shadow-inner">
                                    <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wide">Состав на выезд</label>
                                    <div className="flex flex-wrap gap-2">
                                        {teamMembers.map(m => {
                                            const isSelected = appForm?.members?.includes(m.id);
                                            return (<button key={m.id} type="button" onClick={() => toggleAppMember(m.id)} className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition flex items-center ${isSelected ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}>{isSelected ? <span className="mr-1.5 text-white font-bold">✓</span> : <span className="mr-1.5 opacity-0">✓</span>}{m.fio}</button>)
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <hr className="dark:border-gray-700" />

                        {/* Техника по категориям */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">🚜 Требуемая техника</label>

                            <div className="flex flex-wrap gap-2 mb-2">
                                {data?.equip_categories?.map(cat => (
                                    <button key={cat} type="button" onClick={() => setActiveEqCategory(activeEqCategory === cat ? null : cat)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${activeEqCategory === cat ? 'bg-indigo-500 text-white border-indigo-600 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{cat}</button>
                                ))}
                            </div>

                            {activeEqCategory && (
                                <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 shadow-inner">
                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Техника в категории «{activeEqCategory}»:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {data.equipment?.filter(e => e.category === activeEqCategory || (activeEqCategory === 'Другое' && !data.equip_categories.includes(e.category))).map(e => {
                                            const isSelected = appForm.equipment.some(eq => eq.id === e.id);
                                            return (
                                                <button key={e.id} type="button" onClick={() => toggleEquipmentSelection(e)} className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition flex items-center ${isSelected ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100'}`}>
                                                    {isSelected && <span className="mr-1.5 font-bold">✓</span>} {e.name}
                                                </button>
                                            );
                                        })}
                                        {data.equipment?.filter(e => e.category === activeEqCategory).length === 0 && <p className="text-xs text-gray-400 italic">Нет доступной техники</p>}
                                    </div>
                                </div>
                            )}

                            {appForm.equipment.length > 0 && (
                                <div className="mt-4 space-y-3 p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/50 shadow-inner">
                                    <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide border-b border-indigo-200 dark:border-indigo-800 pb-2 mb-3">Время работы для каждой машины:</label>
                                    {appForm.equipment.map(eq => (
                                        <div key={eq.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-indigo-100 dark:border-indigo-700/50 shadow-sm gap-3">
                                            <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">🚜 {eq.name}</p>
                                            <div className="flex items-center space-x-2">
                                                <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1.5 text-xs font-bold text-gray-500 border-r dark:border-gray-600">С</span>
                                                    <input type="number" min="0" max="23" value={eq.time_start} onChange={e => updateEquipmentTime(eq.id, 'time_start', e.target.value)} className="w-12 text-center py-1.5 text-sm font-bold focus:outline-none dark:bg-gray-800 dark:text-white" />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                                <span className="text-gray-400 font-bold">—</span>
                                                <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1.5 text-xs font-bold text-gray-500 border-r dark:border-gray-600">ДО</span>
                                                    <input type="number" min="0" max="23" value={eq.time_end} onChange={e => updateEquipmentTime(eq.id, 'time_end', e.target.value)} className="w-12 text-center py-1.5 text-sm font-bold focus:outline-none dark:bg-gray-800 dark:text-white" />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <hr className="dark:border-gray-700" />

                        <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">💬 Комментарий</label><input type="text" value={appForm.comment} onChange={e => setAppForm({...appForm, comment: e.target.value})} placeholder="Дополнительная информация..." className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-3 rounded-lg outline-none dark:text-white shadow-sm" /></div>

                        <div className="flex space-x-3 pt-4"><button type="button" onClick={() => setAppModalOpen(false)} className="w-1/3 bg-gray-100 dark:bg-gray-700 py-3.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition">Отмена</button><button type="submit" className="w-2/3 bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition transform hover:scale-[1.02]">Отправить заявку</button></div>
                    </form>
                </div>
            </div>
        </div>
      )}

      {/* 2. УПРАВЛЕНИЕ БРИГАДОЙ (ИСПРАВЛЕН CSS) */}
      {isManageModalOpen && manageTeamData && (
        <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-lg relative transition-colors">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold">Бригада «{manageTeamData?.name}»</h3>
                        <button onClick={() => setManageModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">&times;</button>
                    </div>
                    <div className="mb-6">
                        <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3">Состав ({manageTeamData?.members?.length || 0} чел.)</h4>
                        <div className="max-h-64 overflow-y-auto space-y-2 border dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900/50">
                            {manageTeamData?.members?.map(m => (
                                <div key={m.id} className={`flex justify-between items-center p-3 rounded-lg border shadow-sm text-sm transition-colors ${m.is_foreman ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700/50' : 'bg-white dark:bg-gray-700 dark:border-gray-600'}`}>
                                    <div>
                                        <p className="font-bold text-gray-800 dark:text-gray-200">{m.fio}{m.is_foreman && <span className="ml-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 text-[10px] uppercase font-extrabold px-2 py-0.5 rounded shadow-sm">⭐️ Бригадир</span>}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1.5">{m.position} {m.is_linked ? <span className="text-green-600 font-bold ml-1">✓ Привязан</span> : ''}</p>
                                    </div>
                                    {showTeamManagement && (
                                        <div className="flex flex-col space-y-1">
                                            <button onClick={() => handleToggleForeman(m.id, m.is_foreman)} className={`font-bold px-2 py-1 rounded-md text-xs transition ${m.is_foreman ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300' : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200'}`}>{m.is_foreman ? 'Снять статус' : '⭐️ Назначить'}</button>
                                            <button onClick={() => handleDeleteMember(m.id, m.fio)} className="text-red-500 dark:text-red-400 font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 transition">Удалить</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    {showTeamManagement && (
                        <form onSubmit={handleAddMember} className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800">
                            <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-3 text-sm uppercase tracking-wide">Добавить участника</h4>
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-3">
                                <input type="text" required value={newMember.fio} onChange={e => setNewMember({...newMember, fio: e.target.value})} placeholder="ФИО" className="w-full sm:w-2/3 px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-sm outline-none shadow-sm" />
                                <input type="text" required value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} placeholder="Должность" className="w-full sm:w-1/3 px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-sm outline-none shadow-sm" />
                            </div>
                            <div className="flex items-center mb-4">
                                <input type="checkbox" id="is_foreman_cb" checked={newMember.is_foreman} onChange={e => setNewMember({...newMember, is_foreman: e.target.checked})} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                                <label htmlFor="is_foreman_cb" className="ml-2 text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer">⭐️ Назначить бригадиром</label>
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md">Добавить в состав</button>
                        </form>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* 3. УПРАВЛЕНИЕ АВТОПАРКОМ (ИСПРАВЛЕН CSS) */}
      {isEquipModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden transition-colors">
                    <div className="flex justify-between items-center px-6 py-4 bg-gray-800 dark:bg-gray-900 text-white"><h3 className="text-xl font-bold">🛠 Управление автопарком</h3><button onClick={() => setEquipModalOpen(false)} className="text-gray-300 hover:text-white text-3xl leading-none">&times;</button></div>
                    <div className="p-6">
                        <div className="mb-6 max-h-64 overflow-y-auto border dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50 p-2">
                            {equipList?.length === 0 ? <p className="text-center text-gray-500 py-4">Техника не найдена</p> : null}
                            {equipList?.map(eq => (
                                <div key={eq.id} className={`flex flex-col sm:flex-row justify-between sm:items-center p-3 mb-2 rounded-lg border dark:border-gray-600 shadow-sm transition-colors ${eq.is_active ? 'bg-white dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800 opacity-60'}`}>
                                    <div className="mb-2 sm:mb-0"><p className="font-bold text-gray-800 dark:text-gray-200">{eq.name}</p><p className="text-xs text-gray-500 dark:text-gray-400 uppercase">{eq.category}</p></div>
                                    <div className="flex items-center space-x-2"><button onClick={() => handleToggleEquip(eq.id, eq.is_active)} className={`px-3 py-1.5 rounded text-xs font-bold ${eq.is_active ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 hover:bg-yellow-200' : 'bg-green-100 dark:bg-green-900/30 text-green-700 hover:bg-green-200'}`}>{eq.is_active ? 'В ремонт' : 'В строй'}</button><button onClick={() => handleDeleteEquip(eq.id, eq.name)} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 hover:bg-red-100 rounded text-xs font-bold">Удалить</button></div>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={handleAddEquip} className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800">
                            <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-3 text-sm uppercase">Добавить новую технику</h4>
                            <div className="mb-3"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Название (например: Кран Ивановец 25т)</label><input type="text" required value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none shadow-sm" /></div>
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Категория</label>
                                <div className="flex flex-wrap gap-2">
                                    {displayCategories.map(cat => (<button key={cat} type="button" onClick={() => setNewEquip({...newEquip, category: cat})} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${newEquip.category === cat ? 'bg-blue-500 text-white border-blue-600 shadow-sm' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>{cat}</button>))}
                                </div>
                                {newEquip.category === 'Другое' && (<input type="text" required placeholder="Введите свою категорию..." value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="mt-3 w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none shadow-sm" />)}
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700">Добавить в автопарк</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* 4. ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (ИСПРАВЛЕН CSS) */}
      {isProfileModalOpen && profileData && (
        <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden transition-colors">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 px-6 py-8 text-white relative">
                        <button onClick={() => setProfileModalOpen(false)} className="absolute top-4 right-4 text-white text-3xl font-bold leading-none">&times;</button>
                        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
                            <div className="relative group cursor-pointer" onClick={handleUpdateAvatar}>
                                <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-200 dark:bg-gray-700 bg-cover bg-center overflow-hidden" style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}>{!profileData.avatar_url && <span className="flex items-center justify-center w-full h-full text-4xl text-gray-400">👤</span>}</div>
                            </div>
                            <div className="text-center sm:text-left"><h3 className="text-2xl font-bold">{profileData.fio}</h3><p className="text-blue-200 uppercase tracking-wide text-sm font-semibold mt-1">{roleNames[profileData.role]}</p></div>
                        </div>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider border-b dark:border-gray-700 pb-2">Управление профилем</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">ФИО</label><input type="text" value={editProfile.fio} onChange={e => setEditProfile({...editProfile, fio: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div>
                                <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Специальность</label><input type="text" value={editProfile.position} onChange={e => setEditProfile({...editProfile, position: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div>
                            </div>
                            {canEditUsers && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Бригада</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => setEditProfile({...editProfile, team_id: ''})} className={`px-4 py-2 text-sm font-medium rounded-lg border transition ${!editProfile.team_id ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white dark:bg-gray-700 text-gray-600'}`}>Без бригады</button>
                                        {data?.teams?.map(t => (<button key={t.id} type="button" onClick={() => setEditProfile({...editProfile, team_id: t.id})} className={`px-4 py-2 text-sm font-medium rounded-lg border transition ${Number(editProfile.team_id) === t.id ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white dark:bg-gray-700 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>🏗 {t.name}</button>))}
                                    </div>
                                </div>
                            )}
                            {canEditUsers && profileData.user_id !== Number(tgId) && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Роль</label>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(roleNames).filter(([key]) => key !== 'Гость').map(([key, label]) => (<button key={key} type="button" onClick={() => setEditProfile({...editProfile, role: key})} className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${editProfile.role === key ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white dark:bg-gray-700 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>{label}</button>))}
                                    </div>
                                </div>
                            )}
                            {canEditUsers && (
                                <div className="flex justify-between items-center pt-4 mt-2 border-t dark:border-gray-700"><button onClick={handleDeleteUser} disabled={profileData.user_id === Number(tgId)} className="text-red-500 font-bold text-sm bg-red-50 px-4 py-2.5 rounded-lg disabled:opacity-50 hover:bg-red-100 transition">🗑 Удалить</button><button onClick={handleSaveProfile} className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-md hover:bg-blue-700 transition">Сохранить</button></div>
                            )}
                        </div>
                        <div className="mt-8">
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider border-b dark:border-gray-700 pb-2 mb-4">История действий</h4>
                            {profileLogs?.length > 0 ? (
                                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                                    {profileLogs.map(log => (<div key={log.id} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border border-gray-100 dark:border-gray-600 flex justify-between items-start text-sm"><span className="text-gray-700 dark:text-gray-300">{log.action}</span><span className="text-xs text-gray-400 whitespace-nowrap ml-4">{log.timestamp ? new Date(log.timestamp).toLocaleString('ru-RU') : ''}</span></div>))}
                                </div>
                            ) : (<p className="text-gray-500 dark:text-gray-400 text-sm italic">Действий не найдено.</p>)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* 5. МЕЛКИЕ ОКНА (Окно подтверждения, Инвайт, Создать бригаду) */}
      {confirmDialog.isOpen && (<div className="fixed inset-0 z-[110] bg-black/60 overflow-y-auto backdrop-blur-sm"><div className="flex min-h-screen items-center justify-center p-4"><div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl transition-colors"><h3 className="text-xl font-bold mb-2">{confirmDialog.title}</h3><p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">{confirmDialog.text}</p><div className="flex space-x-3"><button onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-3 rounded-xl font-bold text-gray-700 dark:text-gray-300">Отмена</button><button onClick={confirmDialog.onConfirm} className={`w-1/2 text-white py-3 rounded-xl font-bold shadow-md ${confirmDialog.color === 'red' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>{confirmDialog.confirmText}</button></div></div></div></div>)}
      {inviteInfo && (<div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm"><div className="flex min-h-screen items-center justify-center p-4"><div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl w-full max-w-md"><h3 className="text-xl font-bold mb-6 text-center">Приглашение</h3><div className="space-y-4 mb-6"><div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">✈️ Telegram:</label><button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')} className="w-full text-left px-4 py-3 border rounded-lg text-sm bg-gray-50">{copiedLink === 'tg' ? '✅ Скопировано!' : '🔗 Копировать'}</button></div></div><button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 text-white py-3 rounded-xl font-bold">Закрыть</button></div></div></div>)}
      {isTeamModalOpen && (<div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm"><div className="flex min-h-screen items-center justify-center p-4"><div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm transition-colors"><h3 className="text-xl font-bold mb-4 text-center">Новая бригада</h3><form onSubmit={handleCreateTeam}><input type="text" required value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Название" className="w-full px-3 py-3 border dark:bg-gray-700 rounded-xl mb-4 outline-none" /><div className="flex space-x-2"><button type="button" onClick={() => setTeamModalOpen(false)} className="w-1/2 bg-gray-100 dark:bg-gray-700 py-3 rounded-xl font-bold">Отмена</button><button type="submit" className="w-1/2 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md">Создать</button></div></form></div></div></div>)}
    </div>
  );
}

function StatCard({ title, value, color, text = "text-gray-900 dark:text-gray-100" }) {
  const borders = { blue: 'border-blue-500', green: 'border-emerald-500', red: 'border-red-500', yellow: 'border-yellow-500' };
  return (<div className={`bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 ${borders[color]} transition-colors`}><p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">{title}</p><p className={`text-3xl font-bold ${text}`}>{value}</p></div>);
}
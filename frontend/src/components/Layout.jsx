import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import axios from 'axios';

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';
    const realRole = localStorage.getItem('real_role');

    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
    const [isProfileModalOpen, setProfileModalOpen] = useState(false);
    const [profileData, setProfileData] = useState(null);
    const [editProfile, setEditProfile] = useState({});

    const [isGlobalCreateAppOpen, setGlobalCreateAppOpen] = useState(false);

    useEffect(() => {
        const root = window.document.documentElement; root.classList.remove('light', 'dark');
        if (theme === 'system') root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        else root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
    const themeIcon = theme === 'light' ? '🌞' : theme === 'dark' ? '🌙' : '💻';

    const handleLogout = () => { localStorage.removeItem('user_role'); localStorage.removeItem('tg_id'); localStorage.removeItem('real_role'); navigate('/'); };

    const endRoleTest = () => {
        localStorage.setItem('user_role', realRole);
        localStorage.removeItem('real_role');
        window.location.reload();
    };

    const openProfile = async (targetId) => {
        try {
            const res = await axios.get(`/api/users/${targetId}/profile`);
            setProfileData(res.data.profile);
            setEditProfile({ fio: res.data.profile.fio, role: res.data.profile.role, team_id: res.data.profile.team_id || '', position: res.data.profile.position || '' });
            setProfileModalOpen(true);
        } catch (err) { alert("Ошибка загрузки профиля"); }
    };

    const handleAvatarUpload = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            const fd = new FormData();
            fd.append('avatar_base64', reader.result);
            fd.append('tg_id', tgId);
            try {
                const res = await axios.post(`/api/users/${profileData.user_id}/update_avatar`, fd);
                setProfileData({...profileData, avatar_url: res.data.avatar_url});
            } catch(e) { alert("Ошибка загрузки"); }
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async () => {
        try {
            const fd = new FormData(); fd.append('tg_id', tgId); fd.append('fio', editProfile.fio); fd.append('role', editProfile.role); fd.append('team_id', editProfile.team_id); fd.append('position', editProfile.position);
            await axios.post(`/api/users/${profileData.user_id}/update_profile`, fd);
            alert("Успешно!"); setProfileModalOpen(false);
        } catch (e) { alert("Ошибка сохранения"); }
    };

    const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель', 'Гость': 'Гость' };

    const isWorkerOrDriver = ['worker', 'driver'].includes(role);
    const isForeman = role === 'foreman';
    const isModOrBoss = ['moderator', 'boss', 'superadmin'].includes(role);
    const canEditUsers = ['boss', 'superadmin', 'moderator'].includes(role);

    return (
        <div className="bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 pb-24 transition-colors duration-200">

            {realRole && (
                <div className="bg-yellow-500 text-white text-center py-2 font-bold flex justify-center items-center space-x-4 relative z-50">
                    <span>Тест роли: {roleNames[role]}</span>
                    <button onClick={endRoleTest} className="bg-black/20 hover:bg-black/30 px-3 py-1 rounded-lg text-xs transition">Вернуться</button>
                </div>
            )}

            {/* ИСПРАВЛЕНИЕ: ДОБАВЛЕН pt-16 ЧТОБЫ НЕ ПЕРЕКРЫВАЛОСЬ В ТЕЛЕГРАММЕ */}
            <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-transparent dark:border-gray-700 px-4 sm:px-6 pt-16 pb-3 sm:pt-4 flex justify-between items-center mb-6">

                <div className="flex-1 flex items-center">
                    {/* ДИНАМИЧЕСКИЙ ЛОГОТИП */}
                    <div className="w-28 h-8 bg-blue-600 dark:bg-blue-400 transition-colors" style={{
                        WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                        WebkitMaskSize: 'contain', maskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'left center', maskPosition: 'left center'
                    }}></div>
                </div>

                <div className="flex items-center space-x-1 sm:space-x-2">
                    <button onClick={toggleTheme} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg">{themeIcon}</button>
                    <a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg" title="Техподдержка">💬</a>
                    <button onClick={() => navigate('/guide')} className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-lg" title="Инструкция">📖</button>
                    <button onClick={() => openProfile(tgId)} className="flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-2 py-1.5 rounded-lg transition ml-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center overflow-hidden border border-blue-200 dark:border-blue-700">
                            <span className="text-blue-600 dark:text-blue-300 font-bold text-xs">👤</span>
                        </div>
                    </button>
                </div>
            </nav>

            <Outlet context={{ openProfile, isGlobalCreateAppOpen, setGlobalCreateAppOpen }} />

            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 flex justify-around items-end pb-safe shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] transition-colors h-16">
                <button onClick={() => navigate('/dashboard')} className={`flex flex-col items-center pb-2 w-full transition-colors ${location.pathname === '/dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-0.5">🏠</span><span className="text-[10px] font-bold uppercase tracking-wide">Главная</span></button>

                {isWorkerOrDriver && <button onClick={() => navigate('/my-apps')} className={`flex flex-col items-center pb-2 w-full transition-colors ${location.pathname === '/my-apps' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-0.5">📋</span><span className="text-[10px] font-bold uppercase tracking-wide">Мои заявки</span></button>}

                {isModOrBoss && <button onClick={() => navigate('/equipment')} className={`flex flex-col items-center pb-2 w-full transition-colors ${location.pathname === '/equipment' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-0.5">🚜</span><span className="text-[10px] font-bold uppercase tracking-wide">Автопарк</span></button>}

                {!isWorkerOrDriver && <button onClick={() => navigate('/teams')} className={`flex flex-col items-center pb-2 w-full transition-colors ${location.pathname === '/teams' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-0.5">👥</span><span className="text-[10px] font-bold uppercase tracking-wide">Бригады</span></button>}

                {isForeman && (
                    <div className="relative w-full flex justify-center h-full">
                        <button onClick={() => {navigate('/dashboard'); setGlobalCreateAppOpen(true);}} className="absolute -top-5 bg-blue-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg border-4 border-white dark:border-gray-800 transform hover:scale-105 transition-transform z-50">
                            <span className="text-3xl font-light leading-none mb-1">+</span>
                        </button>
                        <span className="absolute bottom-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Создать</span>
                    </div>
                )}

                {isModOrBoss && <button onClick={() => navigate('/review')} className={`flex flex-col items-center pb-2 w-full transition-colors ${location.pathname === '/review' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-0.5 relative">📋</span><span className="text-[10px] font-bold uppercase tracking-wide">Заявки</span></button>}

                {isModOrBoss && <button onClick={() => navigate('/system')} className={`flex flex-col items-center pb-2 w-full transition-colors ${location.pathname === '/system' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-0.5">⚙️</span><span className="text-[10px] font-bold uppercase tracking-wide">Система</span></button>}
            </div>

            {/* ПРОФИЛЬ (МОДАЛКА ИЗ LAYOUT) */}
            {isProfileModalOpen && profileData && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm"><div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24"><div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden transition-colors"><div className="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 px-6 py-8 text-white relative"><button onClick={() => setProfileModalOpen(false)} className="absolute top-4 right-4 text-white text-3xl font-bold leading-none">&times;</button><div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
                    <label className="relative group cursor-pointer block">
                        <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-200 dark:bg-gray-700 bg-cover bg-center overflow-hidden" style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}>{!profileData.avatar_url && <span className="flex items-center justify-center w-full h-full text-4xl text-gray-400">👤</span>}</div>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-xs font-bold text-white text-center px-2">Изменить</span></div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                <div className="text-center sm:text-left"><h3 className="text-2xl font-bold">{profileData.fio}</h3><p className="text-blue-200 uppercase tracking-wide text-sm font-semibold mt-1">{roleNames[profileData.role]}</p></div></div></div><div className="p-6 space-y-6"><div className="space-y-4"><h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider border-b dark:border-gray-700 pb-2">Управление профилем</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">ФИО</label><input type="text" value={editProfile.fio} onChange={e => setEditProfile({...editProfile, fio: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Специальность</label><input type="text" value={editProfile.position} onChange={e => setEditProfile({...editProfile, position: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div></div>{canEditUsers && (<div className="flex justify-end pt-4 mt-2 border-t dark:border-gray-700"><button onClick={handleSaveProfile} className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-md hover:bg-blue-700 transition">Сохранить</button></div>)}</div></div></div></div></div>
            )}
        </div>
    );
}
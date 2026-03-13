import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import axios from 'axios';

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';

    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
    const [isProfileModalOpen, setProfileModalOpen] = useState(false);
    const [profileData, setProfileData] = useState(null);
    const [profileLogs, setProfileLogs] = useState([]);
    const [editProfile, setEditProfile] = useState({});

    useEffect(() => {
        const root = window.document.documentElement; root.classList.remove('light', 'dark');
        if (theme === 'system') root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        else root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
    const themeIcon = theme === 'light' ? '🌞' : theme === 'dark' ? '🌙' : '💻';

    const handleLogout = () => { localStorage.removeItem('user_role'); localStorage.removeItem('tg_id'); navigate('/'); };

    const openProfile = async (targetId) => {
        try {
            const res = await axios.get(`/api/users/${targetId}/profile`);
            setProfileData(res.data.profile); setProfileLogs(res.data.logs);
            setEditProfile({ fio: res.data.profile.fio, role: res.data.profile.role, team_id: res.data.profile.team_id || '', position: res.data.profile.position || '' });
            setProfileModalOpen(true);
        } catch (err) { alert("Ошибка загрузки профиля"); }
    };

    // ЗАГРУЗКА АВАТАРКИ ИЗ ГАЛЕРЕИ (BASE64)
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

    const showEquipNav = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const showReviewNav = ['moderator', 'boss', 'superadmin'].includes(role);
    const showSystemNav = ['boss', 'superadmin', 'moderator'].includes(role);
    const canEditUsers = ['boss', 'superadmin', 'moderator'].includes(role);

    return (
        <div className="bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 pb-24 transition-colors duration-200">

            <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-transparent dark:border-gray-700 px-4 sm:px-6 py-4 flex justify-between items-center mb-6">
                <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400 hidden sm:block">ВИКС Расписание</h1>
                <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400 sm:hidden">ВИКС</h1>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={toggleTheme} className="text-xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">{themeIcon}</button>
                    <a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition" title="Техподдержка">
                        <span className="text-xl">💬</span><span className="text-sm font-bold text-blue-600 dark:text-blue-400 hidden md:block">Поддержка</span>
                    </a>
                    <button onClick={() => navigate('/guide')} className="flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-transparent">
                        <span className="text-blue-600 dark:text-blue-300 font-bold text-lg">📖</span><span className="text-sm font-medium hidden md:block">Инструкция</span>
                    </button>
                    <button onClick={() => openProfile(tgId)} className="flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition border border-transparent">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center overflow-hidden"><span className="text-blue-600 dark:text-blue-300 font-bold text-sm">👤</span></div>
                        <span className="text-sm font-medium hidden sm:block">Профиль</span>
                    </button>
                    <button onClick={handleLogout} className="text-sm font-medium text-red-500 dark:text-red-400 hover:text-red-700 transition">Выйти</button>
                </div>
            </nav>

            <Outlet context={{ openProfile }} />

            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 flex justify-around items-center pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors">
                <button onClick={() => navigate('/dashboard')} className={`flex flex-col items-center py-3 w-full transition-colors ${location.pathname === '/dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-1">🏠</span><span className="text-[10px] font-bold uppercase tracking-wide">Главная</span></button>
                {showEquipNav && <button onClick={() => navigate('/equipment')} className={`flex flex-col items-center py-3 w-full transition-colors ${location.pathname === '/equipment' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-1">🚜</span><span className="text-[10px] font-bold uppercase tracking-wide">Автопарк</span></button>}
                <button onClick={() => navigate('/teams')} className={`flex flex-col items-center py-3 w-full transition-colors ${location.pathname === '/teams' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-1">👥</span><span className="text-[10px] font-bold uppercase tracking-wide">Бригады</span></button>
                {showReviewNav && <button onClick={() => navigate('/review')} className={`flex flex-col items-center py-3 w-full relative transition-colors ${location.pathname === '/review' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-1">📋</span><span className="text-[10px] font-bold uppercase tracking-wide">Заявки</span></button>}
                {showSystemNav && <button onClick={() => navigate('/system')} className={`flex flex-col items-center py-3 w-full transition-colors ${location.pathname === '/system' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><span className="text-2xl mb-1">⚙️</span><span className="text-[10px] font-bold uppercase tracking-wide">Система</span></button>}
            </div>

            {/* ПРОФИЛЬ (МОДАЛКА ИЗ LAYOUT) */}
            {isProfileModalOpen && profileData && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm"><div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24"><div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden transition-colors"><div className="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 px-6 py-8 text-white relative"><button onClick={() => setProfileModalOpen(false)} className="absolute top-4 right-4 text-white text-3xl font-bold leading-none">&times;</button><div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
                    <label className="relative group cursor-pointer block">
                        <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-200 dark:bg-gray-700 bg-cover bg-center overflow-hidden" style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}>{!profileData.avatar_url && <span className="flex items-center justify-center w-full h-full text-4xl text-gray-400">👤</span>}</div>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-xs font-bold text-white text-center px-2">Изменить</span></div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                <div className="text-center sm:text-left"><h3 className="text-2xl font-bold">{profileData.fio}</h3><p className="text-blue-200 uppercase tracking-wide text-sm font-semibold mt-1">Должность в системе</p></div></div></div><div className="p-6 space-y-6"><div className="space-y-4"><h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider border-b dark:border-gray-700 pb-2">Управление профилем</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">ФИО</label><input type="text" value={editProfile.fio} onChange={e => setEditProfile({...editProfile, fio: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Специальность</label><input type="text" value={editProfile.position} onChange={e => setEditProfile({...editProfile, position: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div></div>{canEditUsers && (<div className="flex justify-end pt-4 mt-2 border-t dark:border-gray-700"><button onClick={handleSaveProfile} className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-md hover:bg-blue-700 transition">Сохранить</button></div>)}</div></div></div></div></div>
            )}
        </div>
    );
}
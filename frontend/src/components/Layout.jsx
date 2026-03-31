import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import axios from 'axios';
import {
    Home, ClipboardList, Truck, Users, Settings as SettingsIcon, User,
    Plus, Sun, Moon, Monitor, BookOpen, Rocket, MessageCircle,
    Send, Smartphone, X, Camera, Trash2, Unplug, ShieldCheck
} from 'lucide-react';

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

    const [linkCode, setLinkCode] = useState('');

    const [isTMA, setIsTMA] = useState(false);
    const [isGlobalCreateAppOpen, setGlobalCreateAppOpen] = useState(false);

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const root = window.document.documentElement; root.classList.remove('light', 'dark');
        if (theme === 'system') root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        else root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.initData) {
            setIsTMA(true);
            tg.expand();
            if (tg.disableVerticalSwipes) {
                tg.disableVerticalSwipes();
            }
        }
        if (window.location.pathname.includes('/max') || window.location.search.includes('WebAppData') || window.location.hash.includes('WebAppData')) {
            setIsTMA(true);
        }

        document.body.style.overscrollBehaviorY = 'none';
    }, []);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

    const endRoleTest = () => { localStorage.setItem('user_role', realRole); localStorage.removeItem('real_role'); window.location.reload(); };

    const openProfile = async (targetId, entityType = 'tg', entityId = 0) => {
        try {
            let url = `/api/users/${targetId || 0}/profile?`;
            if (entityType === 'member') url += `member_id=${entityId}`;
            else if (entityType === 'equip') url += `equip_id=${entityId}`;

            const res = await axios.get(url);
            const newProfileData = { ...res.data.profile, links: res.data.links || {} };
            setProfileData(newProfileData);

            if (!newProfileData.unregistered) {
                setEditProfile({
                    fio: res.data.profile.fio,
                    role: res.data.profile.role,
                    team_id: res.data.profile.team_id || '',
                    position: res.data.profile.position || '',
                    max_invite_link: res.data.profile.max_invite_link || ''
                });
            }
            setLinkCode('');
            setProfileModalOpen(true);
        } catch (err) { alert("Ошибка загрузки профиля"); }
    };

    const handleAvatarUpload = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            const fd = new FormData(); fd.append('avatar_base64', reader.result); fd.append('tg_id', tgId);
            try {
                const res = await axios.post(`/api/users/${profileData.user_id}/update_avatar`, fd);
                setProfileData({...profileData, avatar_url: res.data.avatar_url});
            } catch(e) { alert("Ошибка загрузки"); }
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async () => {
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('fio', editProfile.fio);
            fd.append('role', editProfile.role);
            fd.append('team_id', editProfile.team_id);
            fd.append('position', editProfile.position);
            fd.append('max_invite_link', editProfile.max_invite_link || '');

            await axios.post(`/api/users/${profileData.user_id}/update_profile`, fd);
            alert("Успешно!"); setProfileModalOpen(false); window.location.reload();
        } catch (e) { alert("Ошибка сохранения"); }
    };

    const handleDeleteUser = async () => {
        if (!window.confirm(`Вы уверены, что хотите полностью удалить пользователя ${profileData.fio}? Это действие нельзя отменить.`)) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/users/${profileData.user_id}/delete`, fd);
            alert("Пользователь успешно удален из системы.");
            setProfileModalOpen(false);
            window.location.reload();
        } catch (e) { alert("Ошибка удаления пользователя"); }
    };

    const handleLinkAccount = async () => {
        if (!linkCode) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('code', linkCode);
            const res = await axios.post('/api/users/link_account', fd);

            localStorage.setItem('tg_id', res.data.new_tg_id);
            localStorage.setItem('user_role', res.data.role);

            alert("Аккаунты успешно связаны!");
            window.location.reload();
        } catch (e) {
            alert(e.response?.data?.detail || "Ошибка привязки. Проверьте правильность кода.");
        }
    };

    const handleUnlinkPlatform = async (platform) => {
        const platformName = platform === 'max' ? 'MAX' : 'Telegram';
        if (!window.confirm(`Вы уверены, что хотите отвязать мессенджер ${platformName}?`)) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('platform', platform);
            await axios.post('/api/users/unlink_platform', fd);
            alert(`Мессенджер ${platformName} успешно отвязан.`);
            window.location.reload();
        } catch (e) {
            alert(e.response?.data?.detail || "Ошибка при отвязке.");
        }
    };

    const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель', 'Гость': 'Гость' };

    const isWorkerOrDriver = ['worker', 'driver'].includes(role);
    const canCreateApp = ['foreman', 'boss', 'superadmin'].includes(role);
    const isModOrBoss = ['moderator', 'boss', 'superadmin'].includes(role);
    const canEditUsers = ['boss', 'superadmin', 'moderator'].includes(role);
    const isMyProfile = profileData && profileData.user_id === Number(tgId);

    return (
        <div className="bg-gray-50/50 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 pb-24 transition-colors duration-200 selection:bg-blue-200 dark:selection:bg-blue-900/50">
            <header className={`bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700/80 mb-6 ${isTMA ? 'pt-16' : 'pt-4'}`}>
                {realRole && (
                    <div className="bg-purple-600 text-white text-center py-2.5 font-bold flex justify-center items-center space-x-4 relative z-50 shadow-sm text-sm">
                        <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Тест роли: {roleNames[role]}</span>
                        <button onClick={endRoleTest} className="bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-lg text-xs transition-colors active:scale-95">Вернуться</button>
                    </div>
                )}
                <nav className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center relative max-w-7xl mx-auto">
                    <div className="flex-1 flex items-center">
                        <div className="w-32 h-9 bg-blue-600 dark:bg-blue-500 transition-colors" style={{
                            WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                            WebkitMaskSize: 'contain', maskSize: 'contain',
                            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                            WebkitMaskPosition: 'left center', maskPosition: 'left center'
                        }}></div>
                    </div>

                    <div className="relative flex items-center">
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`flex items-center justify-center w-11 h-11 rounded-xl transition-all active:scale-95 ${isMenuOpen ? 'bg-gray-100 dark:bg-gray-700 text-blue-600 dark:text-blue-400' : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                            {isMenuOpen ? <X className="w-6 h-6" /> : <div className="space-y-1.5"><span className="block w-5 h-0.5 bg-current rounded-full"></span><span className="block w-5 h-0.5 bg-current rounded-full"></span><span className="block w-5 h-0.5 bg-current rounded-full"></span></div>}
                        </button>

                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-[90]" onClick={() => setIsMenuOpen(false)}></div>
                                <div className="absolute top-full right-0 mt-3 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-[100] overflow-hidden transition-all origin-top-right">
                                    <div className="flex flex-col py-2">
                                        <button onClick={() => { setIsMenuOpen(false); navigate('/guide'); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><BookOpen className="w-5 h-5 text-indigo-500" /> Инструкция</button>
                                        <button onClick={() => { setIsMenuOpen(false); navigate('/updates'); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><Rocket className="w-5 h-5 text-emerald-500" /> Обновления</button>
                                        <a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><MessageCircle className="w-5 h-5 text-blue-500" /> Техподдержка</a>
                                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-2 mx-4"></div>
                                        <button onClick={() => { toggleTheme(); setIsMenuOpen(false); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><ThemeIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" /> {theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'Светлая тема' : 'Темная тема'}</button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </nav>
            </header>

            <Outlet context={{ openProfile, isGlobalCreateAppOpen, setGlobalCreateAppOpen }} />

            {/* НИЖНЕЕ МЕНЮ НАВИГАЦИИ */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-100 dark:border-gray-700 z-40 flex justify-around items-end pb-safe shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.05)] transition-colors h-[72px] px-2 sm:px-6">
                <button onClick={() => navigate('/dashboard')} className={`flex flex-col items-center justify-end pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                    <Home className={`w-6 h-6 mb-1 ${location.pathname === '/dashboard' ? 'fill-current' : ''}`} strokeWidth={location.pathname === '/dashboard' ? 2.5 : 2} />
                    <span className="text-[10px] font-extrabold uppercase tracking-wide">Главная</span>
                </button>

                {isWorkerOrDriver && <button onClick={() => navigate('/my-apps')} className={`flex flex-col items-center justify-end pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/my-apps' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><ClipboardList className="w-6 h-6 mb-1" strokeWidth={location.pathname === '/my-apps' ? 2.5 : 2} /><span className="text-[10px] font-extrabold uppercase tracking-wide">Заявки</span></button>}

                {isModOrBoss && <button onClick={() => navigate('/equipment')} className={`flex flex-col items-center justify-end pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/equipment' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><Truck className="w-6 h-6 mb-1" strokeWidth={location.pathname === '/equipment' ? 2.5 : 2} /><span className="text-[10px] font-extrabold uppercase tracking-wide">Автопарк</span></button>}

                {!isWorkerOrDriver && <button onClick={() => navigate('/teams')} className={`flex flex-col items-center justify-end pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/teams' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><Users className="w-6 h-6 mb-1" strokeWidth={location.pathname === '/teams' ? 2.5 : 2} /><span className="text-[10px] font-extrabold uppercase tracking-wide">Бригады</span></button>}

                {canCreateApp && (
                    <div className="relative w-full flex justify-center h-full">
                        <button onClick={() => {navigate('/dashboard'); setGlobalCreateAppOpen(true);}} className="absolute -top-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] border-4 border-white dark:border-gray-800 transition-all active:scale-95 z-50">
                            <Plus className="w-7 h-7" strokeWidth={2.5} />
                        </button>
                        <span className="absolute bottom-2.5 text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Создать</span>
                    </div>
                )}

                {isModOrBoss && <button onClick={() => navigate('/review')} className={`flex flex-col items-center justify-end pb-2.5 h-full w-full transition-all active:scale-95 relative ${location.pathname === '/review' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><ClipboardList className="w-6 h-6 mb-1" strokeWidth={location.pathname === '/review' ? 2.5 : 2} /><span className="text-[10px] font-extrabold uppercase tracking-wide">Заявки</span></button>}

                {isModOrBoss && <button onClick={() => navigate('/system')} className={`flex flex-col items-center justify-end pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/system' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><SettingsIcon className="w-6 h-6 mb-1" strokeWidth={location.pathname === '/system' ? 2.5 : 2} /><span className="text-[10px] font-extrabold uppercase tracking-wide">Система</span></button>}

                <button onClick={() => openProfile(tgId)} className={`flex flex-col items-center justify-end pb-2.5 h-full w-full transition-all active:scale-95 ${isProfileModalOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                    <User className="w-6 h-6 mb-1" strokeWidth={isProfileModalOpen ? 2.5 : 2} />
                    <span className="text-[10px] font-extrabold uppercase tracking-wide">Профиль</span>
                </button>
            </div>

            {/* МОДАЛЬНОЕ ОКНО ПРОФИЛЯ */}
            {isProfileModalOpen && profileData && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                        <div className="bg-white dark:bg-gray-800 rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden transition-colors border border-gray-100 dark:border-gray-700">

                            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 dark:from-gray-800 dark:to-gray-900 px-6 py-10 text-white relative">
                                <button onClick={() => setProfileModalOpen(false)} className="absolute top-5 right-5 text-white/70 hover:text-white transition-colors bg-black/20 hover:bg-black/40 rounded-full p-2 backdrop-blur-sm active:scale-95">
                                    <X className="w-6 h-6" />
                                </button>
                                <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-5 sm:space-y-0 sm:space-x-6 relative z-10">
                                    <label className="relative group cursor-pointer block">
                                        <div className="w-28 h-28 rounded-3xl border-4 border-white/20 dark:border-gray-700 shadow-xl bg-gray-200 dark:bg-gray-800 bg-cover bg-center overflow-hidden transition-transform group-hover:scale-105" style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}>
                                            {!profileData.avatar_url && <User className="w-16 h-16 text-gray-400 dark:text-gray-600 m-auto mt-5" />}
                                        </div>
                                        {(!profileData.unregistered) && (
                                            <>
                                                <div className="absolute inset-0 bg-black/50 rounded-3xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Camera className="w-6 h-6 text-white mb-1" />
                                                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Фото</span>
                                                </div>
                                                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                            </>
                                        )}
                                    </label>
                                    <div className="text-center sm:text-left pt-2">
                                        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">{profileData.fio}</h3>
                                        <p className="text-blue-200 dark:text-gray-400 uppercase tracking-widest text-xs font-bold mt-2 bg-black/20 dark:bg-black/40 inline-block px-3 py-1 rounded-lg backdrop-blur-sm">{roleNames[profileData.role] || profileData.role}</p>
                                    </div>
                                </div>
                            </div>

                            {profileData.unregistered ? (
                                <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 border-dashed mt-6 mx-6 mb-6">
                                    <Unplug className="w-12 h-12 text-gray-400 mx-auto mb-4 opacity-50" />
                                    <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Аккаунт не привязан</h4>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">Этот сотрудник был добавлен в систему, но еще ни разу не авторизовался и не привязал свой мессенджер.</p>
                                </div>
                            ) : (
                                <div className="p-6 sm:p-8 space-y-8">
                                    {/* КОНТАКТЫ ПОЛЬЗОВАТЕЛЯ */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className={`flex items-start p-4 rounded-2xl border transition-all ${profileData.links.has_tg ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50 hover:border-blue-300' : 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700 shadow-sm'}`}>
                                            <Send className={`w-6 h-6 mr-3 mt-0.5 ${profileData.links.has_tg ? 'text-blue-500' : 'text-gray-400'}`} />
                                            <div className="w-full">
                                                <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-1">Telegram</p>
                                                {profileData.links.has_tg ? (
                                                    <a href={`tg://user?id=${profileData.links.tg_account_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">Написать в ЛС</a>
                                                ) : (
                                                    <p className="text-sm font-bold text-gray-400 dark:text-gray-500">Не привязан</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className={`flex items-start p-4 rounded-2xl border transition-all ${profileData.links.has_max ? 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800/50 hover:border-indigo-300' : 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700 shadow-sm'}`}>
                                            <Smartphone className={`w-6 h-6 mr-3 mt-0.5 ${profileData.links.has_max ? 'text-indigo-500' : 'text-gray-400'}`} />
                                            <div className="w-full">
                                                <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-1">MAX</p>
                                                {profileData.links.has_max ? (
                                                    <>
                                                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">ID: {profileData.links.max_account_id}</p>
                                                        {profileData.max_invite_link ? (
                                                            <a href={profileData.max_invite_link} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> Чат</a>
                                                        ) : (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">Ссылка не привязана</p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-sm font-bold text-gray-400 dark:text-gray-500">Не привязан</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* УПРАВЛЕНИЕ ПРОФИЛЕМ */}
                                    {(canEditUsers || isMyProfile) && (
                                        <div className="space-y-5 bg-gray-50/50 dark:bg-gray-700/20 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                                            <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm"><User className="w-4 h-4 text-gray-400" /> Данные профиля</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">ФИО</label>
                                                    <input type="text" value={editProfile.fio} onChange={e => setEditProfile({...editProfile, fio: e.target.value})} disabled={!canEditUsers} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none font-medium disabled:opacity-70 focus:ring-2 focus:ring-blue-500 dark:text-white shadow-sm transition-colors" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Специальность</label>
                                                    <input type="text" value={editProfile.position} onChange={e => setEditProfile({...editProfile, position: e.target.value})} disabled={!canEditUsers} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none font-medium disabled:opacity-70 focus:ring-2 focus:ring-blue-500 dark:text-white shadow-sm transition-colors" />
                                                </div>

                                                <div className="sm:col-span-2">
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Ссылка-приглашение MAX (Для диалога)</label>
                                                    <input type="text" placeholder="Например: https://max.ru/invite/..." value={editProfile.max_invite_link} onChange={e => setEditProfile({...editProfile, max_invite_link: e.target.value})} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500 transition-colors" />
                                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 font-medium">* Добавьте сюда вашу прямую ссылку, чтобы коллеги могли написать вам в мессенджер MAX.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ПРИВЯЗКА УСТРОЙСТВ */}
                                    {isMyProfile && profileData.links && (
                                        <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                                            <h4 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2 text-sm mb-4"><ShieldCheck className="w-4 h-4 text-indigo-500" /> Привязка мессенджеров</h4>

                                            {!profileData.links.has_max && (
                                                <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                                    <span className="font-bold text-indigo-600 dark:text-indigo-400">MAX:</span> Для привязки отправьте <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono font-bold border border-gray-200 dark:border-gray-600">/web</code> в MAX боте и введите код ниже.
                                                </div>
                                            )}

                                            {!profileData.links.has_tg && (
                                                <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                                    <span className="font-bold text-blue-600 dark:text-blue-400">Telegram:</span> Для привязки отправьте <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono font-bold border border-gray-200 dark:border-gray-600">/web</code> в <a href="https://t.me/viksstroy_bot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-bold">Telegram боте</a> и введите код ниже.
                                                </div>
                                            )}

                                            {(!profileData.links.has_max || !profileData.links.has_tg) && (
                                                <div className="flex gap-2 mb-2">
                                                    <input type="text" maxLength={6} value={linkCode} onChange={e => setLinkCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="w-full px-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl outline-none font-mono tracking-[0.3em] text-center shadow-inner focus:ring-2 focus:ring-indigo-500 transition-colors" />
                                                    <button onClick={handleLinkAccount} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 whitespace-nowrap">Привязать</button>
                                                </div>
                                            )}

                                            {profileData.links.is_linked && (
                                                <div className="mt-5">
                                                    <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 mb-2 uppercase tracking-wider">Привязанные устройства:</p>
                                                    <div className="flex flex-col gap-2">
                                                        {profileData.links.has_max && (
                                                            <div className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Smartphone className="w-4 h-4 text-indigo-500" /> MAX</span>
                                                                <button onClick={() => handleUnlinkPlatform('max')} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-red-100 dark:border-red-800/50 active:scale-95">Отвязать</button>
                                                            </div>
                                                        )}
                                                        {profileData.links.has_tg && (
                                                            <div className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Send className="w-4 h-4 text-blue-500" /> Telegram</span>
                                                                <button onClick={() => handleUnlinkPlatform('tg')} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-red-100 dark:border-red-800/50 active:scale-95">Отвязать</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* КНОПКИ СОХРАНЕНИЯ */}
                                    {(canEditUsers || isMyProfile) && (
                                        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                                            {canEditUsers && !isMyProfile && (
                                                <button onClick={handleDeleteUser} className="w-full sm:w-1/3 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 font-bold py-3.5 rounded-xl transition-all shadow-sm active:scale-95 flex justify-center items-center gap-2 border border-red-200 dark:border-red-800/50">
                                                    <Trash2 className="w-4 h-4" /> Удалить
                                                </button>
                                            )}
                                            <button onClick={handleSaveProfile} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98] flex justify-center items-center">
                                                Сохранить изменения
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
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
        // MAX detection check added to Layout specific for top padding
        if (window.location.pathname.includes('/max') || window.location.search.includes('WebAppData') || window.location.hash.includes('WebAppData')) {
            setIsTMA(true);
        }

        document.body.style.overscrollBehaviorY = 'none';
    }, []);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
    const themeIcon = theme === 'light' ? '🌞' : theme === 'dark' ? '🌙' : '💻';

    const endRoleTest = () => { localStorage.setItem('user_role', realRole); localStorage.removeItem('real_role'); window.location.reload(); };

    const openProfile = async (targetId) => {
        try {
            const res = await axios.get(`/api/users/${targetId}/profile`);
            const newProfileData = { ...res.data.profile, links: res.data.links };
            setProfileData(newProfileData);
            setEditProfile({ fio: res.data.profile.fio, role: res.data.profile.role, team_id: res.data.profile.team_id || '', position: res.data.profile.position || '' });
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
            const fd = new FormData(); fd.append('tg_id', tgId); fd.append('fio', editProfile.fio); fd.append('role', editProfile.role); fd.append('team_id', editProfile.team_id); fd.append('position', editProfile.position);
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
    const isForeman = role === 'foreman';
    const isModOrBoss = ['moderator', 'boss', 'superadmin'].includes(role);
    const canEditUsers = ['boss', 'superadmin', 'moderator'].includes(role);

    return (
        <div className="bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 pb-24 transition-colors duration-200">
            <header className={`bg-white dark:bg-gray-800 shadow-sm border-b border-transparent dark:border-gray-700 mb-6 ${isTMA ? 'pt-8' : 'pt-4'}`}>
                {realRole && (
                    <div className="bg-yellow-500 text-white text-center py-2 font-bold flex justify-center items-center space-x-4 relative z-50">
                        <span>Тест роли: {roleNames[role]}</span>
                        <button onClick={endRoleTest} className="bg-black/20 hover:bg-black/30 px-3 py-1 rounded-lg text-xs transition">Вернуться</button>
                    </div>
                )}
                <nav className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center relative">
                    <div className="flex-1 flex items-center">
                        <div className="w-28 h-8 bg-blue-600 dark:bg-blue-400 transition-colors" style={{
                            WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                            WebkitMaskSize: 'contain', maskSize: 'contain',
                            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                            WebkitMaskPosition: 'left center', maskPosition: 'left center'
                        }}></div>
                    </div>

                    <div className="relative flex items-center">
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition border border-transparent dark:border-gray-600">
                            {isMenuOpen ? (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>) : (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>)}
                        </button>

                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-[90]" onClick={() => setIsMenuOpen(false)}></div>
                                <div className="absolute top-full right-0 mt-3 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-[100] overflow-hidden transition-all origin-top-right">
                                    <div className="flex flex-col py-2">
                                        <button onClick={() => { setIsMenuOpen(false); openProfile(tgId); }} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><span className="mr-3 text-xl">👤</span> Мой профиль</button>
                                        <button onClick={() => { setIsMenuOpen(false); navigate('/guide'); }} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><span className="mr-3 text-xl">📖</span> Инструкция</button>
                                        <button onClick={() => { setIsMenuOpen(false); navigate('/updates'); }} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><span className="mr-3 text-xl">🚀</span> Обновления</button>
                                        <a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" onClick={() => setIsMenuOpen(false)} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><span className="mr-3 text-xl">💬</span> Техподдержка</a>
                                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-4"></div>
                                        <button onClick={() => { toggleTheme(); setIsMenuOpen(false); }} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><span className="mr-3 text-xl">{themeIcon}</span> {theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'Светлая тема' : 'Темная тема'}</button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </nav>
            </header>

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

            {isProfileModalOpen && profileData && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm"><div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24"><div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden transition-colors"><div className="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 px-6 py-8 text-white relative"><button onClick={() => setProfileModalOpen(false)} className="absolute top-4 right-4 text-white text-3xl font-bold leading-none">&times;</button><div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
                    <label className="relative group cursor-pointer block">
                        <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-200 dark:bg-gray-700 bg-cover bg-center overflow-hidden" style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}>{!profileData.avatar_url && <span className="flex items-center justify-center w-full h-full text-4xl text-gray-400">👤</span>}</div>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-xs font-bold text-white text-center px-2">Изменить</span></div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                <div className="text-center sm:text-left"><h3 className="text-2xl font-bold">{profileData.fio}</h3><p className="text-blue-200 uppercase tracking-wide text-sm font-semibold mt-1">{roleNames[profileData.role]}</p></div></div></div><div className="p-6 space-y-6">

                {/* КОНТАКТЫ ПОЛЬЗОВАТЕЛЯ (ВИДНО ВСЕМ) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b dark:border-gray-700 pb-6">
                    <div className={`flex items-center px-4 py-3 rounded-xl border ${profileData.links.has_tg ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 shadow-sm'}`}>
                        <span className="text-2xl mr-3">✈️</span>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Telegram</p>
                            {profileData.links.has_tg ? (
                                <a href={`tg://user?id=${profileData.links.tg_account_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">
                                    Написать в ЛС
                                </a>
                            ) : (
                                <p className="text-sm font-bold text-gray-400 dark:text-gray-500">Не привязан</p>
                            )}
                        </div>
                    </div>

                    <div className={`flex items-center px-4 py-3 rounded-xl border ${profileData.links.has_max ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 shadow-sm'}`}>
                        <span className="text-2xl mr-3">📱</span>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">MAX</p>
                            {profileData.links.has_max ? (
                                <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                    Привязан (ID: {profileData.links.max_account_id})
                                </p>
                            ) : (
                                <p className="text-sm font-bold text-gray-400 dark:text-gray-500">Не привязан</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4"><h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider border-b dark:border-gray-700 pb-2">Управление профилем</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">ФИО</label><input type="text" value={editProfile.fio} onChange={e => setEditProfile({...editProfile, fio: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Специальность</label><input type="text" value={editProfile.position} onChange={e => setEditProfile({...editProfile, position: e.target.value})} disabled={!canEditUsers} className="w-full px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none disabled:opacity-70" /></div></div>

                {profileData.user_id === Number(tgId) && profileData.links && (
                    <div className="mt-6 pt-4 border-t dark:border-gray-700">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase text-sm tracking-wider mb-3">Привязка мессенджеров</h4>

                        {!profileData.links.has_max && (
                            <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                    <span className="font-bold">MAX:</span> Для привязки отправьте <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-800 dark:text-gray-200 font-mono">/web</code> в MAX боте и введите код ниже.
                                </p>
                            </div>
                        )}

                        {!profileData.links.has_tg && (
                            <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                    <span className="font-bold">Telegram:</span> Для привязки отправьте <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-800 dark:text-gray-200 font-mono">/web</code> в <a href="https://t.me/viksstroy_bot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline font-medium">Telegram боте</a> и введите код ниже.
                                </p>
                            </div>
                        )}

                        {(!profileData.links.has_max || !profileData.links.has_tg) && (
                            <div className="flex space-x-2 mb-4">
                                <input type="text" maxLength={6} value={linkCode} onChange={e => setLinkCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="w-full px-4 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg outline-none font-mono tracking-widest text-center shadow-inner" />
                                <button onClick={handleLinkAccount} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-bold text-sm transition shadow-md whitespace-nowrap active:scale-95">Привязать</button>
                            </div>
                        )}

                        {/* Кнопки отвязки */}
                        {profileData.links.is_linked && (
                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Привязанные устройства:</p>
                                <div className="flex flex-col space-y-2">
                                    {profileData.links.has_max && (
                                        <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">📱 Мессенджер MAX</span>
                                            <button onClick={() => handleUnlinkPlatform('max')} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1 rounded text-xs font-bold transition">Отвязать</button>
                                        </div>
                                    )}
                                    {profileData.links.has_tg && (
                                        <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">✈️ Telegram</span>
                                            <button onClick={() => handleUnlinkPlatform('tg')} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1 rounded text-xs font-bold transition">Отвязать</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {canEditUsers && (
                    <div className="flex justify-between items-center pt-4 mt-2 border-t dark:border-gray-700">
                        {profileData.user_id !== Number(tgId) ? (
                            <button onClick={handleDeleteUser} className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm px-4 py-2.5 rounded-lg transition">🗑 Удалить профиль</button>
                        ) : <div></div>}
                        <button onClick={handleSaveProfile} className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-md hover:bg-blue-700 transition">Сохранить</button>
                    </div>
                )}
                </div></div></div></div></div>
            )}
        </div>
    );
}
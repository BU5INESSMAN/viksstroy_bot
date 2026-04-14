import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
import Header from '../features/layout/components/Header';
import BottomNav from '../features/layout/components/BottomNav';
import Sidebar from '../features/layout/components/Sidebar';
import ProfileModal from '../features/layout/components/ProfileModal';
import SessionModal from '../features/layout/components/SessionModal';

function MaintenanceOverlay() {
    const [serverBack, setServerBack] = useState(false);

    useEffect(() => {
        const check = () => {
            fetch('/api/settings', { method: 'GET', cache: 'no-store' })
                .then(r => { if (r.ok) { setServerBack(true); setTimeout(() => location.reload(), 2000); } })
                .catch(() => {});
        };
        const id = setInterval(check, 3000);
        check();
        return () => clearInterval(id);
    }, []);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999, background: '#111827', color: '#f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20
        }}>
            <div style={{ maxWidth: 400 }}>
                {!serverBack && (
                    <div style={{
                        width: 48, height: 48, border: '4px solid #374151', borderTopColor: '#3b82f6',
                        borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 24px'
                    }} />
                )}
                <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
                    {serverBack ? '' : 'Обновление платформы'}
                </h1>
                {serverBack ? (
                    <div style={{
                        background: '#065f46', color: '#6ee7b7', padding: '12px 20px',
                        borderRadius: 12, fontWeight: 700, fontSize: 14
                    }}>
                        Приложение обновлено! Перезагрузка...
                    </div>
                ) : (
                    <>
                        <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 24, lineHeight: 1.6 }}>
                            Приложение обновляется. Это займёт несколько секунд.
                        </p>
                        <button onClick={() => location.reload()} style={{
                            background: '#3b82f6', color: 'white', border: 'none', padding: '14px 32px',
                            borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer'
                        }}>
                            Перезагрузить страницу
                        </button>
                        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 16 }}>Сервер перезапускается...</p>
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default function Layout() {
    const location = useLocation();
    const [role, setRole] = useState(localStorage.getItem('user_role') || 'Гость');
    const [tgId, setTgId] = useState(localStorage.getItem('tg_id'));
    const realRole = localStorage.getItem('real_role');
    const [serverDown, setServerDown] = useState(false);
    const failCountRef = useRef(0);

    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
    const [isProfileModalOpen, setProfileModalOpen] = useState(false);
    const [isSessionModalOpen, setSessionModalOpen] = useState(false);
    const [profileData, setProfileData] = useState(null);
    const [editProfile, setEditProfile] = useState({});

    const [isTMA, setIsTMA] = useState(false);
    const [isGlobalCreateAppOpen, setGlobalCreateAppOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');

    // Sync sidebar collapsed state from localStorage (Sidebar writes it)
    useEffect(() => {
        const onStorage = () => setSidebarCollapsed(localStorage.getItem('sidebar_collapsed') === 'true');
        window.addEventListener('storage', onStorage);
        const id = setInterval(onStorage, 300);
        return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
    }, []);

    useEffect(() => {
        const publicPaths = ['/login', '/invite', '/equip-invite'];
        const isPublic = publicPaths.some(path => location.pathname.startsWith(path));
        if (!tgId && !isPublic && location.pathname !== '/') {
            setSessionModalOpen(true);
        }
    }, [location.pathname, tgId]);

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
            if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        }
        if (window.location.pathname.includes('/max') || window.location.search.includes('WebAppData')) {
            setIsTMA(true);
        }
        document.body.style.overscrollBehaviorY = 'none';
    }, []);

    // Session restore on load
    useEffect(() => {
        const token = localStorage.getItem('session_token');
        if (token && !tgId) {
            axios.get(`/api/auth/session?token=${encodeURIComponent(token)}`)
                .then(res => {
                    if (res.data.status === 'ok') {
                        localStorage.setItem('tg_id', res.data.tg_id);
                        localStorage.setItem('user_role', res.data.role);
                        setTgId(String(res.data.tg_id));
                        setRole(res.data.role);
                    }
                })
                .catch(() => {
                    localStorage.removeItem('session_token');
                });
        }
    }, []);

    // Server health check every 30s
    useEffect(() => {
        const check = () => {
            fetch('/api/settings', { method: 'GET', cache: 'no-store' })
                .then(r => {
                    if (r.ok) { failCountRef.current = 0; setServerDown(false); }
                })
                .catch(() => {
                    failCountRef.current++;
                    if (failCountRef.current >= 2) setServerDown(true);
                });
        };
        const id = setInterval(check, 30000);
        return () => clearInterval(id);
    }, []);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');

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
                    max_invite_link: res.data.profile.max_invite_link || '',
                    notify_tg: res.data.profile.notify_tg !== 0,
                    notify_max: res.data.profile.notify_max !== 0,
                    notify_new_users: res.data.profile.notify_new_users !== 0,
                    notify_orders: res.data.profile.notify_orders !== 0,
                    notify_reports: res.data.profile.notify_reports !== 0,
                    notify_errors: res.data.profile.notify_errors !== 0,
                });
            }
            setProfileModalOpen(true);
        } catch (err) {
            if (err.response?.status === 401 || err.response?.status === 403) {
                setSessionModalOpen(true);
            } else {
                toast.error("Ошибка загрузки профиля");
            }
        }
    };

    const canCreateApp = ['foreman', 'boss', 'superadmin'].includes(role);
    const isModOrBoss = ['moderator', 'boss', 'superadmin'].includes(role);
    const canEditUsers = ['boss', 'superadmin', 'moderator'].includes(role);
    const isMyProfile = profileData && profileData.user_id === Number(tgId);

    if (serverDown) return <MaintenanceOverlay />;

    const isAuthenticated = tgId && role && role !== 'Гость';
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6 text-center">
                <div className="max-w-sm w-full space-y-8">
                    <div className="w-20 h-20 bg-gray-800 rounded-3xl flex items-center justify-center mx-auto border border-gray-700 shadow-xl">
                        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center">
                            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                        </div>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-white mb-3 tracking-tight">ВИКС Расписание</h1>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Для доступа к платформе авторизуйтесь через бот Telegram или MAX
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <a href="https://t.me/viksstroy_bot" target="_blank" rel="noopener noreferrer"
                           className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl transition-colors shadow-lg active:scale-95">
                            Telegram
                        </a>
                        <a href="https://max.ru/id222264297116_bot" target="_blank" rel="noopener noreferrer"
                           className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3.5 px-6 rounded-xl transition-colors shadow-lg active:scale-95 border border-gray-600">
                            MAX
                        </a>
                    </div>
                    <p className="text-gray-500 text-xs">&copy; {new Date().getFullYear()} ВИКС Строй</p>
                </div>
            </div>
        );
    }

    const sidebarWidth = sidebarCollapsed ? 64 : 256;

    return (
        <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-gray-50/50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 transition-colors duration-200">
            {/* Sidebar — desktop only */}
            <div className="hidden lg:block">
                <Sidebar
                    role={role}
                    openProfile={openProfile}
                    setGlobalCreateAppOpen={setGlobalCreateAppOpen}
                    theme={theme}
                    toggleTheme={toggleTheme}
                />
            </div>

            {/* Main content area */}
            <div
                className="flex-1 flex flex-col min-h-screen w-full max-w-full overflow-x-hidden pb-20 lg:pb-0 transition-[margin] duration-200"
                style={{ marginLeft: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarWidth : 0 }}
            >
                {/* Header — mobile only */}
                <div className="lg:hidden">
                    <Header
                        isTMA={isTMA}
                        realRole={realRole}
                        role={role}
                    />
                </div>

                {/* Page content */}
                <motion.main
                    key={location.pathname}
                    className="flex-1"
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                >
                    <Outlet context={{ openProfile, isGlobalCreateAppOpen, setGlobalCreateAppOpen }} />
                </motion.main>
            </div>

            {/* BottomNav — mobile only (lg:hidden is inside the component) */}
            <BottomNav
                role={role}
                canCreateApp={canCreateApp}
                isModOrBoss={isModOrBoss}
                isProfileModalOpen={isProfileModalOpen}
                openProfile={openProfile}
                setGlobalCreateAppOpen={setGlobalCreateAppOpen}
                theme={theme}
                toggleTheme={toggleTheme}
            />

            {isSessionModalOpen && <SessionModal />}

            {isProfileModalOpen && profileData && (
                <ProfileModal
                    profileData={profileData}
                    setProfileData={setProfileData}
                    editProfile={editProfile}
                    setEditProfile={setEditProfile}
                    setProfileModalOpen={setProfileModalOpen}
                    canEditUsers={canEditUsers}
                    isMyProfile={isMyProfile}
                />
            )}
        </div>
    );
}

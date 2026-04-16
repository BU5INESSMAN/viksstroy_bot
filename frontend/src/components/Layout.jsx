import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
import { ShieldCheck } from 'lucide-react';
import { ROLE_NAMES } from '../utils/roleConfig';
import Header from '../features/layout/components/Header';
import BottomNav from '../features/layout/components/BottomNav';
import Sidebar from '../features/layout/components/Sidebar';
import ProfileModal from '../features/layout/components/ProfileModal';
import SessionModal from '../features/layout/components/SessionModal';
import NotificationsModal from '../features/layout/components/NotificationsModal';
import OnlineUsersModal from '../features/layout/components/OnlineUsersModal';
import OnboardingTour from './OnboardingTour';
import { getFullTourSteps } from '../utils/tourSteps';
import { subscribeToPush } from '../utils/pushSubscription';
import PWAInstallBanner from './PWAInstallBanner';
import PWAUpdateModal from './PWAUpdateModal';
import UpdatePill from './UpdatePill';
import { initPWAUpdate } from '../utils/pwaUpdate';

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

    // Notifications & online
    const [showNotifications, setShowNotifications] = useState(false);
    const [showOnlineUsers, setShowOnlineUsers] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [onlineCount, setOnlineCount] = useState(0);

    // Continuous onboarding tour
    const [showTour, setShowTour] = useState(false);
    const tourSteps = useMemo(() => getFullTourSteps(role), [role]);

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

    // Session restore is handled by ProtectedRoute (App.jsx) before Layout mounts.
    // localStorage is guaranteed to have tg_id + user_role at this point.

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

    // Poll notification + online counts every 30s
    useEffect(() => {
        if (!tgId || !role || role === 'Гость') return;
        const fetchCounts = async () => {
            try {
                const [nRes, oRes] = await Promise.all([
                    axios.get('/api/notifications/my?limit=1'),
                    axios.get('/api/online'),
                ]);
                setUnreadCount(nRes.data.unread_count || 0);
                setOnlineCount(oRes.data.count || 0);
            } catch {}
        };
        fetchCounts();
        const iv = setInterval(fetchCounts, 30000);
        return () => clearInterval(iv);
    }, [tgId, role]);

    // Push notification subscription — delayed to not interrupt initial load
    useEffect(() => {
        if (!tgId) return;
        const timer = setTimeout(() => { subscribeToPush(); }, 3000);
        return () => clearTimeout(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // PWA update detection
    const [updateWorker, setUpdateWorker] = useState(null);
    const [updateDeferred, setUpdateDeferred] = useState(false);
    useEffect(() => {
        initPWAUpdate((worker) => {
            setUpdateWorker(worker);
            setUpdateDeferred(false);
        });
    }, []);

    // Continuous onboarding tour — show once on first authenticated visit
    useEffect(() => {
        if (!tgId || !role || role === 'Гость') return;
        if (localStorage.getItem('tour_complete')) return;
        if (tourSteps.length === 0) return;
        const timer = setTimeout(() => setShowTour(true), 1000);
        return () => clearTimeout(timer);
    }, [tgId, role, tourSteps.length]);

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
                    last_name: res.data.profile.last_name || '',
                    first_name: res.data.profile.first_name || '',
                    middle_name: res.data.profile.middle_name || '',
                    specialty: res.data.profile.specialty || '',
                    role: res.data.profile.role,
                    team_id: res.data.profile.team_id || '',
                    position: res.data.profile.position || '',
                    max_invite_link: res.data.profile.max_invite_link || '',
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
                    <img src="/logo-white.svg" alt="ВиКС" className="h-12 mx-auto" />
                    <div>
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
                    <p className="text-gray-500 text-xs">&copy; {new Date().getFullYear()} ВиКС</p>
                </div>
            </div>
        );
    }

    const sidebarWidth = sidebarCollapsed ? 64 : 256;

    const handleReturnToRealRole = () => {
        localStorage.setItem('user_role', realRole);
        localStorage.removeItem('real_role');
        window.location.reload();
    };

    return (
        <div className="flex flex-col min-h-screen w-full max-w-full bg-gray-50/50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 transition-colors duration-200">
            {/* Role test banner — visible on ALL screen sizes */}
            {realRole && realRole !== role && (
                <div className="bg-purple-600 text-white text-sm py-2 px-4 flex items-center justify-center gap-3 z-[60] w-full flex-shrink-0">
                    <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Тест роли: <strong>{ROLE_NAMES[role] || role}</strong></span>
                    <button onClick={handleReturnToRealRole} className="px-3 py-1 bg-white/20 rounded-lg hover:bg-white/30 text-xs font-medium transition-colors active:scale-95">Вернуться</button>
                </div>
            )}

            <div className="flex flex-1 w-full max-w-full">
            {/* Sidebar — desktop only */}
            <div className="hidden lg:block">
                <Sidebar
                    role={role}
                    openProfile={openProfile}
                    setGlobalCreateAppOpen={setGlobalCreateAppOpen}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    unreadCount={unreadCount}
                    onlineCount={onlineCount}
                    onNotificationsClick={() => setShowNotifications(true)}
                    onOnlineClick={() => setShowOnlineUsers(true)}
                />
            </div>

            {/* Main content area */}
            <div
                className="flex-1 flex flex-col min-h-screen w-full max-w-full pb-24 lg:pb-0 transition-[margin] duration-200"
                style={{ marginLeft: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarWidth : 0 }}
            >
                {/* Header — mobile only */}
                <div className="lg:hidden">
                    <Header
                        isTMA={isTMA}
                        realRole={realRole}
                        role={role}
                        unreadCount={unreadCount}
                        onlineCount={onlineCount}
                        onNotificationsClick={() => setShowNotifications(true)}
                        onOnlineClick={() => setShowOnlineUsers(true)}
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

            {showTour && tourSteps.length > 0 && (
                <OnboardingTour
                    steps={tourSteps}
                    tourId="complete"
                    onComplete={() => {
                        setShowTour(false);
                        localStorage.setItem('tour_complete', '1');
                    }}
                />
            )}

            <NotificationsModal
                isOpen={showNotifications}
                onClose={() => {
                    setShowNotifications(false);
                    if (tgId) axios.get('/api/notifications/my?limit=1').then(r => setUnreadCount(r.data.unread_count || 0)).catch(() => {});
                }}
            />
            <OnlineUsersModal isOpen={showOnlineUsers} onClose={() => setShowOnlineUsers(false)} />

            {/* PWA install banner (bottom) */}
            <PWAInstallBanner />

            {/* PWA update flow: modal (with 30s countdown) then pill once deferred */}
            <PWAUpdateModal
                worker={updateWorker}
                isOpen={Boolean(updateWorker) && !updateDeferred}
                onDefer={() => setUpdateDeferred(true)}
            />
            {updateWorker && updateDeferred && <UpdatePill worker={updateWorker} />}
            </div>
        </div>
    );
}

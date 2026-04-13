import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
import Header from '../features/layout/components/Header';
import BottomNav from '../features/layout/components/BottomNav';
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

    return (
        <div className="bg-gray-50/50 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 pb-24 transition-colors duration-200">
            <Header
                isTMA={isTMA}
                realRole={realRole}
                role={role}
                theme={theme}
                toggleTheme={toggleTheme}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
            />

            <motion.div
                key={location.pathname}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
            >
                <Outlet context={{ openProfile, isGlobalCreateAppOpen, setGlobalCreateAppOpen }} />
            </motion.div>

            <BottomNav
                role={role}
                canCreateApp={canCreateApp}
                isModOrBoss={isModOrBoss}
                isProfileModalOpen={isProfileModalOpen}
                openProfile={openProfile}
                setGlobalCreateAppOpen={setGlobalCreateAppOpen}
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

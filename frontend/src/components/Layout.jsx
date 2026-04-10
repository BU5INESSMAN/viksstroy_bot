import { useEffect, useState } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Header from '../features/layout/components/Header';
import BottomNav from '../features/layout/components/BottomNav';
import ProfileModal from '../features/layout/components/ProfileModal';
import SessionModal from '../features/layout/components/SessionModal';

export default function Layout() {
    const location = useLocation();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id');
    const realRole = localStorage.getItem('real_role');

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

            <Outlet context={{ openProfile, isGlobalCreateAppOpen, setGlobalCreateAppOpen }} />

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

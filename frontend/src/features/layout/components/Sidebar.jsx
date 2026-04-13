import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Home, MapPin, Briefcase, ClipboardList, FileText,
    Settings as SettingsIcon, User, BookOpen, Rocket,
    MessageCircle, Plus, PanelLeftClose, PanelLeft,
    Sun, Moon, Monitor
} from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Sidebar({ role, openProfile, setGlobalCreateAppOpen, theme, toggleTheme }) {
    const navigate = useNavigate();
    const location = useLocation();
    const tgId = localStorage.getItem('tg_id');

    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');

    useEffect(() => {
        localStorage.setItem('sidebar_collapsed', collapsed);
    }, [collapsed]);

    const isModOrBoss = ['moderator', 'boss', 'superadmin'].includes(role);
    const canCreateApp = ['foreman', 'boss', 'superadmin'].includes(role);
    const canSeeObjectsKP = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canSeeKP = ['brigadier', 'foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const isWorkerOrDriver = ['worker', 'driver'].includes(role);

    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

    const mainNav = [
        { icon: Home, label: 'Главная', path: '/dashboard', visible: true },
        { icon: MapPin, label: 'Объекты', path: '/objects', visible: canSeeObjectsKP },
        { icon: Briefcase, label: 'Ресурсы', path: '/resources', visible: canSeeObjectsKP },
        { icon: ClipboardList, label: 'Заявки', path: isWorkerOrDriver ? '/my-apps' : '/review', visible: true },
        { icon: FileText, label: 'СМР', path: '/kp', visible: canSeeKP },
        { icon: SettingsIcon, label: 'Настройки', path: '/system', visible: isModOrBoss },
    ].filter(i => i.visible);

    const secondaryNav = [
        { icon: BookOpen, label: 'Гайд', action: () => navigate('/guide') },
        { icon: Rocket, label: 'Обновления', action: () => navigate('/updates') },
        { icon: MessageCircle, label: 'Поддержка', action: () => window.open('https://t.me/BU5INESSMAN', '_blank') },
    ];

    const w = collapsed ? 64 : 256;

    return (
        <motion.aside
            className="fixed top-0 left-0 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-50 flex flex-col select-none"
            animate={{ width: w }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
            {/* Logo + Create */}
            <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'} h-16 border-b border-gray-100 dark:border-gray-800 flex-shrink-0`}>
                {!collapsed && (
                    <div className="w-28 h-8 bg-blue-600 dark:bg-blue-500 flex-shrink-0" style={{
                        WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                        WebkitMaskSize: 'contain', maskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'left center', maskPosition: 'left center'
                    }} />
                )}
                {collapsed && (
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-extrabold text-sm">В</span>
                    </div>
                )}
                {!collapsed && canCreateApp && (
                    <motion.button
                        onClick={() => { navigate('/dashboard'); setGlobalCreateAppOpen(true); }}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1 transition-colors"
                        whileHover={prefersReducedMotion ? {} : { scale: 1.03 }}
                        whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
                    >
                        <Plus className="w-3.5 h-3.5" strokeWidth={3} /> Создать
                    </motion.button>
                )}
            </div>

            {/* Main navigation — top section */}
            <nav className="flex-1 flex flex-col overflow-y-auto py-3 px-2">
                <div className="space-y-1">
                    {canCreateApp && collapsed && (
                        <SidebarItem
                            icon={Plus} label="Создать" collapsed={collapsed} isActive={false}
                            onClick={() => { navigate('/dashboard'); setGlobalCreateAppOpen(true); }}
                            accent
                        />
                    )}
                    {mainNav.map(item => (
                        <SidebarItem
                            key={item.path}
                            icon={item.icon}
                            label={item.label}
                            collapsed={collapsed}
                            isActive={location.pathname === item.path}
                            onClick={() => navigate(item.path)}
                        />
                    ))}
                    <SidebarItem
                        icon={User} label="Профиль" collapsed={collapsed}
                        isActive={false}
                        onClick={() => openProfile(tgId)}
                    />
                </div>

                {/* Spacer pushes secondary nav to bottom */}
                <div className="flex-1" />

                {/* Secondary nav — bottom section */}
                <div className="space-y-1 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                    {secondaryNav.map(item => (
                        <SidebarItem
                            key={item.label}
                            icon={item.icon}
                            label={item.label}
                            collapsed={collapsed}
                            isActive={false}
                            onClick={item.action}
                            secondary
                        />
                    ))}
                    <SidebarItem
                        icon={ThemeIcon} label="Тема" collapsed={collapsed}
                        isActive={false} onClick={toggleTheme} secondary
                    />
                </div>
            </nav>

            {/* Collapse toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
            >
                {collapsed ? <PanelLeft className="w-5 h-5 mx-auto" /> : (
                    <>
                        <PanelLeftClose className="w-5 h-5" />
                        <span className="text-xs font-semibold">Свернуть</span>
                    </>
                )}
            </button>
        </motion.aside>
    );
}

function SidebarItem({ icon: Icon, label, collapsed, isActive, onClick, secondary, accent }) {
    const base = accent
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : isActive
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            : secondary
                ? 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200';

    return (
        <motion.button
            onClick={onClick}
            className={`relative w-full flex items-center gap-3 rounded-xl transition-colors cursor-pointer ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'} ${base}`}
            whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
            title={collapsed ? label : undefined}
        >
            {isActive && !accent && (
                <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full"
                    layoutId="sidebar-indicator"
                    transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0.15 }}
                />
            )}
            <Icon className={`w-5 h-5 flex-shrink-0 ${isActive && !accent ? 'stroke-[2.5]' : ''}`} />
            <AnimatePresence>
                {!collapsed && (
                    <motion.span
                        className={`text-sm font-semibold whitespace-nowrap overflow-hidden ${secondary ? 'text-xs' : ''}`}
                        initial={prefersReducedMotion ? false : { opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        {label}
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.button>
    );
}

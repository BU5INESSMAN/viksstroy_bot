import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Home, MapPin, Briefcase, ClipboardList, FileText,
    Settings as SettingsIcon, User, BookOpen, Rocket,
    MessageCircle, Plus, ChevronLeft, ChevronDown,
    Sun, Moon, Monitor, Headphones
} from 'lucide-react';
import axios from 'axios';
import { ROLE_NAMES } from '../../../utils/roleConfig';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const anim = (props) => prefersReducedMotion ? {} : props;

export default function Sidebar({ role, openProfile, setGlobalCreateAppOpen, theme, toggleTheme }) {
    const navigate = useNavigate();
    const location = useLocation();
    const tgId = localStorage.getItem('tg_id') || '0';

    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
    const [openMenus, setOpenMenus] = useState({});
    const [counts, setCounts] = useState({});
    const [userFio, setUserFio] = useState('');

    useEffect(() => { localStorage.setItem('sidebar_collapsed', collapsed); }, [collapsed]);

    // Fetch sidebar counts + user FIO
    const fetchCounts = useCallback(() => {
        axios.get(`/api/dashboard/sidebar_counts?tg_id=${tgId}`)
            .then(r => setCounts(r.data || {}))
            .catch(() => {});
    }, [tgId]);

    useEffect(() => {
        if (tgId && tgId !== '0') {
            axios.get(`/api/users/${tgId}/profile`)
                .then(r => setUserFio(r.data?.profile?.fio || ''))
                .catch(() => {});
        }
    }, [tgId]);

    useEffect(() => {
        fetchCounts();
        const iv = setInterval(fetchCounts, 60000);
        return () => clearInterval(iv);
    }, [fetchCounts]);

    const isModOrBoss = ['moderator', 'boss', 'superadmin'].includes(role);
    const canCreateApp = ['foreman', 'boss', 'superadmin'].includes(role);
    const canSeeObjects = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canSeeKP = ['brigadier', 'foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const isWorkerOrDriver = ['worker', 'driver'].includes(role);

    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

    const toggleMenu = (id) => setOpenMenus(p => ({ ...p, [id]: !p[id] }));

    const navItems = [
        { id: 'home', icon: Home, label: 'Главная', path: '/dashboard', visible: true },
        {
            id: 'objects', icon: MapPin, label: 'Объекты', path: '/objects', visible: canSeeObjects,
            subItems: [
                ...(isModOrBoss ? [{ label: 'Создать объект', nav: '/objects?action=create' }] : []),
                { label: 'Архив', nav: '/objects?tab=archive' },
                ...(isModOrBoss ? [{ label: 'Заявки', nav: '/objects?tab=requests', countKey: 'object_requests' }] : []),
            ],
        },
        {
            id: 'resources', icon: Briefcase, label: 'Ресурсы', path: '/resources', visible: canSeeObjects,
            subItems: [
                { label: 'Бригады', nav: '/resources?tab=teams' },
                { label: 'Автопарк', nav: '/resources?tab=equipment' },
            ],
        },
        {
            id: 'review', icon: ClipboardList, label: 'Заявки', path: isWorkerOrDriver ? '/my-apps' : '/review', visible: true,
            subItems: isWorkerOrDriver ? [] : [
                { label: 'Одобренные', nav: '/review?filter=approved', countKey: 'approved_apps' },
            ],
        },
        {
            id: 'kp', icon: FileText, label: 'СМР', path: '/kp', visible: canSeeKP,
            subItems: [
                { label: 'К заполнению', nav: '/kp?tab=to_fill', countKey: 'kp_to_fill' },
                { label: 'На проверку', nav: '/kp?tab=pending_review', countKey: 'kp_to_review' },
                { label: 'Готовые', nav: '/kp?tab=approved', countKey: 'kp_done' },
            ],
        },
        {
            id: 'system', icon: SettingsIcon, label: 'Настройки', path: '/system', visible: isModOrBoss,
            subItems: [
                { label: 'Пользователи', nav: '/system?section=users' },
                { label: 'Рассылка', nav: '/system?section=broadcast' },
                { label: 'Журнал', nav: '/system?section=logs' },
            ],
        },
    ].filter(i => i.visible);

    const secondaryNav = [
        { icon: BookOpen, label: 'Гайд', path: '/guide' },
        { icon: Rocket, label: 'Обновления', path: '/updates' },
        { icon: Headphones, label: 'Поддержка', path: '/support' },
    ];

    const w = collapsed ? 64 : 256;

    return (
        <>
            <motion.aside
                className="fixed top-0 left-0 h-screen overflow-x-hidden bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-50 flex flex-col select-none"
                animate={{ width: w }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
                {/* Logo */}
                <div className={`border-b border-gray-100 dark:border-gray-800 flex-shrink-0 ${collapsed ? 'flex items-center justify-center px-2 h-14' : 'px-4 py-3.5 flex items-center justify-center'}`}>
                    {!collapsed ? (
                        <img src="/logo-dark.svg" alt="ВиКС" className="h-8 w-auto dark:hidden" />
                    ) : null}
                    {!collapsed ? (
                        <img src="/logo-white.svg" alt="ВиКС" className="h-8 w-auto hidden dark:block" />
                    ) : (
                        <img src="/favicon.svg" alt="ВиКС" className="w-8 h-8 flex-shrink-0" />
                    )}
                </div>

                {/* Main nav */}
                <nav className="flex-1 flex flex-col overflow-y-auto py-3 px-2 scrollbar-thin">
                    <div className="space-y-0.5">
                        {canCreateApp && (
                            collapsed ? (
                                <NavItem icon={Plus} label="Создать" collapsed={collapsed} isActive={false}
                                    onClick={() => { navigate('/dashboard'); setGlobalCreateAppOpen(true); }} accent />
                            ) : (
                                <motion.button
                                    data-tour="sidebar-create-btn"
                                    onClick={() => { navigate('/dashboard'); setGlobalCreateAppOpen(true); }}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3 py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors mb-2"
                                    whileHover={anim({ scale: 1.02 })}
                                    whileTap={anim({ scale: 0.97 })}
                                >
                                    <Plus className="w-4 h-4" strokeWidth={2.5} /> Создать заявку
                                </motion.button>
                            )
                        )}
                        {navItems.map(item => {
                            // Active detection: exact match or prefix match, plus /my-apps alias for review
                            const active = location.pathname === item.path
                                || location.pathname.startsWith(item.path + '/')
                                || (item.id === 'review' && location.pathname === '/my-apps');
                            return (
                            <div key={item.id}>
                                <NavItem
                                    icon={item.icon}
                                    label={item.label}
                                    collapsed={collapsed}
                                    isActive={active}
                                    hasSubItems={!collapsed && item.subItems?.length > 0}
                                    isOpen={openMenus[item.id]}
                                    onToggle={() => toggleMenu(item.id)}
                                    onClick={() => navigate(item.path)}
                                    dataTour={`sidebar-nav-${{ home: 'home', objects: 'objects', resources: 'resources', review: 'orders', kp: 'smr', system: 'settings' }[item.id] || item.id}`}
                                />
                                {/* Sub-items */}
                                {!collapsed && item.subItems?.length > 0 && (
                                    <AnimatePresence initial={false}>
                                        {openMenus[item.id] && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                                                className="overflow-hidden"
                                            >
                                                <div className="ml-5 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-0.5 py-1">
                                                    {item.subItems.map(sub => (
                                                        <SubItem
                                                            key={sub.label}
                                                            label={sub.label}
                                                            count={sub.countKey ? counts[sub.countKey] : undefined}
                                                            isActive={location.search && sub.nav?.includes(location.search)}
                                                            onClick={() => navigate(sub.nav)}
                                                        />
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                )}
                            </div>
                        ); })}
                    </div>

                    <div className="flex-1" />

                    {/* Secondary nav */}
                    <div className="space-y-0.5 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                        {secondaryNav.map(item => (
                            <NavItem
                                key={item.label}
                                icon={item.icon}
                                label={item.label}
                                collapsed={collapsed}
                                isActive={location.pathname === item.path}
                                onClick={() => navigate(item.path)}
                                secondary
                                dataTour={item.path === '/support' ? 'sidebar-support' : undefined}
                            />
                        ))}
                        <NavItem icon={ThemeIcon} label="Тема" collapsed={collapsed}
                            isActive={false} onClick={toggleTheme} secondary />

                        {/* Profile — bottom: FIO + role */}
                        {collapsed ? (
                            <NavItem icon={User} label={userFio || 'Профиль'} collapsed={collapsed}
                                isActive={false} onClick={() => openProfile(tgId)} secondary />
                        ) : (
                            <motion.div
                                data-tour="sidebar-profile"
                                className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                whileTap={anim({ scale: 0.97 })}
                                onClick={() => openProfile(tgId)}
                            >
                                <User className="w-5 h-5 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold truncate text-gray-700 dark:text-gray-200">{userFio || 'Профиль'}</p>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{ROLE_NAMES[role] || role}</p>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </nav>
            </motion.aside>

            {/* Collapse button — outside sidebar */}
            <motion.button
                onClick={() => setCollapsed(!collapsed)}
                className="fixed bottom-4 z-50 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-2 rounded-r-xl shadow-md border border-l-0 border-gray-200 dark:border-gray-700 transition-colors"
                animate={{ left: collapsed ? 64 : 256 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
                <motion.div
                    animate={{ rotate: collapsed ? 180 : 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
                >
                    <ChevronLeft className="w-4 h-4" />
                </motion.div>
            </motion.button>
        </>
    );
}

/* ───── Nav item ───── */
function NavItem({ icon: Icon, label, collapsed, isActive, onClick, secondary, accent, hasSubItems, isOpen, onToggle, dataTour }) {
    const base = accent
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : isActive
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            : secondary
                ? 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200';

    return (
        <motion.div
            className={`relative w-full flex items-center gap-3 rounded-xl transition-colors cursor-pointer ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'} ${base}`}
            whileTap={anim({ scale: 0.97 })}
            title={collapsed ? label : undefined}
            onClick={onClick}
            data-tour={dataTour}
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
                        className={`text-sm font-semibold whitespace-nowrap overflow-hidden flex-1 ${secondary ? 'text-xs' : ''}`}
                        initial={prefersReducedMotion ? false : { opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        {label}
                    </motion.span>
                )}
            </AnimatePresence>
            {hasSubItems && !collapsed && (
                <motion.div
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className="p-1 rounded-md hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                </motion.div>
            )}
        </motion.div>
    );
}

/* ───── Sub-item ───── */
function SubItem({ label, count, isActive, onClick }) {
    return (
        <motion.button
            onClick={onClick}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isActive
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
            whileTap={anim({ scale: 0.98 })}
        >
            <span>{label}</span>
            {count > 0 && (
                <motion.span
                    className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold"
                    initial={anim({ scale: 0.5, opacity: 0 })}
                    animate={{ scale: 1, opacity: 1 }}
                    key={count}
                >
                    {count}
                </motion.span>
            )}
        </motion.button>
    );
}

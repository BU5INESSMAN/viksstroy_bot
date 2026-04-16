import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home, ClipboardList, Briefcase, Settings as SettingsIcon, ShieldAlert, User, Plus,
    MapPin, FileText, Menu, X, BookOpen, Rocket, MessageCircle,
    Sun, Moon, Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function BottomNav({ role, canCreateApp, isModOrBoss, openProfile, setGlobalCreateAppOpen, theme, toggleTheme }) {
    const navigate = useNavigate();
    const location = useLocation();
    const tgId = localStorage.getItem('tg_id');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const isWorkerOrDriver = ['worker', 'driver'].includes(role);
    const canSeeObjectsKP = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canSeeKP = ['brigadier', 'foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canSeeAdmin = ['boss', 'superadmin'].includes(role);

    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
    const themeLabel = theme === 'light' ? 'Светлая' : theme === 'dark' ? 'Тёмная' : 'Авто';

    return (
        <>
            <div
                className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 z-40 shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.05)] transition-colors"
                style={{ height: 'calc(80px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
            <div className="max-w-5xl mx-auto flex justify-around items-stretch h-full px-1 sm:px-4">

                <NavBtn icon={Home} label="Главная" path="/dashboard" current={location.pathname} onClick={() => navigate('/dashboard')} dataTour="bottomnav-home" />

                {canSeeObjectsKP && (
                    <NavBtn icon={MapPin} label="Объекты" path="/objects" current={location.pathname} onClick={() => navigate('/objects')} />
                )}

                {canSeeObjectsKP && (
                    <NavBtn icon={Briefcase} label="Ресурсы" path="/resources" current={location.pathname} onClick={() => navigate('/resources')} />
                )}

                {canCreateApp && (
                    <div className="relative flex flex-col items-center justify-center h-full flex-1" data-tour="bottomnav-create">
                        <motion.button
                            onClick={() => { navigate('/dashboard'); setGlobalCreateAppOpen(true); }}
                            className="absolute -top-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-[0_10px_24px_-8px_rgba(37,99,235,0.55)] border-[3px] border-white dark:border-gray-800 transition-colors z-50"
                            whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                            whileTap={prefersReducedMotion ? {} : { scale: 0.92 }}
                            transition={{ duration: 0.15 }}
                        >
                            <Plus className="w-7 h-7" strokeWidth={2.5} />
                        </motion.button>
                        <span className="hidden sm:block text-[11px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wide mt-9">Создать</span>
                    </div>
                )}

                <NavBtn
                    icon={ClipboardList} label="Заявки"
                    path={isWorkerOrDriver ? "/my-apps" : "/review"}
                    current={location.pathname}
                    onClick={() => navigate(isWorkerOrDriver ? "/my-apps" : "/review")}
                    dataTour="bottomnav-orders"
                />

                {canSeeKP && (
                    <NavBtn icon={FileText} label="СМР" path="/kp" current={location.pathname} onClick={() => navigate('/kp')} />
                )}

                {/* Stage 7: Settings + Admin moved to Sidebar (burger menu)
                    to keep BottomNav compact. The burger below opens the
                    sidebar where both items live. */}

                <button
                    data-tour="bottomnav-menu"
                    onClick={() => setIsMenuOpen(true)}
                    className={`flex flex-col items-center justify-center gap-1 h-full flex-1 min-w-[44px] transition-colors active:scale-95 ${isMenuOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                >
                    <Menu className="w-7 h-7" strokeWidth={2.4} />
                    <span className="hidden sm:block text-[11px] font-extrabold uppercase tracking-wide">Меню</span>
                </button>

            </div>
            </div>

            {/* Bottom Sheet Menu */}
            <AnimatePresence>
            {isMenuOpen && (
                <motion.div
                    className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setIsMenuOpen(false)}
                >
                    <motion.div
                        className="bg-white dark:bg-gray-800 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl"
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold dark:text-white">Дополнительно</h3>
                            <button onClick={() => setIsMenuOpen(false)} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 hover:text-red-500 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Main items — full width */}
                        <div className="space-y-2 mb-4">
                            <MenuRow icon={SettingsIcon} color="blue" label="Настройки" onClick={() => { setIsMenuOpen(false); navigate('/settings'); }} />
                            {canSeeAdmin && (
                                <MenuRow icon={ShieldAlert} color="red" label="Админка" onClick={() => { setIsMenuOpen(false); navigate('/admin'); }} />
                            )}
                            <MenuRow icon={User} color="indigo" label="Мой Профиль" onClick={() => { setIsMenuOpen(false); openProfile(tgId); }} />
                        </div>

                        <div className="h-px bg-gray-100 dark:bg-gray-700 mb-4" />

                        {/* Secondary items — 2x2 grid */}
                        <div className="grid grid-cols-2 gap-2">
                            <GridItem icon={BookOpen} color="indigo" label="Гайд" onClick={() => { setIsMenuOpen(false); navigate('/guide'); }} />
                            <GridItem icon={Rocket} color="emerald" label="Обновления" onClick={() => { setIsMenuOpen(false); navigate('/updates'); }} />
                            <GridItem icon={MessageCircle} color="blue" label="Техподдержка" onClick={() => { setIsMenuOpen(false); navigate('/support'); }} />
                            <GridItem icon={ThemeIcon} color="gray" label={themeLabel} onClick={() => { toggleTheme(); }} />
                        </div>
                    </motion.div>
                </motion.div>
            )}
            </AnimatePresence>
        </>
    );
}

function MenuRow({ icon: Icon, color, label, onClick }) {
    const colorMap = {
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
        red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    };
    return (
        <button onClick={onClick} className="w-full flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-semibold text-sm text-gray-800 dark:text-white border border-gray-100 dark:border-gray-700 active:scale-[0.98]">
            <div className={`p-1.5 rounded-lg ${colorMap[color] || colorMap.blue}`}>
                <Icon className="w-4 h-4" />
            </div>
            {label}
        </button>
    );
}

function GridItem({ icon: Icon, color, label, onClick }) {
    const colorMap = {
        blue: 'text-blue-500',
        indigo: 'text-indigo-500',
        emerald: 'text-emerald-500',
        gray: 'text-gray-500 dark:text-gray-400',
    };
    return (
        <button onClick={onClick} className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors border border-gray-100 dark:border-gray-700 active:scale-[0.97]">
            <Icon className={`w-5 h-5 ${colorMap[color] || colorMap.gray}`} />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
        </button>
    );
}

function NavBtn({ icon: Icon, label, path, current, onClick, dataTour }) {
    const isActive = current === path;
    return (
        <button
            onClick={onClick}
            data-tour={dataTour}
            className={`relative flex flex-col items-center justify-center gap-1 h-full flex-1 min-w-[44px] transition-colors active:scale-95 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
        >
            <motion.div
                animate={prefersReducedMotion ? {} : { scale: isActive ? 1.08 : 1 }}
                transition={{ type: 'spring', duration: 0.25, bounce: 0.15 }}
            >
                <Icon className="w-7 h-7" strokeWidth={isActive ? 2.6 : 2.1} />
            </motion.div>
            <span className="hidden sm:block text-[11px] font-extrabold uppercase tracking-wide">{label}</span>
            {/* Active-route dot — centered under the icon */}
            {isActive && (
                <motion.span
                    layoutId="bottomnav-indicator"
                    className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400"
                    transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0.2 }}
                />
            )}
        </button>
    );
}

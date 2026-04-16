import { useState } from 'react';
import {
    Calendar, MapPin, Users, Truck, HardHat, Flag,
    ClipboardList, CheckCircle, Clock, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ObjectDisplay from '../../../components/ui/ObjectDisplay';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function AppCard({ a, role, tgId, openProfile, openFreeModal }) {
    let activeEquipList = [];
    if (a.equipment_data) { try { activeEquipList = JSON.parse(a.equipment_data) || []; } catch(e){} }

    const teamIds = a.team_id && a.team_id !== '0' ? String(a.team_id).split(',').map(Number) : [];
    const freedTeamIds = a.freed_team_ids ? String(a.freed_team_ids).split(',').map(Number) : [];

    return (
        <div className="p-5 bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700 text-sm space-y-4 shadow-sm transition-all hover:shadow-md">
            {/* Header row: date + address */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    {a.date_target}
                </div>
                <ObjectDisplay
                    name={a.object_name || a.object_address}
                    address={a.object_name ? a.object_address : ''}
                    nameClassName="font-bold text-gray-800 dark:text-gray-100 leading-snug truncate"
                />

            </div>

            {/* Foreman */}
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <HardHat className="w-4 h-4 text-amber-500 flex-shrink-0" />
                {a.foreman_id ? (
                    <button onClick={() => openProfile(a.foreman_id)} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-left">{a.foreman_name || 'Неизвестно'}</button>
                ) : <span className="font-medium">{a.foreman_name || 'Неизвестно'}</span>}
            </div>

            {/* Equipment */}
            <div className="bg-gray-50 dark:bg-gray-700/30 p-3.5 rounded-xl space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    <Truck className="w-3.5 h-3.5" /> Техника
                </div>
                {activeEquipList.length > 0 ? activeEquipList.map((e, idx) => {
                    const eqName = e.name || `Техника #${e.id}`;
                    const s = String(e.time_start ?? '08').padStart(2, '0');
                    const end = String(e.time_end ?? '17').padStart(2, '0');
                    return (
                        <div key={idx} className={`flex items-center justify-between text-xs ${e.is_freed ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300 font-medium'}`}>
                            <span className="truncate mr-2">{eqName}</span>
                            <span className="text-gray-400 text-[11px] flex-shrink-0">{s}:00 – {end}:00</span>
                        </div>
                    );
                }) : <span className="text-xs text-gray-400 italic">Не требуется</span>}
            </div>

            {/* Teams */}
            <div className="bg-gray-50 dark:bg-gray-700/30 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    <Users className="w-3.5 h-3.5" /> Бригады
                </div>
                {teamIds.length > 0 ? teamIds.map(tId => {
                    const tMembers = a.members_data?.filter(m => m.team_id === tId) || [];
                    const tName = tMembers.length > 0 ? tMembers[0].team_name : `Бригада #${tId}`;
                    const isFreed = freedTeamIds.includes(tId) || a.is_team_freed === 1;

                    return (
                        <div key={tId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isFreed ? 'bg-gray-300' : 'bg-indigo-500'}`}></div>
                                <span className={`text-xs font-medium ${isFreed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                    {tName}
                                </span>
                                {isFreed && (
                                    <span className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                        <CheckCircle className="w-2.5 h-2.5" /> Свободна
                                    </span>
                                )}
                            </div>
                            {!isFreed && ['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && (
                                <button onClick={() => openFreeModal('specific_team', { app: a, teamId: tId })} className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 px-2.5 py-1 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center gap-1 w-full sm:w-auto active:scale-95">
                                    <CheckCircle className="w-3 h-3" /> Освободить
                                </button>
                            )}
                        </div>
                    );
                }) : (
                    <span className="text-xs text-gray-400 italic">Только техника</span>
                )}
            </div>

            {/* Global action buttons */}
            {role === 'driver' && !a.my_equip_is_freed && (
                <button onClick={() => openFreeModal('equipment', a)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5" /> Свободен
                </button>
            )}
            {role === 'driver' && a.my_equip_is_freed && (
                <div className="w-full flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 py-3 font-bold bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                    <CheckCircle className="w-5 h-5" /> Вы свободны
                </div>
            )}
            {['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && a.is_team_freed !== 1 && teamIds.length > 1 && (
                <button onClick={() => openFreeModal('team', a)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5" /> Освободить ВСЕ бригады
                </button>
            )}
            {['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && a.is_team_freed === 1 && teamIds.length > 0 && (
                <div className="w-full flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 py-3 font-bold bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                    <CheckCircle className="w-5 h-5" /> Все бригады свободны
                </div>
            )}
        </div>
    );
}

export default function ActiveApplicationsCard({ todayApps, upcomingApps, role, tgId, openProfile, openFreeModal }) {
    const [tab, setTab] = useState('today');
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('myAppsCollapsed') === 'true');
    const apps = tab === 'today' ? todayApps : upcomingApps;

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            localStorage.setItem('myAppsCollapsed', String(!prev));
            return !prev;
        });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden md:col-span-2">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 rounded-l-3xl"></div>

            {/* Header + Tabs */}
            <div className="px-6 pt-6 pb-4 space-y-4">
                <button onClick={toggleCollapsed} className="w-full flex items-center justify-between group">
                    <h2 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                        <ClipboardList className="text-blue-500 w-6 h-6" /> Мои наряды
                    </h2>
                    <ChevronDown className={`w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} />
                </button>
                <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        className="flex gap-2"
                        initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                        style={{ overflow: 'hidden' }}
                    >
                        <button
                            onClick={() => setTab('today')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                tab === 'today'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            <HardHat className="w-4 h-4" />
                            Текущие
                            {todayApps.length > 0 && (
                                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-md font-bold ${tab === 'today' ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                                    {todayApps.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setTab('upcoming')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                tab === 'upcoming'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            <Clock className="w-4 h-4" />
                            Предстоящие
                            {upcomingApps.length > 0 && (
                                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-md font-bold ${tab === 'upcoming' ? 'bg-white/20' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                                    {upcomingApps.length}
                                </span>
                            )}
                        </button>
                    </motion.div>
                )}
                </AnimatePresence>
            </div>

            {/* Content */}
            <AnimatePresence>
            {!collapsed && (
                <motion.div
                    className="px-6 pb-6"
                    initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                    style={{ overflow: 'hidden' }}
                >
                    {apps.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {apps.map(a => (
                                <AppCard key={a.id} a={a} role={role} tgId={tgId} openProfile={openProfile} openFreeModal={openFreeModal} />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-gray-50 dark:bg-gray-700/20 border border-gray-100 dark:border-gray-700 rounded-2xl p-8 text-center">
                            <Flag className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                            <p className="text-gray-500 dark:text-gray-400 font-medium">
                                {tab === 'today' ? 'Нет активных нарядов на сегодня' : 'Нет предстоящих нарядов'}
                            </p>
                        </div>
                    )}
                </motion.div>
            )}
            </AnimatePresence>
        </div>
    );
}

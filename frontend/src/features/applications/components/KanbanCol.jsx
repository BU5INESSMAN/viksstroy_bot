import { useState } from 'react';
import {
    Calendar, MapPin, Users, Truck,
    ChevronDown, ChevronUp, HardHat, CheckCircle, Search, Archive
} from 'lucide-react';
import { motion } from 'framer-motion';
import ObjectDisplay from '../../../components/ui/ObjectDisplay';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const staggerContainer = { animate: { transition: { staggerChildren: 0.04 } } };
const staggerItem = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

export default function KanbanCol({ title, icon: Icon, colorClass, apps, isOpen, toggleOpen, onAppClick, canArchive, onArchive }) {
    const [showAll, setShowAll] = useState(false);
    const displayedApps = showAll ? apps : apps.slice(0, 10);

    return (
        <div className="flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-all duration-300">
            <button onClick={toggleOpen} className={`p-4 flex justify-between items-center w-full text-left font-bold ${colorClass} transition-colors lg:cursor-default outline-none`}>
                <span className="flex items-center gap-2">
                    <Icon className="w-5 h-5" />
                    {title}
                    <span className="ml-1 bg-white/60 dark:bg-black/20 text-gray-800 dark:text-white text-xs px-2.5 py-0.5 rounded-full font-bold">{apps.length}</span>
                </span>
                <span className="lg:hidden text-opacity-70">
                    {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </span>
            </button>
            <div className={`p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/20 min-h-[100px] transition-all duration-300 ${isOpen ? 'block' : 'hidden lg:block'}`}>
                <motion.div initial="initial" animate="animate" variants={prefersReducedMotion ? {} : staggerContainer} className="space-y-3">
                {displayedApps.map(a => {
                    let equipList = [];
                    if (a.equipment_data) {
                        try {
                            const parsed = JSON.parse(a.equipment_data);
                            if (parsed && parsed.length > 0) {
                                equipList = parsed;
                            }
                        } catch(e) {}
                    }

                    // Парсим ID бригад
                    const teamIds = a.team_id && a.team_id !== '0' ? String(a.team_id).split(',').map(Number) : [];
                    const freedTeamIds = a.freed_team_ids ? String(a.freed_team_ids).split(',').map(Number) : [];

                    return (
                        <motion.div key={a.id} variants={prefersReducedMotion ? {} : staggerItem} transition={{ duration: 0.2 }} onClick={() => onAppClick(a)} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 text-sm cursor-pointer transition-all duration-200 group active:scale-[0.98]">
                            <div className="mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                <ObjectDisplay
                                    name={a.object_name || a.object_address}
                                    address={a.object_name ? a.object_address : ''}
                                    nameClassName="font-bold text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate leading-tight"
                                />
                            </div>

                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium flex items-center gap-1.5">
                                <HardHat className="w-3.5 h-3.5 text-gray-400" />
                                <span>{a.foreman_name || 'Неизвестный прораб'}</span>
                            </p>

                            <div className="flex items-center gap-3 mb-3">
                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-md">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {a.date_target}
                                </p>
                            </div>

                            {/* РАЗДЕЛЬНОЕ ОТОБРАЖЕНИЕ БРИГАД В КАНБАНЕ */}
                            <div className="space-y-1.5 mb-2">
                                {teamIds.length > 0 ? (
                                    teamIds.map(tId => {
                                        const tMembers = a.members_data?.filter(m => m.team_id === tId) || [];
                                        const tName = tMembers.length > 0 ? tMembers[0].team_name : `Бригада #${tId}`;
                                        const isFreed = freedTeamIds.includes(tId) || a.is_team_freed === 1;

                                        return (
                                            <p key={tId} className={`text-xs flex items-center gap-1.5 ${isFreed ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300 font-medium'}`}>
                                                <Users className={`w-3.5 h-3.5 flex-shrink-0 ${isFreed ? 'text-gray-400' : 'text-indigo-400'}`} />
                                                <span className="truncate">{tName}</span>
                                                {isFreed && <span className="ml-auto flex-shrink-0 text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Свободна</span>}
                                            </p>
                                        );
                                    })
                                ) : (
                                    <p className="text-xs text-gray-500 italic flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 flex-shrink-0" /> Без бригад
                                    </p>
                                )}
                            </div>

                            {equipList.length > 0 && (
                                <div className="mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-700 space-y-1">
                                    {equipList.map((eq, idx) => {
                                        // Compact: first word of name + license plate in brackets
                                        const fullName = eq.name || '';
                                        const driverMatch = fullName.match(/\(([^)]+)\)\s*$/);
                                        const driverFio = driverMatch && driverMatch[1] !== 'Не указан' ? driverMatch[1] : null;
                                        const nameWithoutDriver = driverFio ? fullName.replace(/\s*\([^)]+\)\s*$/, '') : fullName;
                                        const firstWord = nameWithoutDriver.split(' ')[0];
                                        const bracketMatch = nameWithoutDriver.match(/\[([^\]]+)\]/);
                                        const plate = bracketMatch ? bracketMatch[1] : (eq.license_plate || '');
                                        const label = plate ? `${firstWord} ${plate.replace(/\s+/g, '')}` : firstWord;
                                        return (
                                            <div key={idx}>
                                                <p className={`text-xs truncate flex items-center gap-1.5 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
                                                    <Truck className="w-3 h-3 flex-shrink-0" />
                                                    <span>{label}</span>
                                                    {eq.time_start != null && <span className="text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">{eq.time_start}–{eq.time_end}</span>}
                                                    {eq.is_freed && <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                                                </p>
                                                {driverFio && !eq.is_freed && (
                                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate ml-[18px]">{driverFio}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {canArchive && onArchive && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onArchive(a.id); }}
                                    className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 py-2 rounded-lg border border-purple-200 dark:border-purple-800/50 transition-all active:scale-[0.98]"
                                    title="Отправить в архив"
                                >
                                    <Archive className="w-3.5 h-3.5" /> В архив
                                </button>
                            )}
                        </motion.div>
                    );
                })}
                </motion.div>
                {apps.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                        <Search className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs italic">Нет заявок</p>
                    </div>
                )}

                {apps.length > 10 && (
                    <button onClick={() => setShowAll(!showAll)} className="w-full mt-2 py-2.5 text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-xl transition-all active:scale-[0.98]">
                        {showAll ? 'Свернуть' : `Показать все (${apps.length})`}
                    </button>
                )}
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart3, MapPin, TrendingUp } from 'lucide-react';
import axios from 'axios';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function TeamStatsModal({ isOpen, onClose, team, tgId }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('month');

    useEffect(() => {
        if (isOpen && team?.id) {
            setLoading(true);
            axios.get(`/api/applications/review?tg_id=${tgId}`)
                .then(res => {
                    const allApps = res.data || [];

                    // Filter apps that include this team
                    const teamApps = allApps.filter(app => {
                        const ids = String(app.team_id || '').split(',').map(Number);
                        return ids.includes(team.id);
                    });

                    // Period filter
                    const now = new Date();
                    const cutoff = period === 'week' ? new Date(now - 7 * 86400000) :
                                   period === 'month' ? new Date(now - 30 * 86400000) : new Date(0);

                    const filtered = teamApps.filter(a => new Date(a.date_target) >= cutoff);

                    const total = filtered.length;
                    const completed = filtered.filter(a => a.status === 'completed').length;
                    const rejected = filtered.filter(a => ['rejected', 'cancelled'].includes(a.status)).length;
                    const objects = [...new Set(filtered.map(a => a.object_address).filter(Boolean))];
                    const workDays = new Set(filtered.filter(a => !['rejected', 'cancelled'].includes(a.status)).map(a => a.date_target)).size;

                    const foremanCounts = {};
                    filtered.forEach(a => {
                        if (a.foreman_name) foremanCounts[a.foreman_name] = (foremanCounts[a.foreman_name] || 0) + 1;
                    });
                    const topForemen = Object.entries(foremanCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

                    const lastApp = filtered.length > 0 ? filtered.sort((a, b) => b.date_target.localeCompare(a.date_target))[0] : null;

                    setStats({ total, completed, rejected, objects, workDays, topForemen, lastApp });
                })
                .catch(() => setStats(null))
                .finally(() => setLoading(false));
        }
    }, [isOpen, team, period, tgId]);

    if (!isOpen) return null;

    const anim = prefersReducedMotion ? {} : { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.95 }, transition: { duration: 0.2 } };

    return (
        <AnimatePresence>
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
                onClick={onClose}
            >
                <motion.div
                    {...anim}
                    className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-blue-500" />
                            {team?.name}
                        </h3>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>

                    {/* Period tabs */}
                    <div className="flex gap-1 px-5 pt-3">
                        {[['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']].map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setPeriod(key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    period === key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                        {loading ? (
                            <div className="text-center text-gray-400 py-8">Загрузка...</div>
                        ) : !stats ? (
                            <div className="text-center text-gray-400 py-8">Нет данных</div>
                        ) : (
                            <>
                                {/* Stats grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3.5 border border-gray-100 dark:border-gray-600">
                                        <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.total}</p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Заявок всего</p>
                                    </div>
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3.5 border border-emerald-100 dark:border-emerald-800/30">
                                        <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Завершено</p>
                                    </div>
                                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3.5 border border-blue-100 dark:border-blue-800/30">
                                        <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{stats.workDays}</p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Рабочих дней</p>
                                    </div>
                                    <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3.5 border border-red-100 dark:border-red-800/30">
                                        <p className="text-2xl font-extrabold text-red-600 dark:text-red-400">{stats.rejected}</p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Отклонено</p>
                                    </div>
                                </div>

                                {/* Top foremen */}
                                {stats.topForemen.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                            <TrendingUp className="w-4 h-4 text-gray-400" /> Прорабы
                                        </h4>
                                        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-600">
                                            {stats.topForemen.map(([name, count], i) => (
                                                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
                                                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{count} заявок</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Objects */}
                                {stats.objects.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                            <MapPin className="w-4 h-4 text-gray-400" /> Объекты ({stats.objects.length})
                                        </h4>
                                        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600 px-4 py-2">
                                            {stats.objects.slice(0, 5).map((obj, i) => (
                                                <p key={i} className="text-sm text-gray-600 dark:text-gray-400 py-1 truncate">{obj}</p>
                                            ))}
                                            {stats.objects.length > 5 && (
                                                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">...и ещё {stats.objects.length - 5}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Last activity */}
                                {stats.lastApp && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 pt-2">
                                        Последняя заявка: {stats.lastApp.date_target} — {stats.lastApp.object_address}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

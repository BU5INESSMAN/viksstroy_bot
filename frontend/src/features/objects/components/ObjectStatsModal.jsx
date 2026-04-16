import { useState } from 'react';
import { X, BarChart3, Calendar, ChevronDown, ChevronUp } from 'lucide-react';

/** Render a catalog unit string safely. Hides empties and purely
 *  numeric values (catalog sometimes has stray numbers in the unit
 *  column — we defend against that). */
function formatUnit(raw) {
    const s = (raw || '').toString().trim();
    if (!s) return '—';
    if (!Number.isNaN(Number(s.replace(',', '.')))) return '—';
    return s;
}

export default function ObjectStatsModal({ statsObj, statsData, statsLoading, onClose }) {
    const [expandedDates, setExpandedDates] = useState({});

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                    <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-amber-500" /> Статистика: {statsObj.name}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1.5 border border-gray-100 dark:border-gray-700"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {statsLoading ? (
                        <div className="text-center py-12 text-gray-400 animate-pulse font-bold">
                            Загрузка...
                        </div>
                    ) : statsData ? (
                        <>
                            {/* Creation date */}
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 p-3 rounded-xl">
                                <Calendar className="w-4 h-4" />
                                <span>
                                    Дата создания объекта:{' '}
                                    <span className="font-bold text-gray-700 dark:text-gray-200">
                                        {statsData.created_at?.slice(0, 10) || '—'}
                                    </span>
                                </span>
                            </div>

                            {/* Progress: Plan vs Fact */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                                    Общий прогресс
                                </h4>
                                {statsData.progress?.length > 0 ? (
                                    <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                        <div className="grid grid-cols-[1fr_50px_70px_70px_50px] gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                            <span>Работа</span>
                                            <span className="text-center">Ед.</span>
                                            <span className="text-right">Факт</span>
                                            <span className="text-right">План</span>
                                            <span className="text-right">%</span>
                                        </div>
                                        <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                            {statsData.progress.map((p, i) => {
                                                const pct =
                                                    p.target_volume > 0
                                                        ? Math.round(
                                                              (p.completed_volume / p.target_volume) * 100
                                                          )
                                                        : p.completed_volume > 0
                                                        ? 100
                                                        : 0;
                                                return (
                                                    <div
                                                        key={i}
                                                        className="grid grid-cols-[1fr_50px_70px_70px_50px] gap-2 px-4 py-3 items-center"
                                                    >
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">
                                                                {p.name}
                                                            </p>
                                                            <p className="text-[10px] text-gray-400 mt-0.5">
                                                                {p.category}
                                                            </p>
                                                        </div>
                                                        <span className="text-xs text-gray-400 text-center whitespace-nowrap">
                                                            {formatUnit(p.unit)}
                                                        </span>
                                                        <span className="text-sm font-bold text-right text-gray-800 dark:text-gray-200">
                                                            {p.completed_volume}
                                                        </span>
                                                        <span className="text-sm text-right text-gray-500">
                                                            {p.target_volume || '—'}
                                                        </span>
                                                        <span
                                                            className={`text-sm font-bold text-right ${pct >= 100 ? 'text-emerald-600' : pct > 50 ? 'text-amber-600' : 'text-gray-400'}`}
                                                        >
                                                            {p.target_volume > 0 ? `${pct}%` : '—'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-center text-gray-400 italic py-4">
                                        Нет данных по плану СМР
                                    </p>
                                )}
                            </div>

                            {/* History timeline */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                                    Хронология выполнения
                                </h4>
                                {statsData.history?.length > 0 ? (
                                    (() => {
                                        const byDate = {};
                                        statsData.history.forEach(h => {
                                            const key = `${h.date_target} — Заявка #${h.app_id}`;
                                            if (!byDate[key]) byDate[key] = [];
                                            byDate[key].push(h);
                                        });
                                        return (
                                            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                                                {Object.entries(byDate).map(([dateKey, items]) => (
                                                    <div
                                                        key={dateKey}
                                                        className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden"
                                                    >
                                                        <button
                                                            onClick={() =>
                                                                setExpandedDates(prev => ({
                                                                    ...prev,
                                                                    [dateKey]: !prev[dateKey],
                                                                }))
                                                            }
                                                            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors"
                                                        >
                                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                                                {dateKey}
                                                            </span>
                                                            {expandedDates[dateKey] ? (
                                                                <ChevronUp className="w-4 h-4 text-gray-400" />
                                                            ) : (
                                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                                            )}
                                                        </button>
                                                        {expandedDates[dateKey] && (
                                                            <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                                                {items.map((h, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className="flex justify-between px-4 py-2 text-sm"
                                                                    >
                                                                        <span className="text-gray-700 dark:text-gray-300">
                                                                            {h.name}
                                                                            {(() => {
                                                                                const u = formatUnit(h.unit);
                                                                                return u && u !== '—' ? (
                                                                                    <span className="text-gray-400 text-xs ml-1">({u})</span>
                                                                                ) : null;
                                                                            })()}
                                                                        </span>
                                                                        <span className="font-bold text-gray-800 dark:text-gray-200">
                                                                            {h.volume}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <p className="text-center text-gray-400 italic py-4">
                                        Нет выполненных работ
                                    </p>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

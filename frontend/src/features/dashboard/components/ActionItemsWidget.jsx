import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ClipboardCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLORS = {
    critical: 'border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20',
    warning: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20',
    info: 'border-blue-200 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20',
};

export default function ActionItemsWidget({ data, loading, onRefresh }) {
    const navigate = useNavigate();
    const items = useMemo(() => data?.items || [], [data?.items]);
    const [expandedGroups, setExpandedGroups] = useState({});
    const groups = useMemo(() => {
        const grouped = new Map();
        items.forEach((item) => {
            const key = item.issue_key || item.id;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    key,
                    title: item.issue_title || item.title,
                    severity: item.severity,
                    count: 0,
                    items: [],
                });
            }
            const group = grouped.get(key);
            group.count += Number(item.count || 1);
            group.items.push(item);
            if (item.severity === 'critical') group.severity = 'critical';
        });
        return [...grouped.values()];
    }, [items]);

    return (
        <section data-tour="action-items-widget" className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden min-w-0">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100 dark:border-gray-700">
                <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5 text-amber-500" /> Требует внимания
                        {!loading && data?.total > 0 && (
                            <span className="min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center">{data.total}</span>
                        )}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Только задачи, которые доступны вашей роли</p>
                </div>
                <button type="button" onClick={onRefresh} className="w-11 h-11 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-700 text-gray-500 hover:text-blue-600" aria-label="Обновить список проблем">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {loading ? (
                <div className="p-8 text-center text-sm text-gray-400">Проверяем данные…</div>
            ) : items.length === 0 ? (
                <div className="p-8 text-center">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                    <p className="font-bold text-emerald-700 dark:text-emerald-400">Доступных задач нет</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Всё, что относится к вашей роли, сейчас в порядке</p>
                </div>
            ) : (
                <div className="max-h-[28rem] overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {groups.map((group) => {
                        const isExpanded = Boolean(expandedGroups[group.key]);
                        const hasSeveral = group.items.length > 1;
                        const color = COLORS[group.severity] || COLORS.warning;
                        const iconColor = group.severity === 'critical' ? 'text-red-500' : group.severity === 'info' ? 'text-blue-500' : 'text-amber-500';
                        return (
                            <div key={group.key} className={`rounded-2xl border overflow-hidden ${color}`}>
                                <button
                                    type="button"
                                    onClick={() => hasSeveral
                                        ? setExpandedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))
                                        : navigate(group.items[0].url)}
                                    className="w-full min-w-0 p-3.5 text-left flex items-start gap-3 transition-all hover:bg-white/30 dark:hover:bg-white/[0.03] active:scale-[0.995]"
                                >
                                    <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="font-bold text-sm text-gray-900 dark:text-white break-words">{group.title}</span>
                                            <span className="flex-shrink-0 rounded-lg bg-white/80 dark:bg-black/20 px-2 py-0.5 text-[10px] font-black text-gray-600 dark:text-gray-300">{group.count}</span>
                                        </span>
                                        <span className="block mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                                            {hasSeveral ? `Затронуто записей: ${group.items.length}. Нажмите, чтобы посмотреть.` : group.items[0].description}
                                        </span>
                                    </span>
                                    {hasSeveral
                                        ? <ChevronDown className={`w-4 h-4 flex-shrink-0 mt-1 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        : <ArrowRight className="w-4 h-4 flex-shrink-0 mt-1 text-gray-400" />}
                                </button>
                                {hasSeveral && isExpanded && (
                                    <div className="border-t border-black/5 dark:border-white/10 bg-white/45 dark:bg-black/10 p-2 space-y-1">
                                        {group.items.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => navigate(item.url)}
                                                className="w-full min-w-0 rounded-xl px-3 py-2.5 text-left flex items-center gap-3 hover:bg-white/80 dark:hover:bg-white/[0.06]"
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-bold text-gray-800 dark:text-gray-100 break-words">{item.title}</span>
                                                    <span className="block mt-0.5 text-xs text-gray-600 dark:text-gray-400 break-words">{item.description}</span>
                                                </span>
                                                {item.count > 1 && <span className="flex-shrink-0 text-[10px] font-black text-gray-500">{item.count}</span>}
                                                <ArrowRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLORS = {
    critical: 'border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20',
    warning: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20',
    info: 'border-blue-200 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20',
};

export default function ActionItemsWidget({ data, loading, onRefresh }) {
    const navigate = useNavigate();
    const items = data?.items || [];

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
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Незаполненные данные и ожидающие действия</p>
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
                    <p className="font-bold text-emerald-700 dark:text-emerald-400">Всё заполнено</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ожидающих действий сейчас нет</p>
                </div>
            ) : (
                <div className="max-h-[28rem] overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => navigate(item.url)}
                            className={`w-full min-w-0 rounded-2xl border p-3.5 text-left flex items-start gap-3 transition-all hover:shadow-sm active:scale-[0.99] ${COLORS[item.severity] || COLORS.warning}`}
                        >
                            <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${item.severity === 'critical' ? 'text-red-500' : item.severity === 'info' ? 'text-blue-500' : 'text-amber-500'}`} />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className="font-bold text-sm text-gray-900 dark:text-white break-words">{item.title}</span>
                                    {item.count > 1 && <span className="flex-shrink-0 rounded-lg bg-white/80 dark:bg-black/20 px-2 py-0.5 text-[10px] font-black text-gray-600 dark:text-gray-300">{item.count}</span>}
                                </span>
                                <span className="block mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400 break-words">{item.description}</span>
                            </span>
                            <ArrowRight className="w-4 h-4 flex-shrink-0 mt-1 text-gray-400" />
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

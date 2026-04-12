import { FileText, Terminal, RefreshCw, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { GlassCard, SectionHeader } from './UIHelpers';

export default function LogViewer({ logs, serverLogs, fetchServerLogs, serverLogsLoading }) {
    const [logsExpanded, setLogsExpanded] = useState(false);

    const formatLogTime = (timestamp) => {
        if (!timestamp) return '';
        let safe = timestamp;
        if (typeof timestamp === 'string' && !timestamp.includes('Z') && !timestamp.includes('+'))
            safe = timestamp.replace(' ', 'T') + 'Z';
        try {
            return new Date(safe).toLocaleString('ru-RU', { timeZone: 'Asia/Barnaul', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch { return new Date(timestamp).toLocaleString('ru-RU'); }
    };

    const TARGET_TYPE_LABELS = {
        application: 'Заявка', user: 'Пользователь', equipment: 'Техника',
        team: 'Бригада', object: 'Объект', smr: 'СМР',
        exchange: 'Обмен', system: 'Система', settings: 'Настройки',
    };

    const formatContext = (log) => {
        if (!log.target_type) return '—';
        const label = TARGET_TYPE_LABELS[log.target_type] || log.target_type;
        return log.target_id ? `${label} #${log.target_id}` : label;
    };

    const displayedLogs = logsExpanded ? logs : logs.slice(0, 10);

    return (
        <>
            {/* ====== ACTION LOGS ====== */}
            <GlassCard className="p-6 sm:p-8 overflow-hidden">
                <SectionHeader icon={FileText} iconColor="text-orange-500 bg-orange-500" title="Журнал действий" />
                <div className="-mx-2 sm:mx-0 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/50">
                                <th className="px-4 py-3 font-bold w-28">Время</th>
                                <th className="px-4 py-3 font-bold w-40">Пользователь</th>
                                <th className="px-4 py-3 font-bold">Действие</th>
                                <th className="px-4 py-3 font-bold w-24">Контекст</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/80 dark:divide-gray-700/30">
                            {displayedLogs.map((log) => {
                                const isError = log.action && (log.action.includes('Ошибка') || log.action.includes('ошибка') || log.action.includes('ERROR'));
                                return (
                                    <tr key={log.id} className={`transition-colors ${isError ? 'bg-red-50/50 dark:bg-red-900/10' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'}`}>
                                        <td className="px-4 py-3 whitespace-nowrap text-[11px] font-mono text-gray-400">{formatLogTime(log.timestamp)}</td>
                                        <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap text-xs">{log.fio || 'Система'}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                                            {isError && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline mr-1.5 -mt-0.5" />}
                                            {log.action}
                                        </td>
                                        <td className="px-4 py-3 text-[11px] font-mono text-gray-400">
                                            {formatContext(log)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {logs.length > 10 && (
                    <div className="mt-5 text-center">
                        <button onClick={() => setLogsExpanded(!logsExpanded)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold text-xs transition-all active:scale-95 py-2.5 px-5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 flex items-center justify-center gap-1.5 mx-auto">
                            {logsExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Свернуть</> : <><ChevronDown className="w-3.5 h-3.5" /> Все записи ({logs.length})</>}
                        </button>
                    </div>
                )}
            </GlassCard>

            {/* ====== SERVER LOGS TERMINAL ====== */}
            <GlassCard className="overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700/50">
                    <SectionHeader icon={Terminal} iconColor="text-green-500 bg-green-500" title="Серверные логи" />
                    <button onClick={fetchServerLogs} disabled={serverLogsLoading}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 bg-gray-100 hover:bg-green-50 dark:bg-gray-700 dark:hover:bg-green-900/20 px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 transition-all active:scale-95 disabled:opacity-50 -mt-5">
                        <RefreshCw className={`w-3.5 h-3.5 ${serverLogsLoading ? 'animate-spin' : ''}`} />
                        {serverLogsLoading ? 'Загрузка...' : 'Обновить'}
                    </button>
                </div>
                <div className="bg-slate-900 p-4 sm:p-5 max-h-80 overflow-y-auto custom-scrollbar font-mono text-xs leading-relaxed">
                    {serverLogs.length === 0 ? (
                        <p className="text-slate-500">Нажмите "Обновить" для загрузки серверных логов...</p>
                    ) : (
                        serverLogs.map((line, i) => {
                            const isErr = line.includes('ERROR') || line.includes('Exception') || line.includes('Traceback');
                            const isWarn = line.includes('WARNING') || line.includes('WARN');
                            return (
                                <div key={i} className={`py-0.5 ${isErr ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-slate-300'}`}>
                                    <span className="text-slate-600 select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>
                                    {line}
                                </div>
                            );
                        })
                    )}
                </div>
            </GlassCard>
        </>
    );
}

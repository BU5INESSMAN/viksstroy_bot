import { FileText, Terminal, RefreshCw, AlertTriangle, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { GlassCard, SectionHeader } from './UIHelpers';


function groupLogs(logs) {
    const result = [];
    let i = 0;

    while (i < logs.length) {
        const log = logs[i];

        if (log.target_type === 'notification' && log.action?.startsWith('📨')) {
            const msgMatch = log.action.match(/^📨\s*(?:TG|MAX)\s*→\s*[^:]+:\s*(.+)$/);
            const msgKey = msgMatch ? msgMatch[1].trim() : null;

            if (msgKey) {
                const baseTime = new Date(log.timestamp).getTime();
                const group = [log];

                let j = i + 1;
                while (j < logs.length) {
                    const next = logs[j];
                    if (next.target_type !== 'notification' || !next.action?.startsWith('📨')) break;
                    const nextMatch = next.action.match(/^📨\s*(?:TG|MAX)\s*→\s*[^:]+:\s*(.+)$/);
                    const nextKey = nextMatch ? nextMatch[1].trim() : null;
                    if (nextKey !== msgKey) break;
                    if (Math.abs(new Date(next.timestamp).getTime() - baseTime) > 10000) break;
                    group.push(next);
                    j++;
                }

                if (group.length > 1) {
                    const recipients = [];
                    const tgR = [];
                    const maxR = [];
                    group.forEach(g => {
                        const m = g.action.match(/^📨\s*(TG|MAX)\s*→\s*([^:]+):/);
                        if (m) {
                            const name = m[2].trim();
                            if (!recipients.includes(name)) recipients.push(name);
                            if (m[1] === 'TG' && !tgR.includes(name)) tgR.push(name);
                            if (m[1] === 'MAX' && !maxR.includes(name)) maxR.push(name);
                        }
                    });
                    result.push({
                        ...log,
                        _grouped: true,
                        _count: group.length,
                        _recipients: recipients,
                        _tgR: tgR,
                        _maxR: maxR,
                        _preview: msgKey.length > 70 ? msgKey.slice(0, 67) + '...' : msgKey,
                    });
                    i = j;
                    continue;
                }
            }
        }
        result.push(log);
        i++;
    }
    return result;
}


export default function LogViewer({ logs, serverLogs, fetchServerLogs, serverLogsLoading }) {
    const [logsExpanded, setLogsExpanded] = useState(false);
    const [expanded, setExpanded] = useState({});

    const grouped = useMemo(() => groupLogs(logs), [logs]);
    const displayedLogs = logsExpanded ? grouped : grouped.slice(0, 10);

    const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

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
        notification: 'Уведомление',
    };

    const formatContext = (log) => {
        if (!log.target_type) return '—';
        const label = TARGET_TYPE_LABELS[log.target_type] || log.target_type;
        return log.target_id ? `${label} #${log.target_id}` : label;
    };

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
                                if (log._grouped) {
                                    const isOpen = expanded[log.id];
                                    return (
                                        <tr key={`g-${log.id}`} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-[11px] font-mono text-gray-400">{formatLogTime(log.timestamp)}</td>
                                            <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap text-xs">Система</td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                                                <div className="cursor-pointer select-none" onClick={() => toggleExpand(log.id)}>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                                                        <span className="truncate">📨 {log._preview}</span>
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-800/50 whitespace-nowrap flex-shrink-0">
                                                            {log._recipients.length} получат.
                                                        </span>
                                                    </div>
                                                    {isOpen && (
                                                        <div className="mt-2 ml-5 text-xs text-gray-400 dark:text-gray-500 space-y-1">
                                                            {log._tgR.length > 0 && <div><span className="font-bold text-blue-500 dark:text-blue-400">TG:</span> {log._tgR.join(', ')}</div>}
                                                            {log._maxR.length > 0 && <div><span className="font-bold text-indigo-500 dark:text-indigo-400">MAX:</span> {log._maxR.join(', ')}</div>}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-[11px] font-mono text-gray-400">
                                                <span className="text-blue-500 dark:text-blue-400">×{log._count}</span>
                                            </td>
                                        </tr>
                                    );
                                }

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
                {grouped.length > 10 && (
                    <div className="mt-5 text-center">
                        <button onClick={() => setLogsExpanded(!logsExpanded)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold text-xs transition-all active:scale-95 py-2.5 px-5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 flex items-center justify-center gap-1.5 mx-auto">
                            {logsExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Свернуть</> : <><ChevronDown className="w-3.5 h-3.5" /> Все записи ({grouped.length})</>}
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

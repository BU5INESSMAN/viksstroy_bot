import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    CalendarCheck, X, Send, User, AlertTriangle,
    Loader2, Users, MapPin, CheckCircle, Clock
} from 'lucide-react';

export default function ScheduleModal({ isOpen, onClose, tgId }) {
    const [dateBlocks, setDateBlocks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sendingDate, setSendingDate] = useState(null); // which date is being sent
    const [sendingTarget, setSendingTarget] = useState(null); // 'group' | 'self'

    useEffect(() => {
        if (isOpen) {
            setSendingDate(null);
            setSendingTarget(null);
            setLoading(true);
            axios.get(`/api/system/schedule_dates?tg_id=${tgId}`)
                .then(res => setDateBlocks(res.data || []))
                .catch(() => setDateBlocks([]))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    const doSend = async (date, target) => {
        setSendingDate(date);
        setSendingTarget(target);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('date', date);

            const endpoint = target === 'group'
                ? '/api/system/send_schedule_group'
                : '/api/system/send_schedule_self';

            const res = await axios.post(endpoint, fd);

            if (target === 'group') {
                toast.success(`Расстановка отправлена в группу! Уведомлено: ${res.data.notified || 0}`);
            } else {
                toast.success("Расстановка отправлена вам в ЛС!");
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка отправки");
        } finally {
            setSendingDate(null);
            setSendingTarget(null);
        }
    };

    if (!isOpen) return null;

    const isSending = sendingDate !== null;

    return (
        <div className="fixed inset-0 w-screen h-[100dvh] z-[99990] bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                            <CalendarCheck className="text-blue-500 w-6 h-6" />
                            Расстановка
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
                                <p className="text-sm font-medium">Загрузка...</p>
                            </div>
                        ) : dateBlocks.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">Нет активных заявок</p>
                            </div>
                        ) : (
                            dateBlocks.map(block => (
                                <div key={block.date} className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                                    {/* Date Header */}
                                    <div className="bg-gray-50 dark:bg-gray-900/40 px-4 py-3 flex justify-between items-center">
                                        <span className="font-bold text-sm dark:text-white">{block.date}</span>
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                            {block.approved.length > 0 && (
                                                <span className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                                                    <CheckCircle className="w-3 h-3" /> {block.approved.length}
                                                </span>
                                            )}
                                            {block.waiting.length > 0 && (
                                                <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                                                    <Clock className="w-3 h-3" /> {block.waiting.length}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Apps List */}
                                    <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                        {block.approved.map((app, i) => (
                                            <div key={`a-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                <span className="truncate text-gray-700 dark:text-gray-300">{app.object_address}</span>
                                                <span className="text-gray-400 dark:text-gray-500 mx-1">—</span>
                                                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 text-xs">{app.foreman_name}</span>
                                            </div>
                                        ))}
                                        {block.waiting.map((app, i) => (
                                            <div key={`w-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-sm bg-amber-50/50 dark:bg-amber-900/10">
                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                                <span className="truncate text-amber-700 dark:text-amber-300">{app.object_address}</span>
                                                <span className="text-amber-400 dark:text-amber-500 mx-1">—</span>
                                                <span className="text-amber-500 dark:text-amber-400 flex-shrink-0 text-xs">{app.foreman_name}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 px-4 py-3 bg-gray-50/50 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700/50">
                                        <button
                                            onClick={() => doSend(block.date, 'group')}
                                            disabled={isSending}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs py-2.5 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {sendingDate === block.date && sendingTarget === 'group'
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Users className="w-3.5 h-3.5" />}
                                            В группу
                                        </button>
                                        <button
                                            onClick={() => doSend(block.date, 'self')}
                                            disabled={isSending}
                                            className="flex-1 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs py-2.5 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {sendingDate === block.date && sendingTarget === 'self'
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <User className="w-3.5 h-3.5" />}
                                            Себе
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

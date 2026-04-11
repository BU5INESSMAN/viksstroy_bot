import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    CalendarCheck, X, Send, User, AlertTriangle,
    ChevronDown, Loader2, Users, MapPin
} from 'lucide-react';

export default function ScheduleModal({ isOpen, onClose, tgId }) {
    const [dates, setDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [warnings, setWarnings] = useState(null); // null = not checked, [] = checked & clean
    const [confirmTarget, setConfirmTarget] = useState(null); // 'group' | 'self'

    useEffect(() => {
        if (isOpen) {
            setSelectedDate('');
            setWarnings(null);
            setConfirmTarget(null);
            setLoading(true);
            axios.get(`/api/system/schedule_dates?tg_id=${tgId}`)
                .then(res => setDates(res.data || []))
                .catch(() => setDates([]))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    // Reset warnings when date changes
    useEffect(() => {
        setWarnings(null);
        setConfirmTarget(null);
    }, [selectedDate]);

    const checkAndSend = async (target) => {
        if (!selectedDate) return toast.error("Выберите дату");

        // If we haven't checked warnings yet, fetch them
        if (warnings === null) {
            try {
                const res = await axios.get(
                    `/api/system/schedule_warnings?tg_id=${tgId}&date=${selectedDate}`
                );
                const w = res.data || [];
                setWarnings(w);

                if (w.length > 0) {
                    // Show warning step — user must confirm
                    setConfirmTarget(target);
                    return;
                }
                // No warnings — proceed immediately
            } catch {
                toast.error("Ошибка проверки заявок");
                return;
            }
        }

        // Either no warnings or user already confirmed — send
        await doSend(target);
    };

    const doSend = async (target) => {
        setSending(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('date', selectedDate);

            const endpoint = target === 'group'
                ? '/api/system/send_schedule_group'
                : '/api/system/send_schedule_self';

            const res = await axios.post(endpoint, fd);

            if (target === 'group') {
                toast.success(`Расстановка отправлена в группу! Уведомлено: ${res.data.notified || 0}`);
            } else {
                toast.success("Расстановка отправлена вам в ЛС!");
            }
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка отправки");
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

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
                    <div className="p-6 space-y-5">

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
                                <p className="text-sm font-medium">Загрузка дат...</p>
                            </div>
                        ) : dates.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">Нет активных заявок</p>
                            </div>
                        ) : (
                            <>
                                {/* Date Selector */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 block">
                                        Выберите дату расстановки
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedDate}
                                            onChange={e => setSelectedDate(e.target.value)}
                                            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 p-3 rounded-xl text-sm font-bold outline-none dark:text-white focus:ring-2 focus:ring-blue-500 appearance-none pr-10"
                                        >
                                            <option value="">— Выберите дату —</option>
                                            {dates.map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Warning Block */}
                                {warnings && warnings.length > 0 && confirmTarget && (
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 space-y-2">
                                        <p className="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            Непроверенные заявки на эту дату:
                                        </p>
                                        <div className="space-y-1 max-h-40 overflow-y-auto">
                                            {warnings.map((w, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-white/50 dark:bg-gray-800/30 rounded-lg px-3 py-1.5">
                                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{w.object_address}</span>
                                                    <span className="text-amber-500 dark:text-amber-400">—</span>
                                                    <span className="flex-shrink-0">{w.foreman_name}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-2">
                                            Отправить расстановку только по одобренным?
                                        </p>
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => { setConfirmTarget(null); setWarnings(null); }}
                                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95"
                                            >
                                                Отмена
                                            </button>
                                            <button
                                                onClick={() => doSend(confirmTarget)}
                                                disabled={sending}
                                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                Отправить
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons — hide when warning confirmation is active */}
                                {!(warnings && warnings.length > 0 && confirmTarget) && (
                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => checkAndSend('group')}
                                            disabled={!selectedDate || sending}
                                            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl text-sm py-3.5 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                            Отправить в группу
                                        </button>
                                        <button
                                            onClick={() => checkAndSend('self')}
                                            disabled={!selectedDate || sending}
                                            className="w-full bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-sm py-3.5 transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-600 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                                            Отправить себе
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    CalendarCheck, X, User, AlertTriangle,
    Loader2, Users, CheckCircle
} from 'lucide-react';
import ObjectDisplay from '../../../components/ui/ObjectDisplay';
import ModalPortal from '../../../components/ui/ModalPortal';

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function formatDateRu(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()} (${DAYS_RU[d.getDay()]})`;
}

export default function ScheduleModal({ isOpen, onClose, tgId }) {
    const [dateBlocks, setDateBlocks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [sending, setSending] = useState(false);
    const [confirmWarning, setConfirmWarning] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSelectedDate(null);
            setConfirmWarning(false);
            setSending(false);
            setLoading(true);
            axios.get('/api/system/schedule_dates')
                .then(res => {
                    const blocks = (res.data || []).filter(b => b.approved.length > 0 || b.waiting.length > 0);
                    setDateBlocks(blocks);
                })
                .catch(() => setDateBlocks([]))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    const selectedBlock = dateBlocks.find(b => b.date === selectedDate);

    const handleSendGroup = () => {
        if (!selectedBlock) return;
        if (selectedBlock.waiting.length > 0 && !confirmWarning) {
            setConfirmWarning(true);
            return;
        }
        doSend('group');
    };

    const doSend = async (target) => {
        if (!selectedDate) return;
        setConfirmWarning(false);
        setSending(true);
        try {
            const fd = new FormData();
            fd.append('date', selectedDate);

            const endpoint = target === 'group'
                ? '/api/system/send_schedule_group'
                : '/api/system/send_schedule_self';

            const res = await axios.post(endpoint, fd);

            if (target === 'group') {
                toast.success('Расстановка отправляется в группу...');
            } else {
                toast.success('Расстановка отправляется вам в ЛС...');
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка отправки');
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <ModalPortal>
        <div className="fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/60 backdrop-blur-sm overflow-y-auto" style={{ top: 0, left: 0, right: 0, bottom: 0 }} onClick={onClose}>
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 flex-shrink-0">
                        <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                            <CalendarCheck className="text-blue-500 w-6 h-6" />
                            Расстановка
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Scrollable date blocks */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
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
                            dateBlocks.map(block => {
                                const isSelected = selectedDate === block.date;
                                return (
                                    <div
                                        key={block.date}
                                        onClick={() => { setSelectedDate(block.date); setConfirmWarning(false); }}
                                        className={`rounded-2xl overflow-hidden cursor-pointer transition-all duration-150 ${
                                            isSelected
                                                ? 'ring-2 ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-300 dark:border-indigo-600 shadow-md'
                                                : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                                        }`}
                                    >
                                        {/* Date header */}
                                        <div className={`px-4 py-3 flex justify-between items-center ${
                                            isSelected
                                                ? 'bg-indigo-100/60 dark:bg-indigo-900/30'
                                                : 'bg-gray-50 dark:bg-gray-900/40'
                                        }`}>
                                            <span className={`font-bold text-sm ${isSelected ? 'text-indigo-800 dark:text-indigo-300' : 'dark:text-white'}`}>
                                                {formatDateRu(block.date)}
                                            </span>
                                            <div className="flex items-center gap-1.5 text-xs">
                                                {block.approved.length > 0 && (
                                                    <span className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                                                        <CheckCircle className="w-3 h-3" /> {block.approved.length}
                                                    </span>
                                                )}
                                                {block.waiting.length > 0 && (
                                                    <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                                                        <AlertTriangle className="w-3 h-3" /> {block.waiting.length}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Apps list */}
                                        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                            {block.approved.map((app, i) => (
                                                <div key={`a-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                    <ObjectDisplay
                                                        variant="inline"
                                                        showIcon={false}
                                                        name={app.object_name}
                                                        address={app.object_address}
                                                        className="truncate"
                                                        nameClassName="text-gray-700 dark:text-gray-300 truncate"
                                                        addressClassName="text-gray-500 dark:text-gray-400 truncate"
                                                    />
                                                    <span className="text-gray-400 dark:text-gray-500 mx-1 flex-shrink-0">&mdash;</span>
                                                    <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 text-xs">{app.foreman_name}</span>
                                                </div>
                                            ))}
                                            {block.waiting.map((app, i) => (
                                                <div key={`w-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-sm bg-amber-100/60 dark:bg-amber-900/15">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                                    <ObjectDisplay
                                                        variant="inline"
                                                        showIcon={false}
                                                        name={app.object_name}
                                                        address={app.object_address}
                                                        className="truncate"
                                                        nameClassName="text-amber-800 dark:text-amber-300 truncate"
                                                        addressClassName="text-amber-600/80 dark:text-amber-400/80 truncate"
                                                    />
                                                    <span className="text-amber-500 mx-1 flex-shrink-0">&mdash;</span>
                                                    <span className="text-amber-600 dark:text-amber-400 flex-shrink-0 text-xs">{app.foreman_name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Sticky bottom: warning confirmation OR action buttons */}
                    {dateBlocks.length > 0 && (
                        <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-6 py-4 space-y-3">

                            {/* Warning confirmation */}
                            {confirmWarning && selectedBlock && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 space-y-2">
                                    <p className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        На выбранную дату есть неодобренные заявки. Всё равно отправить?
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setConfirmWarning(false)}
                                            className="flex-1 px-3 py-2 rounded-xl text-xs font-bold border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95"
                                        >
                                            Отмена
                                        </button>
                                        <button
                                            onClick={() => doSend('group')}
                                            disabled={sending}
                                            className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                        >
                                            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                                            Да, отправить
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Action buttons */}
                            {!confirmWarning && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleSendGroup}
                                        disabled={!selectedDate || sending}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm py-3 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                                    >
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                        В группу
                                    </button>
                                    <button
                                        onClick={() => doSend('self')}
                                        disabled={!selectedDate || sending}
                                        className="flex-1 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-sm py-3 transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                                    >
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                                        Себе
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
        </ModalPortal>
    );
}

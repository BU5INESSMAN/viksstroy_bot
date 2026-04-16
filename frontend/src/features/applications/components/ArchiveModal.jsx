import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    Archive, Calendar, MapPin, HardHat, Users, Truck,
    X, Search, ChevronDown, ChevronUp, RotateCcw
} from 'lucide-react';
import useConfirm from '../../../hooks/useConfirm';

export default function ArchiveModal({ isOpen, onClose, onDataChanged }) {
    const tgId = localStorage.getItem('tg_id') || '0';
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [expandedDates, setExpandedDates] = useState({});
    const [restoringId, setRestoringId] = useState(null);
    const { confirm, ConfirmUI } = useConfirm();

    const fetchArchive = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            const res = await axios.get(`/api/applications/archive?${params.toString()}`);
            setApps(res.data || []);
            // Auto-expand all date groups
            const groups = {};
            (res.data || []).forEach(a => { groups[a.date_target] = true; });
            setExpandedDates(groups);
        } catch (e) {
            console.error('Archive fetch error', e);
        }
        setLoading(false);
    };

    const handleRestore = async (appId) => {
        const ok = await confirm('Восстановить заявку из архива? Она вернётся в канбан-доску.', {
            title: 'Восстановление из архива',
            variant: 'info',
            confirmText: 'Восстановить',
        });
        if (!ok) return;
        setRestoringId(appId);
        try {
            await axios.post(`/api/applications/${appId}/unarchive`);
            toast.success('Заявка восстановлена из архива');
            fetchArchive();
            if (onDataChanged) onDataChanged();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка восстановления');
        } finally {
            setRestoringId(null);
        }
    };

    useEffect(() => {
        if (isOpen) fetchArchive();
    }, [isOpen]);

    if (!isOpen) return null;

    // Group by date_target
    const grouped = {};
    apps.forEach(a => {
        const d = a.date_target || 'Без даты';
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(a);
    });
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[99990] bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                            <Archive className="text-purple-500 w-6 h-6" />
                            Архив нарядов
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Date filter */}
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10">
                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">С даты</label>
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                    className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 p-2.5 rounded-xl text-sm font-medium outline-none dark:text-white focus:ring-2 focus:ring-purple-500" />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">По дату</label>
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                    className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 p-2.5 rounded-xl text-sm font-medium outline-none dark:text-white focus:ring-2 focus:ring-purple-500" />
                            </div>
                            <button onClick={fetchArchive} className="bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-purple-700 transition-all active:scale-95 flex items-center gap-2">
                                <Search className="w-4 h-4" /> Найти
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                <p className="text-sm font-medium">Загрузка архива...</p>
                            </div>
                        ) : sortedDates.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <Archive className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">Архив пуст</p>
                            </div>
                        ) : (
                            sortedDates.map(date => (
                                <div key={date} className="bg-gray-50/80 dark:bg-gray-700/20 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <button
                                        onClick={() => setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }))}
                                        className="w-full flex justify-between items-center px-5 py-3 font-bold text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors"
                                    >
                                        <span className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-purple-500" />
                                            {date}
                                            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs px-2 py-0.5 rounded-full">{grouped[date].length}</span>
                                        </span>
                                        {expandedDates[date] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    {expandedDates[date] && (
                                        <div className="px-5 pb-4 space-y-3">
                                            {grouped[date].map(a => {
                                                let equipList = [];
                                                try { equipList = JSON.parse(a.equipment_data || '[]'); } catch(e) {}
                                                const teamIds = a.team_id && a.team_id !== '0' ? String(a.team_id).split(',').map(Number) : [];

                                                return (
                                                    <div key={a.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">
                                                        <p className="font-bold text-gray-800 dark:text-gray-100 mb-1 flex items-start gap-1.5">
                                                            <MapPin className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
                                                            {a.object_address}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                                                            <HardHat className="w-3.5 h-3.5" />
                                                            {a.foreman_name || 'Неизвестный'}
                                                        </p>
                                                        {a.team_name && (
                                                            <p className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5 mb-1">
                                                                <Users className="w-3.5 h-3.5 text-indigo-400" />
                                                                {a.team_name}
                                                            </p>
                                                        )}
                                                        {equipList.length > 0 && (
                                                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
                                                                {equipList.map((eq, idx) => (
                                                                    <p key={idx} className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                                                        <Truck className="w-3.5 h-3.5" />
                                                                        {eq.name || `Техника #${eq.id}`}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                                                            <button
                                                                onClick={() => handleRestore(a.id)}
                                                                disabled={restoringId === a.id}
                                                                className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 transition-colors active:scale-95 disabled:opacity-50"
                                                            >
                                                                <RotateCcw className={`w-3.5 h-3.5 ${restoringId === a.id ? 'animate-spin' : ''}`} />
                                                                Восстановить
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
            {ConfirmUI}
        </div>
    );
}

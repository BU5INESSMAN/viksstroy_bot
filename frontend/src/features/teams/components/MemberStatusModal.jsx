import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserCheck, Palmtree, Thermometer } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
    { value: 'available', label: 'Доступен', icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700' },
    { value: 'vacation', label: 'Отпуск', icon: Palmtree, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700' },
    { value: 'sick', label: 'Больничный', icon: Thermometer, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' },
];

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function MemberStatusModal({ isOpen, onClose, member, tgId, onSaved }) {
    const [status, setStatus] = useState('available');
    const [dateFrom, setDateFrom] = useState('');
    const [dateUntil, setDateUntil] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (member) {
            setStatus(member.status || 'available');
            setDateFrom(member.status_from || '');
            setDateUntil(member.status_until || '');
            setReason(member.status_reason || '');
        }
    }, [member]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('status', status);
            fd.append('tg_id', tgId);
            if (status !== 'available') {
                fd.append('status_from', dateFrom);
                fd.append('status_until', dateUntil);
                fd.append('status_reason', reason);
            }
            await axios.post(`/api/teams/members/${member.id}/status`, fd);
            toast.success('Статус обновлен');
            onSaved?.();
            onClose();
        } catch {
            toast.error('Ошибка обновления статуса');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !member) return null;

    const motionProps = prefersReducedMotion ? {} : { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.95 } };
    const bgMotionProps = prefersReducedMotion ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

    return (
        <AnimatePresence>
            <motion.div
                {...bgMotionProps}
                className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
                onClick={onClose}
            >
                <motion.div
                    {...motionProps}
                    className="w-full max-w-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <div>
                            <h3 className="text-base font-bold text-gray-800 dark:text-white">Статус сотрудника</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{member.fio}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>

                    <div className="px-5 py-4 space-y-4">
                        {/* Status selection */}
                        <div className="flex gap-2">
                            {STATUS_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                const isSelected = status === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => setStatus(opt.value)}
                                        className={`flex-1 py-3 rounded-xl border text-sm font-bold flex flex-col items-center gap-1.5 transition-all active:scale-95 ${
                                            isSelected ? opt.bg + ' ' + opt.color : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Date range for vacation/sick */}
                        {status !== 'available' && (
                            <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wider">С какого числа</label>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={e => setDateFrom(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wider">По какое число</label>
                                    <input
                                        type="date"
                                        value={dateUntil}
                                        onChange={e => setDateUntil(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wider">Причина</label>
                                    <input
                                        type="text"
                                        value={reason}
                                        onChange={e => setReason(e.target.value)}
                                        placeholder="Необязательно"
                                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Save */}
                    <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                        <button
                            onClick={handleSave}
                            disabled={saving || (status !== 'available' && (!dateFrom || !dateUntil))}
                            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-md"
                        >
                            {saving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

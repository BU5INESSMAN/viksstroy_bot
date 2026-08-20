import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';

// v2.8: mirrors the brigade-member status control (MemberStatusModal) —
// same options, same UX — but posts to the driver status endpoint.
const STATUS_OPTIONS = [
    { value: 'available', label: 'Доступен', color: 'text-green-600' },
    { value: 'vacation', label: 'Отпуск', color: 'text-yellow-600' },
    { value: 'sick', label: 'Больничный', color: 'text-red-600' },
];

export default function DriverStatusModal({ driver, onClose, onSaved }) {
    const [status, setStatus] = useState(driver.member_status || 'available');
    const [statusFrom, setStatusFrom] = useState(driver.status_from || '');
    const [statusUntil, setStatusUntil] = useState(driver.status_until || '');
    const [saving, setSaving] = useState(false);

    const fio = driver.fio
        || `${driver.last_name || ''} ${driver.first_name || ''}`.trim()
        || 'Водитель';

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.post(`/api/drivers/${driver.user_id}/status`, {
                status,
                status_from: status !== 'available' ? (statusFrom || null) : null,
                status_until: status !== 'available' ? (statusUntil || null) : null,
            });
            toast.success('Статус обновлён');
            onSaved?.();
            onClose?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Статус: {fio}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        {STATUS_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setStatus(opt.value)}
                                className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-colors ${
                                    status === opt.value
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                        : 'border-gray-200 dark:border-gray-700'
                                } ${opt.color}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {status !== 'available' && (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500">С</label>
                                <input
                                    type="date"
                                    value={statusFrom}
                                    onChange={(e) => setStatusFrom(e.target.value)}
                                    className="w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-900 dark:border-gray-700"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">По</label>
                                <input
                                    type="date"
                                    value={statusUntil}
                                    onChange={(e) => setStatusUntil(e.target.value)}
                                    className="w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-900 dark:border-gray-700"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    <Check className="w-4 h-4" /> Сохранить
                </button>
            </motion.div>
        </motion.div>
    );
}

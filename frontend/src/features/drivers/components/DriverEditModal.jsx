import { useEffect, useMemo, useState } from 'react';
import { X, User, Star, Save, Trash2, RefreshCw } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { copyToClipboard } from '../../../utils/clipboard.js';

/**
 * DriverEditModal — single component used for both create and edit.
 * `mode` controls which actions are shown.
 *
 * Validation: last/first required, at least one category. The
 * default-equipment select is filtered to equipment whose category is
 * currently selected — if you clear all categories the default clears too.
 */
export default function DriverEditModal({
    mode, open, initial, categories, equipment, onClose, onSaved, onDeleted,
}) {
    const [lastName, setLastName] = useState('');
    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [selectedCats, setSelectedCats] = useState([]);
    const [defaultEqId, setDefaultEqId] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState('');

    useEffect(() => {
        if (!open) return;
        if (mode === 'edit' && initial) {
            setLastName(initial.last_name || '');
            setFirstName(initial.first_name || '');
            setMiddleName(initial.middle_name || '');
            setSelectedCats((initial.categories || []).map((c) => c.name));
            setDefaultEqId(initial.default_equipment_id ? String(initial.default_equipment_id) : '');
        } else {
            setLastName(''); setFirstName(''); setMiddleName('');
            setSelectedCats([]); setDefaultEqId('');
        }
    }, [open, mode, initial]);

    const eligibleEquipment = useMemo(() => {
        if (!equipment || selectedCats.length === 0) return [];
        return equipment.filter((e) => selectedCats.includes(e.category) && e.is_active !== 0);
    }, [equipment, selectedCats]);

    useEffect(() => {
        if (defaultEqId && !eligibleEquipment.some((e) => String(e.id) === String(defaultEqId))) {
            setDefaultEqId('');
        }
    }, [eligibleEquipment, defaultEqId]);

    if (!open) return null;

    const toggleCat = (name) => {
        setSelectedCats((prev) => prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]);
    };

    const validate = () => {
        if (!lastName.trim() || !firstName.trim()) {
            toast.error('Фамилия и имя обязательны');
            return false;
        }
        if (selectedCats.length === 0) {
            toast.error('Укажите хотя бы одну категорию техники');
            return false;
        }
        return true;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            const body = {
                last_name: lastName.trim(),
                first_name: firstName.trim(),
                middle_name: middleName.trim(),
                categories: selectedCats,
                default_equipment_id: defaultEqId ? Number(defaultEqId) : null,
            };
            const res = mode === 'edit' && initial
                ? await axios.patch(`/api/drivers/${initial.user_id}`, body)
                : await axios.post('/api/drivers', body);
            toast.success(mode === 'edit' ? 'Сохранено' : 'Водитель добавлен');
            onSaved && onSaved(res.data, mode);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!initial) return;
        if (!window.confirm(`Удалить водителя «${initial.fio || ''}»?`)) return;
        try {
            await axios.delete(`/api/drivers/${initial.user_id}`);
            toast.success('Удалён');
            onDeleted && onDeleted(initial.user_id);
        } catch (e) { toast.error('Ошибка удаления'); }
    };

    const handleRegenerate = async () => {
        if (!initial) return;
        try {
            const res = await axios.post(`/api/drivers/${initial.user_id}/regenerate-invite`);
            toast.success('Код перегенерирован');
            onSaved && onSaved({ ...initial, invite_code: res.data.invite_code }, mode);
        } catch (e) { toast.error('Ошибка'); }
    };

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[110] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[95vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5">
                    <X className="w-5 h-5" />
                </button>

                <h3 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2">
                    <User className="w-6 h-6 text-cyan-500" /> {mode === 'edit' ? 'Изменить водителя' : 'Новый водитель'}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Фамилия *</label>
                        <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:border-cyan-400" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Имя *</label>
                        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:border-cyan-400" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Отчество</label>
                        <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:border-cyan-400" />
                    </div>
                </div>

                <div className="mb-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Категории техники *</label>
                    <div className="flex flex-wrap gap-2">
                        {(categories || []).map((c) => {
                            const name = typeof c === 'string' ? c : c.name;
                            const selected = selectedCats.includes(name);
                            return (
                                <button type="button" key={name} onClick={() => toggleCat(name)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${selected
                                        ? 'bg-cyan-600 text-white border border-cyan-700 shadow-sm'
                                        : 'bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-cyan-300'}`}>
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mb-5">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        <Star className="w-3.5 h-3.5 text-amber-500" /> Техника по умолчанию (опционально)
                    </label>
                    <select value={defaultEqId} onChange={(e) => setDefaultEqId(e.target.value)}
                        disabled={selectedCats.length === 0}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:border-cyan-400 disabled:opacity-50">
                        <option value="">Не задана</option>
                        {eligibleEquipment.map((e) => (
                            <option key={e.id} value={e.id}>{e.name} {e.license_plate ? `[${e.license_plate}]` : ''} — {e.category}</option>
                        ))}
                    </select>
                    {selectedCats.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Сначала выберите категории.</p>
                    )}
                </div>

                {mode === 'edit' && initial?.invite_code && (
                    <div className="mb-5 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">Код приглашения</div>
                            <code className="text-sm font-bold text-gray-800 dark:text-gray-100 break-all">{initial.invite_code}</code>
                        </div>
                        <button type="button" onClick={() => { copyToClipboard(initial.invite_code, 'code', setCopied); toast.success('Скопировано'); }}
                            className="shrink-0 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold border border-blue-100 dark:border-blue-800/50 hover:bg-blue-100">
                            {copied === 'code' ? 'OK' : 'Копировать'}
                        </button>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> Сохранить
                    </button>
                    {mode === 'edit' && (
                        <>
                            <button onClick={handleRegenerate} className="px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm font-bold flex items-center justify-center gap-2 active:scale-95">
                                <RefreshCw className="w-4 h-4" /> Новый код
                            </button>
                            <button onClick={handleDelete} className="px-4 py-3 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-bold flex items-center justify-center gap-2 active:scale-95">
                                <Trash2 className="w-4 h-4" /> Удалить
                            </button>
                        </>
                    )}
                    <button onClick={onClose} className="px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm font-bold active:scale-95">Отмена</button>
                </div>
            </div>
        </div>
    );
}

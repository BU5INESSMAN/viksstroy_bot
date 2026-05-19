import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Star, X, Save, Trash2, User } from 'lucide-react';
import { displayFio } from '../../../utils/fioFormat';

/**
 * DefaultDriverModal — office-only picker for an equipment unit's
 * "drivers по умолчанию" (default driver) slot.
 *
 * The list comes from GET /api/equipment/{id}/eligible-drivers which by
 * default filters to drivers whose driver_categories includes this
 * equipment's category. Toggle "Показать всех" to broaden to every
 * driver in the system (for one-off cross-category assignments).
 *
 * Submit: PATCH /api/equipment/{id}/default-driver with
 * `{ user_id: <int | null> }`. Clearing the default sends null.
 */
export default function DefaultDriverModal({
    open, equipment, onClose, onSaved,
}) {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [includeAll, setIncludeAll] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [currentDefaultId, setCurrentDefaultId] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !equipment?.id) return;
        let cancelled = false;
        setLoading(true);
        axios
            .get(`/api/equipment/${equipment.id}/eligible-drivers`, {
                params: { include_all: includeAll },
            })
            .then((res) => {
                if (cancelled) return;
                const list = res.data?.drivers || [];
                setDrivers(list);
                const cur = res.data?.equipment?.current_default_user_id ?? null;
                setCurrentDefaultId(cur);
                // Default-select the current default driver so the user can
                // see what's set without scrolling.
                setSelectedId(cur);
            })
            .catch(() => {
                if (!cancelled) toast.error('Не удалось загрузить список водителей');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, equipment?.id, includeAll]);

    const showingClearedState = useMemo(
        () => selectedId === null && currentDefaultId === null,
        [selectedId, currentDefaultId],
    );

    if (!open) return null;

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await axios.patch(
                `/api/equipment/${equipment.id}/default-driver`,
                { user_id: selectedId },
            );
            const newId = res.data?.default_driver_user_id ?? null;
            // Resolve the new driver's display name from the loaded list so
            // the parent card can update without an extra round-trip.
            const newDriver = drivers.find((d) => d.user_id === newId) || null;
            onSaved && onSaved({
                user_id: newId,
                fio: newDriver ? (newDriver.fio || displayFio(newDriver)) : null,
            });
            toast.success(newId === null ? 'Водитель снят' : 'Сохранено');
            onClose();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => setSelectedId(null);

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 dark:border-gray-700 max-h-[95vh] flex flex-col">
                <div className="flex items-start justify-between p-6 pb-3 border-b border-gray-100 dark:border-gray-700">
                    <div>
                        <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                            <Star className="w-5 h-5 text-amber-500" />
                            Драйвер по умолчанию
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {equipment?.name}
                            {equipment?.category ? ` · ${equipment.category}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 pt-3 flex items-center gap-3">
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeAll}
                            onChange={(e) => setIncludeAll(e.target.checked)}
                            className="w-4 h-4 accent-cyan-600"
                        />
                        Показать всех водителей
                    </label>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-auto">
                        {drivers.length} {drivers.length === 1 ? 'водитель' : 'водителей'}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
                    {loading && (
                        <div className="py-10 text-center text-sm text-gray-400">Загрузка…</div>
                    )}
                    {!loading && drivers.length === 0 && (
                        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                            {includeAll
                                ? 'В системе пока нет водителей.'
                                : 'Нет водителей с этой категорией. Включите «Показать всех», чтобы выбрать любого.'}
                        </div>
                    )}
                    {drivers.map((d) => {
                        const isSel = selectedId === d.user_id;
                        return (
                            <button
                                key={d.user_id}
                                type="button"
                                onClick={() => setSelectedId(d.user_id)}
                                className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 active:scale-[0.99] ${isSel
                                    ? 'bg-cyan-50 dark:bg-cyan-900/30 border-cyan-300 dark:border-cyan-700 shadow-sm'
                                    : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-700'}`}
                            >
                                <div className="w-9 h-9 rounded-full bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center shrink-0">
                                    <User className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate flex items-center gap-2">
                                        {displayFio(d)}
                                        {d.is_default && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                                                <Star className="w-3 h-3" /> текущий
                                            </span>
                                        )}
                                        {d.is_synthetic && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                не привязан
                                            </span>
                                        )}
                                    </div>
                                    {d.last_used_at && (
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                            Назначений: {d.usage_count || 0}
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
                    {currentDefaultId !== null && (
                        <button
                            onClick={handleClear}
                            disabled={saving}
                            className="px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                            title="Снять водителя — техника останется без водителя по умолчанию"
                        >
                            <Trash2 className="w-4 h-4" /> Снять
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving || (selectedId === currentDefaultId && !showingClearedState)}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        {selectedId === null ? 'Сохранить (без водителя)' : 'Сохранить'}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm font-bold active:scale-95"
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
}

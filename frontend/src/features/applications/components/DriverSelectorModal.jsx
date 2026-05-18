import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Star, Clock, ChevronDown, User, Trash2 } from 'lucide-react';
import { EQUIPMENT_ICONS, getIconComponent, DEFAULT_EQUIPMENT_ICON } from '../../../utils/iconConfig';
import { displayFio } from '../../../utils/fioFormat';

/**
 * DriverSelectorModal — pick a driver for a specific equipment unit inside
 * an application. Backend returns:
 *   - primary: drivers whose categories include the equipment's category,
 *     pre-sorted by default-first → recent-use → usage-count → alpha.
 *   - other_grouped: drivers from OTHER categories, grouped by category.
 *
 * Props:
 *   open, onClose
 *   equipmentId, equipmentName
 *   currentDriverId (number | null) — for edit-mode pre-highlight
 *   onSelect(driver) — driver = { user_id, fio, ... }
 *   onClear() — fired when "Снять водителя" is tapped
 */
export default function DriverSelectorModal({
    open, onClose, equipmentId, equipmentName, currentDriverId, onSelect, onClear,
}) {
    const [data, setData] = useState({ primary: [], other_grouped: [], equipment: null });
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [showOther, setShowOther] = useState(false);

    useEffect(() => {
        if (!open || !equipmentId) return;
        setLoading(true);
        setShowOther(false);
        setSearch('');
        axios.get(`/api/drivers/for-equipment/${equipmentId}`)
            .then((res) => setData(res.data || { primary: [], other_grouped: [], equipment: null }))
            .catch(() => setData({ primary: [], other_grouped: [], equipment: null }))
            .finally(() => setLoading(false));
    }, [open, equipmentId]);

    const norm = (s) => (s || '').toString().toLowerCase();
    const matchesSearch = (d) => {
        if (!search) return true;
        const q = norm(search);
        return norm(displayFio(d)).includes(q);
    };

    const primaryFiltered = useMemo(
        () => (data.primary || []).filter(matchesSearch),
        [data, search],
    );
    const otherFiltered = useMemo(() => {
        if (!search) return data.other_grouped || [];
        return (data.other_grouped || [])
            .map((grp) => ({ ...grp, drivers: (grp.drivers || []).filter(matchesSearch) }))
            .filter((grp) => grp.drivers.length > 0);
    }, [data, search]);

    if (!open) return null;

    const CategoryIcon = data.equipment
        ? (getIconComponent(data.equipment.category_icon, EQUIPMENT_ICONS) || getIconComponent(DEFAULT_EQUIPMENT_ICON, EQUIPMENT_ICONS))
        : null;

    const renderDriverRow = (d, isPrimary) => {
        const selected = currentDriverId && Number(currentDriverId) === Number(d.user_id);
        const usage = Number(d.usage_count || 0);
        const lastUsed = d.last_used_at ? new Date(d.last_used_at) : null;
        const lastUsedLabel = lastUsed && !Number.isNaN(lastUsed.getTime()) ? lastUsed.toLocaleDateString('ru-RU') : null;

        return (
            <motion.button
                type="button"
                key={d.user_id}
                onClick={() => onSelect && onSelect(d)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.99]
                    ${selected
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700 ring-1 ring-cyan-400'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-sm'}`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${selected ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-500'}`}>
                        <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{displayFio(d)}</span>
                            {d.is_default && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50">
                                    <Star className="w-3 h-3" /> по умолчанию
                                </span>
                            )}
                        </div>
                        {(usage > 0 || lastUsedLabel) && (
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                {usage > 0 && <span className="font-medium">{usage}× назначений</span>}
                                {lastUsedLabel && (
                                    <span className="inline-flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {lastUsedLabel}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </motion.button>
        );
    };

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[140] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl w-full max-w-xl shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col">
                <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5 z-10">
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="mb-4">
                    <h3 className="text-xl font-bold mb-1 dark:text-white flex items-center gap-2">
                        <User className="w-5 h-5 text-cyan-500" /> Назначение водителя
                    </h3>
                    {data.equipment && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            {CategoryIcon && <CategoryIcon className="w-4 h-4 text-indigo-500" />}
                            <span className="font-bold text-gray-800 dark:text-gray-100">{data.equipment.name || equipmentName}</span>
                            {data.equipment.category && (
                                <span className="text-xs text-gray-500">· {data.equipment.category}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Search */}
                <div className="mb-3 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по ФИО"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-cyan-400"
                    />
                </div>

                {/* Scroll area */}
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <>
                            <div>
                                <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                    {data.equipment?.category
                                        ? <>Водители категории «{data.equipment.category}»</>
                                        : 'Подходящие водители'}
                                </div>
                                {primaryFiltered.length > 0 ? (
                                    <motion.div className="space-y-2" initial="hidden" animate="visible"
                                        variants={{ visible: { transition: { staggerChildren: 0.03 } }, hidden: {} }}>
                                        <AnimatePresence>
                                            {primaryFiltered.map((d) => renderDriverRow(d, true))}
                                        </AnimatePresence>
                                    </motion.div>
                                ) : (
                                    <div className="text-center py-6 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Нет водителей для этой категории.</p>
                                    </div>
                                )}
                            </div>

                            {(otherFiltered.length > 0) && (
                                <div>
                                    <button type="button" onClick={() => setShowOther((v) => !v)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900/60">
                                        <span>Другой водитель</span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${showOther ? 'rotate-180' : ''}`} />
                                    </button>
                                    <AnimatePresence>
                                        {showOther && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.18 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-3 space-y-4">
                                                    {otherFiltered.map((grp) => {
                                                        const Icon = getIconComponent(grp.category_icon, EQUIPMENT_ICONS)
                                                            || getIconComponent(DEFAULT_EQUIPMENT_ICON, EQUIPMENT_ICONS);
                                                        return (
                                                            <div key={grp.category}>
                                                                <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                                                                    {Icon && <Icon className="w-3.5 h-3.5 text-indigo-500" />}
                                                                    {grp.category}
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {grp.drivers.map((d) => renderDriverRow(d, false))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    {currentDriverId && (
                        <button type="button" onClick={() => { onClear && onClear(); }}
                            className="px-4 py-3 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 active:scale-95">
                            <Trash2 className="w-4 h-4" /> Снять
                        </button>
                    )}
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm font-bold active:scale-95">
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
}

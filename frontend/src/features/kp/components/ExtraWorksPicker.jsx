import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, Check, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ease = [0.23, 1, 0.32, 1];
const expandTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease };

/**
 * Collapsible category-based picker for extra works. Data source is the
 * global KP catalog (/api/kp/catalog); selected items each carry a
 * volume. Matches the visual language of ObjectCreateModal's plan picker.
 *
 * Props:
 *   catalog:    array of { id, name, unit, category } from /api/kp/catalog
 *   selected:   array of { kp_id, volume, name, unit } — current picks
 *   onChange:   setter that replaces the selected array
 *   disabled:   whole picker read-only (view/approved mode)
 *   defaultOpen: boolean — expand section on mount
 */
export default function ExtraWorksPicker({
    catalog = [],
    selected = [],
    onChange,
    disabled = false,
    defaultOpen = false,
}) {
    const [open, setOpen] = useState(defaultOpen || selected.length > 0);
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [expandedCats, setExpandedCats] = useState({});
    const searchTimer = useRef(null);

    // Debounce search
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
        return () => searchTimer.current && clearTimeout(searchTimer.current);
    }, [search]);

    // Group by category + filter by search
    const grouped = useMemo(() => {
        const q = debounced;
        const out = {};
        for (const item of catalog) {
            if (!item?.name) continue;
            if (q) {
                const hay = `${item.name} ${item.category || ''}`.toLowerCase();
                if (!hay.includes(q)) continue;
            }
            const cat = item.category || 'Без категории';
            if (!out[cat]) out[cat] = [];
            out[cat].push(item);
        }
        return out;
    }, [catalog, debounced]);

    const categoryNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ru'));

    // Auto-expand categories that match the active search
    useEffect(() => {
        if (!debounced) return;
        const next = { ...expandedCats };
        for (const c of categoryNames) next[c] = true;
        setExpandedCats(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debounced]);

    const selectedMap = useMemo(() => {
        const m = {};
        for (const s of selected) if (s?.kp_id) m[s.kp_id] = s;
        return m;
    }, [selected]);

    const toggle = (item) => {
        if (disabled) return;
        const existing = selectedMap[item.id];
        if (existing) {
            onChange(selected.filter(s => s.kp_id !== item.id));
        } else {
            onChange([...selected, {
                kp_id: item.id,
                name: item.name,
                unit: item.unit || '',
                volume: '',
            }]);
        }
    };

    const updateVolume = (kp_id, value) => {
        if (disabled) return;
        onChange(selected.map(s => s.kp_id === kp_id ? { ...s, volume: value } : s));
    };

    const remove = (kp_id) => {
        if (disabled) return;
        onChange(selected.filter(s => s.kp_id !== kp_id));
    };

    const totalCount = categoryNames.reduce((n, c) => n + grouped[c].length, 0);

    return (
        <div className="border border-amber-200 dark:border-amber-700/50 rounded-2xl overflow-hidden bg-yellow-50/40 dark:bg-yellow-900/10">
            {/* Section header */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
            >
                <span className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    <Plus className="w-4 h-4" />
                    Доп. работы
                    {selected.length > 0 && (
                        <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full normal-case">
                            {selected.length}
                        </span>
                    )}
                </span>
                <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={expandTransition}
                    className="text-amber-500"
                >
                    <ChevronDown className="w-4 h-4" />
                </motion.span>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
                        transition={expandTransition}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="px-4 pb-4 pt-1 space-y-3">
                            {/* Selected items — pinned above the picker */}
                            {selected.length > 0 && (
                                <div className="space-y-1.5 pb-2 border-b border-amber-100 dark:border-amber-900/30">
                                    {selected.map(s => (
                                        <div
                                            key={s.kp_id}
                                            className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800/40"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate leading-tight">
                                                    {s.name}
                                                </p>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                disabled={disabled}
                                                value={s.volume}
                                                onChange={e => updateVolume(s.kp_id, e.target.value)}
                                                placeholder="0"
                                                className="w-20 p-1.5 text-center text-sm font-bold border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                            />
                                            <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                {s.unit || ''}
                                            </span>
                                            {!disabled && (
                                                <button
                                                    type="button"
                                                    onClick={() => remove(s.kp_id)}
                                                    className="text-gray-300 hover:text-red-500 transition-colors p-1 active:scale-90"
                                                    title="Удалить"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!disabled && (
                                <>
                                    {/* Search */}
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder="Поиск работы…"
                                            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 dark:text-white text-sm"
                                        />
                                    </div>

                                    {/* Categories */}
                                    <div className="rounded-xl border border-gray-100 dark:border-gray-700 max-h-[40vh] overflow-y-auto scrollbar-thin bg-white dark:bg-gray-800">
                                        {categoryNames.length === 0 ? (
                                            <p className="text-center text-sm text-gray-400 italic py-8">
                                                {catalog.length === 0 ? 'Справочник не загружен' : 'Ничего не найдено'}
                                            </p>
                                        ) : (
                                            categoryNames.map(cat => {
                                                const items = grouped[cat];
                                                const isOpen = !!expandedCats[cat];
                                                return (
                                                    <div key={cat} className="border-b border-gray-50 dark:border-gray-700/60 last:border-b-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                                                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                                                        >
                                                            <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                                <motion.span
                                                                    animate={{ rotate: isOpen ? 0 : -90 }}
                                                                    transition={expandTransition}
                                                                    className="inline-flex text-gray-400"
                                                                >
                                                                    <ChevronDown className="w-3.5 h-3.5" />
                                                                </motion.span>
                                                                {cat}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                                                {items.length}
                                                            </span>
                                                        </button>
                                                        <AnimatePresence initial={false}>
                                                            {isOpen && (
                                                                <motion.div
                                                                    key="items"
                                                                    initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                    exit={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
                                                                    transition={expandTransition}
                                                                    style={{ overflow: 'hidden' }}
                                                                >
                                                                    <div className="divide-y divide-gray-50 dark:divide-gray-700/60 bg-gray-50/50 dark:bg-gray-900/20">
                                                                        {items.map(item => {
                                                                            const isSelected = !!selectedMap[item.id];
                                                                            return (
                                                                                <div
                                                                                    key={item.id}
                                                                                    onClick={() => toggle(item)}
                                                                                    className={`px-3 py-2 flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/40 ${isSelected ? 'bg-amber-50/70 dark:bg-amber-900/15' : ''}`}
                                                                                >
                                                                                    <span className={`flex-shrink-0 w-[18px] h-[18px] rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
                                                                                        {isSelected && <Check className="w-3 h-3" />}
                                                                                    </span>
                                                                                    <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 truncate">
                                                                                        {item.name}
                                                                                    </span>
                                                                                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                                                        {item.unit || ''}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                );
                                            })
                                        )}
                                        {debounced && totalCount > 0 && (
                                            <p className="text-center text-[10px] text-gray-400 py-1.5 border-t border-gray-100 dark:border-gray-700">
                                                Найдено: {totalCount}
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

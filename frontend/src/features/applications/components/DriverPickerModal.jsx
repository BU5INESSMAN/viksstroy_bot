import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Star, Clock, ChevronDown, User, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { EQUIPMENT_ICONS, getIconComponent, DEFAULT_EQUIPMENT_ICON } from '../../../utils/iconConfig';
import { displayFio } from '../../../utils/fioFormat';

/**
 * DriverPickerModal — pick a driver for one equipment unit inside an
 * application.
 *
 * v2.6 commit 4 rewrite. Three locked-in behaviours:
 *
 *   1. **No auto-fill.** Even when this equipment has
 *      `default_driver_user_id`, the slot starts EMPTY (the parent
 *      manages that state via useAppForm). The default driver appears
 *      first in the picker with a ⭐ "по умолчанию" badge but requires
 *      an explicit click to assign. No magic.
 *
 *   2. **Hard-block conflicts.** Drivers with overlapping time slots
 *      on the same date (on DIFFERENT equipment — same-machine swap is
 *      always fine) are visually marked ⚠ ЗАНЯТ with subtitle naming
 *      the conflicting equipment and time range. The whole row button
 *      is disabled (`pointer-events-none`, muted color, tooltip).
 *      Backend has the same check as defense-in-depth (commit 3).
 *
 *   3. **"+ Новый водитель" inline form: ФИО + multi-select
 *      categories only.** No "make default" checkbox (decision 1 —
 *      defaults are office-owned now, set from the Equipment page),
 *      no phone, no other fields. Current equipment's category is
 *      pre-checked.
 *
 * Backend `/api/drivers/by-equipment/{id}` returns primary[] (sorted
 * default → recency → usage → alphabetical) and other_grouped[]
 * (every other category). `/api/drivers/availability?date=` returns a
 * busy_slots map per driver for the application's date.
 */
export default function DriverPickerModal({
    open, onClose,
    equipmentId, equipmentName,
    currentDriverId,
    // v2.6 commit 4: availability context for conflict hard-block.
    applicationDate,
    applicationStartTime,
    applicationEndTime,
    currentApplicationId,
    // v2.6.1: when true, busy drivers are rendered with an amber
    // warning instead of red disabled state; assignment is allowed.
    // The backend records an audit row via force_assign on save.
    // Foreman pickers leave this false → original hard-block behavior.
    softConflicts = false,
    onSelect, onClear,
}) {
    const [data, setData] = useState({ primary: [], other_grouped: [], equipment: null });
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [showOther, setShowOther] = useState(false);
    const [busyByUserId, setBusyByUserId] = useState({});

    // v2.6 commit 4: inline new-driver form. Categories is now a Set of
    // category names. Defaults to the current equipment's category once
    // it's known.
    const [newOpen, setNewOpen] = useState(false);
    const [newLast, setNewLast] = useState('');
    const [newFirst, setNewFirst] = useState('');
    const [newMiddle, setNewMiddle] = useState('');
    const [newCats, setNewCats] = useState(new Set());
    const [creating, setCreating] = useState(false);

    // Single ФИО text input — backend parses last/first/middle.
    const [newFio, setNewFio] = useState('');

    const fetchAll = async () => {
        if (!equipmentId) return;
        setLoading(true);
        try {
            // Always need the driver list. Availability is optional —
            // if no date is supplied (e.g. legacy caller without
            // applicationDate), skip conflict marking entirely.
            const calls = [axios.get(`/api/drivers/by-equipment/${equipmentId}`)];
            if (applicationDate) {
                calls.push(axios.get('/api/drivers/availability', { params: { date: applicationDate } }));
            }
            const results = await Promise.all(calls);
            const driverPayload = results[0]?.data || { primary: [], other_grouped: [], equipment: null };
            setData(driverPayload);

            const availPayload = results[1]?.data || [];
            // Map user_id → first overlapping slot (the picker only
            // needs ONE conflicting slot to render the badge / tooltip).
            const startNum = _hourToMinutes(applicationStartTime);
            const endNum = _hourToMinutes(applicationEndTime);
            const busy = {};
            (Array.isArray(availPayload) ? availPayload : []).forEach((drv) => {
                (drv.busy_slots || []).forEach((slot) => {
                    // Skip the slot if it belongs to the application we're
                    // currently editing — that's the driver's own row and
                    // shouldn't count as a conflict.
                    if (currentApplicationId && Number(slot.application_id) === Number(currentApplicationId)) {
                        return;
                    }
                    const slotStart = _hourToMinutes(slot.time_start);
                    const slotEnd = _hourToMinutes(slot.time_end);
                    // Half-open overlap (matches backend validator):
                    // [a,b) intersects [c,d) iff a<d and c<b.
                    if (startNum != null && endNum != null && slotStart != null && slotEnd != null) {
                        if (startNum < slotEnd && slotStart < endNum) {
                            // Keep the first detected conflict per driver
                            // — that's all the FE needs to show.
                            if (!busy[drv.user_id]) {
                                busy[drv.user_id] = slot;
                            }
                        }
                    }
                });
            });
            setBusyByUserId(busy);
        } catch (e) {
            setData({ primary: [], other_grouped: [], equipment: null });
            setBusyByUserId({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        setSearch('');
        setShowOther(false);
        setNewOpen(false);
        setNewLast(''); setNewFirst(''); setNewMiddle(''); setNewFio('');
        // Pre-tick the current equipment's category once the equipment
        // metadata lands (see effect below).
        setNewCats(new Set());
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, equipmentId, applicationDate, applicationStartTime, applicationEndTime, currentApplicationId]);

    // Pre-check the current equipment's category in the new-driver form
    // once we know what it is.
    useEffect(() => {
        const cat = data.equipment?.category;
        if (!cat) return;
        setNewCats((prev) => {
            if (prev.has(cat)) return prev;
            const next = new Set(prev);
            next.add(cat);
            return next;
        });
    }, [data.equipment]);

    // Build the full category list for the new-driver multi-select from
    // the data the picker already has: the current equipment's category
    // + every category in `other_grouped`. No extra API round-trip.
    const allCategories = useMemo(() => {
        const set = new Set();
        if (data.equipment?.category) set.add(data.equipment.category);
        (data.other_grouped || []).forEach((g) => { if (g.category) set.add(g.category); });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
    }, [data.equipment, data.other_grouped]);

    const matchesSearch = (d) => {
        if (!search) return true;
        return displayFio(d).toLowerCase().includes(search.toLowerCase());
    };

    const primaryFiltered = useMemo(
        () => (data.primary || []).filter(matchesSearch),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data, search],
    );
    const defaultRow = primaryFiltered.find((d) => d.is_default);
    const primaryRest = primaryFiltered.filter((d) => !d.is_default);

    const otherFiltered = useMemo(() => {
        if (!search) return data.other_grouped || [];
        return (data.other_grouped || [])
            .map((g) => ({ ...g, drivers: (g.drivers || []).filter(matchesSearch) }))
            .filter((g) => g.drivers.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, search]);

    if (!open) return null;

    const CategoryIcon = data.equipment
        ? (getIconComponent(data.equipment.category_icon, EQUIPMENT_ICONS) || getIconComponent(DEFAULT_EQUIPMENT_ICON, EQUIPMENT_ICONS))
        : null;

    const driverRow = (d) => {
        const selected = currentDriverId && Number(currentDriverId) === Number(d.user_id);
        const conflict = busyByUserId[d.user_id] || null;
        const isBusy = !!conflict;
        // v2.6.1: moderator+ on review-edit gets soft conflicts —
        // the row stays clickable, but the badge turns amber and a
        // tooltip warns of the override. Foreman pickers keep the
        // original hard-block (button disabled, red badge).
        const blockClick = isBusy && !softConflicts;
        const usage = Number(d.usage_count || 0);
        const lastUsed = d.last_used_at ? new Date(d.last_used_at) : null;
        const lastUsedLabel = lastUsed && !Number.isNaN(lastUsed.getTime())
            ? lastUsed.toLocaleDateString('ru-RU') : null;

        const conflictTitle = conflict
            ? (softConflicts
                ? `Возможен конфликт — назначить можно, но проверьте расписание. Занят: «${conflict.equipment_name}» ${conflict.time_start}–${conflict.time_end}`
                : `Занят: «${conflict.equipment_name}» ${conflict.time_start}–${conflict.time_end}`)
            : undefined;

        // Two visual treatments for "busy":
        //   blocked (foreman)  — row muted gray, button disabled, red badge.
        //   warning (moderator) — row normal opacity, button enabled, amber badge.
        const busyClasses = blockClick
            ? 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
            : 'bg-amber-50/40 dark:bg-amber-900/10 border-amber-300 dark:border-amber-800/60 ring-1 ring-amber-200 dark:ring-amber-800/40 hover:border-amber-400 hover:shadow-sm active:scale-[0.99]';

        return (
            <motion.button
                type="button" key={d.user_id}
                onClick={blockClick ? undefined : () => onSelect && onSelect(d)}
                disabled={blockClick}
                title={conflictTitle}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all
                    ${isBusy
                        ? busyClasses
                        : (selected
                            ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700 ring-1 ring-cyan-400 active:scale-[0.99]'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-sm active:scale-[0.99]')}`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${blockClick ? 'bg-gray-100 dark:bg-gray-800 text-gray-400' : (isBusy ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : (selected ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-500'))}`}>
                        <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-bold truncate ${blockClick ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>
                                {displayFio(d)}
                            </span>
                            {d.is_default && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50">
                                    <Star className="w-3 h-3" /> по умолчанию
                                </span>
                            )}
                            {isBusy && (
                                blockClick ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50">
                                        <AlertTriangle className="w-3 h-3" /> ЗАНЯТ
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                                        <AlertTriangle className="w-3 h-3" /> Занят (можно назначить)
                                    </span>
                                )
                            )}
                        </div>
                        {isBusy ? (
                            <div className={`mt-0.5 text-[11px] truncate ${blockClick ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                                Уже на технике «{conflict.equipment_name}» {conflict.time_start}–{conflict.time_end}
                            </div>
                        ) : (
                            (usage > 0 || lastUsedLabel) && (
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                    {usage > 0 && <span className="font-medium">{usage}× назначений</span>}
                                    {lastUsedLabel && (
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {lastUsedLabel}
                                        </span>
                                    )}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </motion.button>
        );
    };

    const toggleNewCat = (cat) => {
        setNewCats((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
        });
    };

    const handleCreateInline = async () => {
        const fio = (newFio || '').trim();
        if (!fio) {
            toast.error('Введите ФИО');
            return;
        }
        if (newCats.size === 0) {
            toast.error('Выберите хотя бы одну категорию');
            return;
        }
        // Naive parse — backend will also re-split. Keep it consistent so
        // the picker doesn't display "#-N" while the backend writes the
        // real ФИО.
        const parts = fio.split(/\s+/);
        const last = parts[0] || '';
        const first = parts[1] || '';
        const middle = parts.slice(2).join(' ');
        if (!last || !first) {
            toast.error('Введите хотя бы Фамилию и Имя');
            return;
        }
        setCreating(true);
        try {
            const body = {
                last_name: last,
                first_name: first,
                middle_name: middle,
                categories: Array.from(newCats),
                // v2.6: NO default_equipment_id field — defaults are
                // office-owned, set on the Equipment page.
            };
            const res = await axios.post('/api/drivers', body);
            const newDriver = res.data;
            if (newDriver?.invite_code) {
                toast.success(`Водитель создан. Код: ${newDriver.invite_code}`, { duration: 6000 });
            } else {
                toast.success('Водитель создан');
            }
            onSelect && onSelect(newDriver);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Ошибка создания водителя');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[140] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl w-full max-w-xl shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col">
                <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5 z-10">
                    <X className="w-5 h-5" />
                </button>

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

                <div className="mb-3 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по ФИО"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-cyan-400" />
                </div>

                <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <>
                            {defaultRow && (
                                <div>
                                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                                        <Star className="w-3.5 h-3.5" /> По умолчанию
                                    </div>
                                    {driverRow(defaultRow)}
                                </div>
                            )}

                            <div>
                                <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                    {data.equipment?.category
                                        ? <>Водители категории «{data.equipment.category}»</>
                                        : 'Подходящие водители'}
                                </div>
                                {primaryRest.length > 0 ? (
                                    <motion.div className="space-y-2"
                                        initial="hidden" animate="visible"
                                        variants={{ visible: { transition: { staggerChildren: 0.03 } }, hidden: {} }}>
                                        <AnimatePresence>
                                            {primaryRest.map(driverRow)}
                                        </AnimatePresence>
                                    </motion.div>
                                ) : (!defaultRow ? (
                                    <div className="text-center py-6 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Нет водителей этой категории.</p>
                                    </div>
                                ) : null)}
                            </div>

                            {otherFiltered.length > 0 && (
                                <div>
                                    <button type="button" onClick={() => setShowOther((v) => !v)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900/60">
                                        <span>Показать всех водителей</span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${showOther ? 'rotate-180' : ''}`} />
                                    </button>
                                    <AnimatePresence>
                                        {showOther && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.18 }}
                                                className="overflow-hidden">
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
                                                                    {grp.drivers.map(driverRow)}
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

                            {/* Inline new-driver form: ФИО + multi-select categories only. */}
                            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                {!newOpen ? (
                                    <button type="button" onClick={() => setNewOpen(true)}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:border-cyan-300 hover:text-cyan-600 transition-colors">
                                        <Plus className="w-4 h-4" /> Новый водитель
                                    </button>
                                ) : (
                                    <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 space-y-3">
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">ФИО *</label>
                                            <input value={newFio} onChange={(e) => setNewFio(e.target.value)}
                                                placeholder="Иванов Иван Иванович"
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:border-cyan-400" />
                                            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                                                Фамилия Имя Отчество — через пробел.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                                                Категории техники *
                                            </label>
                                            <div className="flex flex-wrap gap-1.5">
                                                {allCategories.length === 0 && (
                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                                                        Категории недоступны — попробуйте перезагрузить страницу.
                                                    </span>
                                                )}
                                                {allCategories.map((cat) => {
                                                    const checked = newCats.has(cat);
                                                    return (
                                                        <button type="button" key={cat}
                                                            onClick={() => toggleNewCat(cat)}
                                                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all active:scale-95 ${checked
                                                                ? 'bg-cyan-600 text-white border-cyan-700 shadow-sm'
                                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-cyan-300'}`}>
                                                            {cat}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={handleCreateInline} disabled={creating}
                                                className="flex-1 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold disabled:opacity-60 active:scale-95">
                                                {creating ? '...' : 'Создать и назначить'}
                                            </button>
                                            <button type="button" onClick={() => setNewOpen(false)}
                                                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-bold active:scale-95">
                                                Отмена
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    {currentDriverId && (
                        <button type="button" onClick={() => onClear && onClear()}
                            className="px-4 py-3 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 active:scale-95">
                            <Trash2 className="w-4 h-4" /> Снять
                        </button>
                    )}
                    <button type="button" onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm font-bold active:scale-95">
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
}


// ── helpers ──────────────────────────────────────────────────────────

function _hourToMinutes(t) {
    if (t == null) return null;
    if (typeof t === 'number') return t * 60;
    const s = String(t).trim();
    if (!s) return null;
    if (s.includes(':')) {
        const [h, m] = s.split(':');
        const hh = parseInt(h, 10);
        const mm = parseInt(m, 10);
        if (Number.isNaN(hh)) return null;
        return hh * 60 + (Number.isNaN(mm) ? 0 : mm);
    }
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n * 60;
}

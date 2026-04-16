import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, Clock, CheckCircle, HardHat, Flag,
    X, User, ChevronLeft, ChevronRight, Image, Crown
} from 'lucide-react';
import { getStatusBadge } from '../../../utils/statusConfig';
import { motion } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── Photo Slider ─── */
function PhotoSlider({ photos }) {
    const [idx, setIdx] = useState(0);
    if (!photos || photos.length === 0) return null;

    const prev = () => setIdx(i => (i - 1 + photos.length) % photos.length);
    const next = () => setIdx(i => (i + 1) % photos.length);

    return (
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-700/30">
            <div className="flex items-center gap-1.5 px-5 pt-4 pb-2">
                <Image className="w-4 h-4 text-blue-500" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Фото ({idx + 1}/{photos.length})
                </span>
            </div>
            <div className="relative group">
                <div className="aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <img
                        src={photos[idx]}
                        alt={`Фото ${idx + 1}`}
                        className="w-full h-full object-contain transition-opacity duration-300"
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                </div>
                {photos.length > 1 && (
                    <>
                        <button
                            onClick={prev}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-600 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 hover:bg-white dark:hover:bg-gray-700"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
                        </button>
                        <button
                            onClick={next}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-600 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 hover:bg-white dark:hover:bg-gray-700"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-200" />
                        </button>
                    </>
                )}
            </div>
            {photos.length > 1 && (
                <div className="flex justify-center gap-1.5 py-3">
                    {photos.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIdx(i)}
                            className={`rounded-full transition-all duration-200 ${
                                i === idx
                                    ? 'w-6 h-2 bg-blue-500'
                                    : 'w-2 h-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Helpers ─── */
function buildObjectDisplay(objName, objAddress) {
    const name = objName?.trim() || null;
    const addr = objAddress?.trim() || null;

    if (name && addr && name !== addr) return `${name} (${addr})`;
    if (name) return name;
    if (addr) return addr;
    return 'Объект не указан';
}

function formatTime(start, end) {
    const s = start ?? '08';
    const e = end ?? '17';
    return `${String(s).padStart(2, '0')}:00 – ${String(e).padStart(2, '0')}:00`;
}

function isForeman(member) {
    if (member.is_foreman) return true;
    const pos = (member.position || '').toLowerCase();
    return pos.includes('бригадир') || pos.includes('прораб');
}

/* ─── InfoCell ─── */
function InfoCell({ label, icon: Icon, iconColor, children }) {
    return (
        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{label}</span>
            <div className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm leading-snug">
                {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />}
                <span className="min-w-0 break-words">{children}</span>
            </div>
        </div>
    );
}

/* ─── Main Modal ─── */
export default function ViewAppModal({ app, onClose, onEdit, data, onUpdate }) {
    const [selectedStatus, setSelectedStatus] = useState('');
    const [changingStatus, setChangingStatus] = useState(false);
    const role = localStorage.getItem('user_role') || '';
    const tgId = localStorage.getItem('tg_id') || '0';
    const canManageStatus = role === 'superadmin' || role === 'admin';

    if (!app) return null;

    const statusIcons = { waiting: Clock, approved: CheckCircle, published: HardHat, in_progress: HardHat, completed: Flag };
    const st = getStatusBadge(app.status);
    const StIcon = statusIcons[app.status] || Clock;

    // ── Object display: "Name (Address)" ──
    const objectDisplay = buildObjectDisplay(app.obj_name, app.object_address);

    // ── Equipment ──
    let eqList = [];
    if (app.equipment_data) {
        try {
            eqList = typeof app.equipment_data === 'string' ? JSON.parse(app.equipment_data) : app.equipment_data;
        } catch (_) {}
    }

    // ── Workers: prefer enriched members_data, fall back to selected_members IDs ──
    let workersList = [];
    if (app.members_data && app.members_data.length > 0) {
        workersList = app.members_data.map(m => ({
            id: m.id,
            fio: m.fio || `Сотрудник #${m.id}`,
            team_id: m.team_id,
            team_name: m.team_name || null,
            position: m.position || '',
            is_foreman: m.is_foreman || false,
            tg_user_id: m.tg_user_id,
        }));
    } else {
        const rawIds = app.selected_members || app.workers || '';
        const ids = rawIds ? String(rawIds).split(',').map(Number).filter(Boolean) : [];
        const allMembers = data?.teams?.flatMap(t =>
            (t.members || []).map(m => ({ ...m, team_name: t.name, team_id: t.id }))
        ) || [];
        workersList = ids.map(id => {
            const found = allMembers.find(m => m.id === id);
            return found
                ? { id, fio: found.fio, team_id: found.team_id, team_name: found.team_name, position: found.position || '', is_foreman: found.is_foreman || false, tg_user_id: found.tg_user_id }
                : { id, fio: `Сотрудник #${id}`, team_id: null, team_name: null, position: '', is_foreman: false, tg_user_id: null };
        });
    }

    // ── Group workers by team ──
    const teamGroups = {};
    for (const w of workersList) {
        const key = w.team_id ?? 0;
        if (!teamGroups[key]) {
            teamGroups[key] = { name: w.team_name || 'Без бригады', members: [] };
        }
        teamGroups[key].members.push(w);
    }
    // Sort: foremen first inside each group
    for (const g of Object.values(teamGroups)) {
        g.members.sort((a, b) => (isForeman(b) ? 1 : 0) - (isForeman(a) ? 1 : 0));
    }

    const totalWorkers = workersList.length;

    // ── Photos: collect from equipment photo_url or app.photos ──
    const photos = [
        ...(app.photos || []),
        ...eqList.map(e => e.photo_url).filter(Boolean),
    ];

    return (
        <motion.div
            className="!fixed !inset-0 !top-0 !left-0 !w-full !h-[100dvh] z-[99990] bg-black/50 m-0 p-0 overflow-y-auto flex items-start sm:items-center justify-center pt-8 sm:pt-4"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div
                className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl relative overflow-hidden"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="flex justify-between items-start px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
                    <div className="space-y-2.5">
                        <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                            <ClipboardList className="w-5 h-5 text-blue-500" />
                            Просмотр наряда
                            <span className="text-gray-400 font-normal text-base">#{app.id}</span>
                        </h2>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider ${st.color}`}>
                            <StIcon className="w-3.5 h-3.5" />
                            {st.label}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700 transition-colors active:scale-95 shadow-sm flex-shrink-0 ml-4 mt-0.5"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

                    {/* Info grid: Date, Foreman, Object (combined) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <InfoCell label="Дата работ" icon={Calendar} iconColor="text-blue-500">
                            {app.date_target}
                        </InfoCell>
                        <InfoCell label="Прораб" icon={User} iconColor="text-amber-500">
                            {app.foreman_name || 'Не назначен'}
                        </InfoCell>
                        <InfoCell label="Объект" icon={MapPin} iconColor="text-red-500">
                            {objectDisplay}
                        </InfoCell>
                    </div>

                    {/* Photo Slider */}
                    <PhotoSlider photos={photos} />

                    {/* Workers — grouped by team */}
                    <div className="border border-indigo-100 dark:border-indigo-900/30 rounded-2xl overflow-hidden">
                        <div className="px-5 pt-4 pb-3 bg-indigo-50/40 dark:bg-indigo-900/10">
                            <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-500" />
                                Состав рабочих
                                <span className="ml-auto text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md">
                                    {totalWorkers}
                                </span>
                            </h4>
                        </div>
                        <div className="p-4 bg-indigo-50/20 dark:bg-indigo-900/5">
                            {totalWorkers > 0 ? (
                                <div className="space-y-4">
                                    {Object.entries(teamGroups).map(([teamId, group]) => (
                                        <div key={teamId}>
                                            {/* Team header */}
                                            <div className="flex items-center gap-2 mb-2.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                                                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                                                    {group.name}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-medium">
                                                    ({group.members.length})
                                                </span>
                                                <div className="flex-1 border-t border-indigo-100 dark:border-indigo-900/30 ml-2"></div>
                                            </div>
                                            {/* Members list */}
                                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {group.members.map((w, i) => {
                                                    const isBrig = isForeman(w);
                                                    return (
                                                        <li
                                                            key={w.id ?? i}
                                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                                                                isBrig
                                                                    ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40'
                                                                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                                                            }`}
                                                        >
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                                isBrig
                                                                    ? 'bg-amber-100 dark:bg-amber-900/30'
                                                                    : 'bg-indigo-100 dark:bg-indigo-900/30'
                                                            }`}>
                                                                {isBrig
                                                                    ? <Crown className="w-4 h-4 text-amber-500" />
                                                                    : <User className="w-4 h-4 text-indigo-500" />
                                                                }
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                                                                        {w.fio}
                                                                    </p>
                                                                    {isBrig && (
                                                                        <span className="flex-shrink-0 text-[9px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-md">
                                                                            Бригадир
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {w.position && !isBrig && (
                                                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{w.position}</p>
                                                                )}
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic text-center py-2">Рабочие не назначены</p>
                            )}
                        </div>
                    </div>

                    {/* Equipment */}
                    <div className="border border-emerald-100 dark:border-emerald-900/30 rounded-2xl overflow-hidden">
                        <div className="px-5 pt-4 pb-3 bg-emerald-50/40 dark:bg-emerald-900/10">
                            <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                                <Truck className="w-5 h-5 text-emerald-500" />
                                Задействованная техника
                                <span className="ml-auto text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">
                                    {eqList.length}
                                </span>
                            </h4>
                        </div>
                        <div className="p-4 bg-emerald-50/20 dark:bg-emerald-900/5">
                            {eqList.length > 0 ? (
                                <div className="space-y-2">
                                    {eqList.map((eq, i) => {
                                        const rawName = eq.name || `Техника #${eq.id}`;
                                        // Extract driver from "Name [plate] (DriverFIO)" pattern
                                        const driverMatch = rawName.match(/\(([^)]+)\)\s*$/);
                                        const driver = driverMatch && driverMatch[1] !== 'Не указан' ? driverMatch[1] : null;
                                        const eqName = driver ? rawName.replace(/\s*\([^)]+\)\s*$/, '') : rawName;
                                        return (
                                            <div key={eq.id ?? i} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700 gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {eq.is_freed
                                                        ? <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                                        : <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0"><Truck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /></div>
                                                    }
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-bold truncate ${eq.is_freed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                                            {eqName}
                                                        </p>
                                                        {driver && (
                                                            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">Водитель: {driver}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className={`text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 whitespace-nowrap ${
                                                    eq.is_freed
                                                        ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400'
                                                }`}>
                                                    {formatTime(eq.time_start, eq.time_end)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic text-center py-2">Техника не назначена</p>
                            )}
                        </div>
                    </div>

                    {/* Comment / Plan */}
                    {(app.comment || app.plan_text) && (
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-purple-500" />
                                {app.plan_text ? 'План работ' : 'Комментарий'}
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-medium leading-relaxed">
                                {app.plan_text || app.comment}
                            </p>
                        </div>
                    )}
                    {/* ── Status Management (admin/superadmin only) ── */}
                    {canManageStatus && (() => {
                        const opts = [];
                        if (app.status === 'approved') {
                            opts.push({ value: 'in_progress', label: 'В работу' });
                        } else if (app.status === 'in_progress') {
                            opts.push({ value: 'approved', label: 'Вернуть в Одобренные' });
                            opts.push({ value: 'completed', label: 'Завершить' });
                        }

                        if (opts.length === 0) {
                            return (
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                                    <p className="text-xs text-gray-400 font-medium">Изменение статуса недоступно</p>
                                </div>
                            );
                        }

                        const isRollback = selectedStatus === 'approved';

                        const handleChangeStatus = async () => {
                            if (!selectedStatus) return toast.error('Выберите действие');
                            if (isRollback) {
                                const ok = window.confirm('При возврате в «Одобренные» данные СМР будут удалены. Продолжить?');
                                if (!ok) return;
                            }
                            setChangingStatus(true);
                            try {
                                const fd = new FormData();
                                fd.append('new_status', selectedStatus);
                                await axios.post(`/api/applications/${app.id}/change_status`, fd);
                                toast.success('Статус изменён');
                                onUpdate ? onUpdate() : onClose();
                            } catch (err) {
                                toast.error(err.response?.data?.detail || 'Ошибка смены статуса');
                            } finally {
                                setChangingStatus(false);
                            }
                        };

                        return (
                            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                                <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">Управление статусом</p>
                                <div className="flex gap-2 items-center">
                                    <select
                                        value={selectedStatus}
                                        onChange={e => setSelectedStatus(e.target.value)}
                                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                                    >
                                        <option value="">Выберите действие</option>
                                        {opts.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleChangeStatus}
                                        disabled={changingStatus || !selectedStatus}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50 ${
                                            isRollback
                                                ? 'bg-amber-500 hover:bg-amber-600'
                                                : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                    >
                                        {changingStatus ? '...' : 'Применить'}
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* ── Footer ── */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 px-6 rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-all active:scale-[0.98]"
                    >
                        Закрыть
                    </button>
                    {onEdit && app.status === 'waiting' && (
                        <button
                            type="button"
                            onClick={() => onEdit(app)}
                            className="flex-1 bg-yellow-500 text-white py-3 px-6 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-yellow-600 transition-all active:scale-[0.98]"
                        >
                            Редактировать
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

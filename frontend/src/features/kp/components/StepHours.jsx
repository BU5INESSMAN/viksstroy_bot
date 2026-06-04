import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, User, Crown, ArrowRight, UserPlus, X, Search } from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = [0.23, 1, 0.32, 1];

const STATUS_BADGES = {
    vacation: { label: 'Отп', cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
    sick:     { label: 'Бол', cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
};

/**
 * Wizard step 1 — hours per team member. Team-level input bulk-fills all
 * members of that team. Individual rows can be overridden. Vacation/sick
 * members get a status badge and default 0 hours (but remain editable).
 *
 * Brigadier scope: only teams where `tg_user_id === tgId` are shown.
 * Foreman+: all teams for the application.
 */
export default function StepHours({
    appId,
    userRole,
    tgId,
    hoursData,
    setHoursData,
    onNext,
    readOnly = false,
    addendumMode = false,
}) {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(() => new Set());
    const [customOverrides, setCustomOverrides] = useState(() => new Set());

    // v2.7 — ad-hoc worker picker (foreman/office only).
    const canAddAdHoc = ['foreman', 'moderator', 'boss', 'superadmin'].includes(userRole);
    const [showAddWorker, setShowAddWorker] = useState(false);
    const [candidates, setCandidates] = useState([]);
    const [candLoading, setCandLoading] = useState(false);
    const [candSearch, setCandSearch] = useState('');

    useEffect(() => {
        let alive = true;
        setLoading(true);
        axios.get(`/api/kp/apps/${appId}/hours`)
            .then(res => {
                if (!alive) return;
                const data = res.data || [];
                setTeams(data);

                // Seed hoursData on first load — use any pre-saved values.
                // v2.10: in addendum mode the editable buckets stay EMPTY so
                // only NEW hours are collected (existing hours are shown
                // read-only for reference below). Never seed here.
                if (!addendumMode && hoursData.length === 0) {
                    const seed = [];
                    for (const team of data) {
                        for (const m of (team.members || [])) {
                            // v2.10 (D8): seed members with hours OR a persisted
                            // row (filled_at present = a deliberate save, incl. a
                            // saved 0) so a reopened report re-shows "0". Never-
                            // saved members (no filled_at) stay blank → no row.
                            if (m.hours > 0 || m.filled_at) {
                                seed.push({ team_id: team.team_id, user_id: m.user_id, hours: m.hours });
                            }
                        }
                    }
                    if (seed.length > 0) setHoursData(seed);
                }

                // Default: expand all teams
                setExpanded(new Set(data.map(t => t.team_id)));
            })
            .catch(() => toast.error('Не удалось загрузить бригады'))
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appId]);

    // Brigadier sees only teams where tgId is on the member list.
    const visibleTeams = useMemo(() => {
        if (userRole !== 'brigadier' && userRole !== 'worker') return teams;
        const id = Number(tgId);
        return teams.filter(t => (t.members || []).some(m => Number(m.tg_user_id) === id));
    }, [teams, userRole, tgId]);

    const hoursMap = useMemo(() => {
        const m = new Map();
        for (const h of hoursData) m.set(`${h.team_id}:${h.user_id}`, h.hours);
        return m;
    }, [hoursData]);

    const setMemberHours = (team_id, user_id, value, isCustom = true) => {
        if (readOnly) return;
        const key = `${team_id}:${user_id}`;
        const numeric = value === '' ? '' : value;
        setHoursData(prev => {
            const others = prev.filter(h => !(h.team_id === team_id && h.user_id === user_id));
            // v2.10 (D8): three-way split. '' (cleared / never-set) → remove the
            // row; an explicit 0 → KEEP it as a visible 0-hours row so the zero
            // persists and overwrites any prior value on submit; otherwise keep
            // the typed value. Never-touched members never reach here → no row.
            if (numeric === '') return others;
            if (Number(numeric) === 0) return [...others, { team_id, user_id, hours: 0 }];
            return [...others, { team_id, user_id, hours: Number(numeric) }];
        });
        setCustomOverrides(prev => {
            const next = new Set(prev);
            if (isCustom) next.add(key);
            else next.delete(key);
            return next;
        });
    };

    const setTeamHours = (team_id, value) => {
        if (readOnly) return;
        const team = teams.find(t => t.team_id === team_id);
        if (!team) return;
        const numeric = value === '' ? 0 : Number(value);
        setHoursData(prev => {
            const others = prev.filter(h => h.team_id !== team_id || customOverrides.has(`${team_id}:${h.user_id}`));
            if (numeric <= 0) {
                return others.filter(h => customOverrides.has(`${h.team_id}:${h.user_id}`));
            }
            const additions = (team.members || [])
                .filter(m => !customOverrides.has(`${team_id}:${m.user_id}`))
                .filter(m => (m.status || 'available') === 'available')
                .map(m => ({ team_id, user_id: m.user_id, hours: numeric }));
            return [...others, ...additions];
        });
    };

    const toggleExpand = (team_id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(team_id)) next.delete(team_id); else next.add(team_id);
            return next;
        });
    };

    // ───── v2.7 ad-hoc worker picker ─────
    const openAddWorker = async () => {
        setShowAddWorker(true);
        setCandSearch('');
        setCandLoading(true);
        try {
            const res = await axios.get(`/api/kp/apps/${appId}/available_workers`);
            // Also drop anyone already present locally (just-added ad-hocs the
            // server hasn't seen yet, since nothing is persisted until submit).
            const present = new Set();
            for (const t of teams) for (const m of (t.members || [])) present.add(Number(m.user_id));
            setCandidates((res.data || []).filter(c => !present.has(Number(c.member_id))));
        } catch {
            toast.error('Не удалось загрузить сотрудников');
            setCandidates([]);
        } finally {
            setCandLoading(false);
        }
    };

    const addAdHocWorker = (cand) => {
        const teamId = cand.team_id;
        const newMember = {
            user_id: cand.member_id,
            member_id: cand.member_id,
            fio: cand.fio,
            specialty: cand.specialty || '',
            is_foreman: !!cand.is_foreman,
            is_ad_hoc: true,
            status: cand.status || 'available',
            tg_user_id: cand.user_id,
            hours: 0,
        };
        setTeams(prev => {
            const exists = prev.find(t => Number(t.team_id) === Number(teamId));
            if (exists) {
                if ((exists.members || []).some(m => Number(m.user_id) === Number(cand.member_id))) {
                    return prev;
                }
                return prev.map(t => Number(t.team_id) === Number(teamId)
                    ? { ...t, members: [...(t.members || []), newMember] }
                    : t);
            }
            return [...prev, {
                team_id: teamId,
                team_name: cand.team_name || `Бригада ${teamId}`,
                team_icon: cand.team_icon || '',
                is_virtual: true,
                members: [newMember],
            }];
        });
        setExpanded(prev => new Set(prev).add(teamId));
        setCandidates(prev => prev.filter(c => Number(c.member_id) !== Number(cand.member_id)));
        toast.success(`${cand.fio} добавлен`);
        setShowAddWorker(false);
    };

    const filteredCandidates = useMemo(() => {
        const q = candSearch.trim().toLowerCase();
        if (!q) return candidates;
        return candidates.filter(c =>
            `${c.fio} ${c.team_name || ''} ${c.specialty || ''}`.toLowerCase().includes(q)
        );
    }, [candidates, candSearch]);

    const getTeamLevel = (team) => {
        // If all non-vacation members share the same non-zero value and have
        // no individual override, show that as the team-level value.
        const values = (team.members || [])
            .filter(m => (m.status || 'available') === 'available')
            .filter(m => !customOverrides.has(`${team.team_id}:${m.user_id}`))
            .map(m => hoursMap.get(`${team.team_id}:${m.user_id}`) ?? 0);
        if (values.length === 0) return '';
        const first = values[0];
        return values.every(v => v === first) && first > 0 ? first : '';
    };

    const hasAnyHours = hoursData.some(h => h.hours > 0);

    if (loading) {
        return (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">Загрузка…</div>
        );
    }

    if (visibleTeams.length === 0 && !canAddAdHoc) {
        // v2.7 — unattached brigadier/worker: muted "contact admin" notice.
        // Foreman/office fall through so they can still add an ad-hoc worker.
        const unattached = userRole === 'brigadier' || userRole === 'worker';
        return (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                {unattached
                    ? 'Вы не привязаны ни к одной бригаде. Обратитесь к администратору.'
                    : 'Нет бригад, доступных для заполнения часов.'}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Часы</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {addendumMode
                        ? 'Добавьте часы, забытые в основном отчёте. Существующие записи не меняются.'
                        : 'Укажите отработанные часы. Значение на уровне бригады подставится всем участникам.'}
                </p>
            </div>

            {/* v2.10 доп.отчёт: read-only reference of hours already recorded. */}
            {addendumMode && (() => {
                const ref = [];
                for (const t of visibleTeams) {
                    for (const m of (t.members || [])) {
                        if (Number(m.hours) > 0) ref.push({ team: t.team_name, fio: m.fio, hours: m.hours });
                    }
                }
                if (ref.length === 0) return null;
                return (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 overflow-hidden">
                        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100/70 dark:bg-gray-800/50">
                            Уже в отчёте — часы (справка)
                        </div>
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-40 overflow-y-auto">
                            {ref.map((r, i) => (
                                <li key={i} className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="flex-1 truncate">{r.fio}{r.team ? ` · ${r.team}` : ''}</span>
                                    <span className="font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{r.hours} ч</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })()}

            {/* v2.7 — foreman/office can append a worker who showed up but
                wasn't in the application. Placed above the brigade list. */}
            {!readOnly && canAddAdHoc && (
                <button
                    type="button"
                    onClick={openAddWorker}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border border-dashed border-blue-300 dark:border-blue-700/60 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors active:scale-[0.99]"
                >
                    <UserPlus className="w-4 h-4" /> Добавить сотрудника
                </button>
            )}

            {visibleTeams.length === 0 && (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm italic border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    Нет бригад. Добавьте сотрудника кнопкой выше.
                </div>
            )}

            {visibleTeams.map(team => {
                const isOpen = expanded.has(team.team_id);
                const teamValue = getTeamLevel(team);
                return (
                    <div
                        key={team.team_id}
                        className="border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 overflow-hidden"
                    >
                        {/* Team header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900/40">
                            <button
                                type="button"
                                onClick={() => toggleExpand(team.team_id)}
                                className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
                            >
                                <motion.span
                                    animate={{ rotate: isOpen ? 0 : -90 }}
                                    transition={{ duration: 0.2, ease: EASE }}
                                    className="inline-flex text-gray-400"
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </motion.span>
                                <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                    {team.team_name}
                                </span>
                                {team.is_virtual && (
                                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded" title="Бригады не было в заявке">
                                        доп.
                                    </span>
                                )}
                                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                    {team.members?.length || 0}
                                </span>
                            </button>
                            <input
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                disabled={readOnly}
                                value={teamValue}
                                onChange={(e) => setTeamHours(team.team_id, e.target.value)}
                                placeholder="ч"
                                aria-label="Часы для всей бригады"
                                className="w-20 p-2 text-center font-bold border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                            <span className="text-xs font-semibold text-gray-400 w-6">ч</span>
                        </div>

                        {/* Members */}
                        <AnimatePresence initial={false}>
                            {isOpen && (
                                <motion.div
                                    initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: EASE }}
                                    style={{ overflow: 'hidden' }}
                                >
                                    <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                        {(team.members || []).map(m => {
                                            const key = `${team.team_id}:${m.user_id}`;
                                            const currentRaw = hoursMap.get(key);
                                            const current = currentRaw === undefined ? '' : currentRaw;
                                            const status = m.status || 'available';
                                            const badge = STATUS_BADGES[status];
                                            const isOverride = customOverrides.has(key);
                                            return (
                                                <li
                                                    key={m.user_id}
                                                    className="flex items-center gap-3 px-4 py-2.5"
                                                >
                                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 ${m.is_foreman ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                                        {m.is_foreman ? <Crown className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                                            {m.fio}
                                                        </p>
                                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                            {m.specialty || '—'}
                                                            {m.is_ad_hoc && (
                                                                <span className="ml-2 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded" title="Добавлен сверх заявки">
                                                                    доп.
                                                                </span>
                                                            )}
                                                            {badge && (
                                                                <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
                                                                    {badge.label}
                                                                </span>
                                                            )}
                                                            {isOverride && (
                                                                <span className="ml-2 text-[10px] font-bold text-blue-500">
                                                                    индивидуально
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="24"
                                                        step="0.5"
                                                        disabled={readOnly}
                                                        value={current}
                                                        onChange={(e) => setMemberHours(team.team_id, m.user_id, e.target.value, true)}
                                                        placeholder="0"
                                                        aria-label={`Часы для ${m.fio}`}
                                                        className="w-16 p-1.5 text-center text-sm font-bold border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                    />
                                                    <span className="text-xs font-semibold text-gray-400 w-6">ч</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}

            {!readOnly && (
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={onNext}
                        disabled={!addendumMode && !hasAnyHours}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                        Далее — работы <ArrowRight className="w-4 h-4" />
                    </button>
                    {!addendumMode && !hasAnyHours && (
                        <p className="text-xs text-gray-400 text-center mt-2">
                            Введите хотя бы одного участника с ненулевыми часами
                        </p>
                    )}
                </div>
            )}

            {/* v2.7 — ad-hoc worker picker modal */}
            <AnimatePresence>
                {showAddWorker && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowAddWorker(false)}
                    >
                        <motion.div
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={prefersReducedMotion ? {} : { opacity: 0, y: 12 }}
                            transition={{ duration: 0.2, ease: EASE }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <UserPlus className="w-5 h-5 text-blue-500" /> Добавить сотрудника
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setShowAddWorker(false)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                    aria-label="Закрыть"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={candSearch}
                                        onChange={(e) => setCandSearch(e.target.value)}
                                        placeholder="Поиск по ФИО или бригаде…"
                                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 dark:text-white text-sm"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                                {candLoading ? (
                                    <p className="text-center text-sm text-gray-400 py-8">Загрузка…</p>
                                ) : filteredCandidates.length === 0 ? (
                                    <p className="text-center text-sm text-gray-400 italic py-8">
                                        {candidates.length === 0
                                            ? 'Нет доступных сотрудников'
                                            : 'Ничего не найдено'}
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-gray-50 dark:divide-gray-700/60">
                                        {filteredCandidates.map(c => (
                                            <li key={c.member_id}>
                                                <button
                                                    type="button"
                                                    onClick={() => addAdHocWorker(c)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                                                >
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 flex-shrink-0">
                                                        {c.is_foreman ? <Crown className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{c.fio}</p>
                                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                            {c.team_name}{c.specialty ? ` · ${c.specialty}` : ''}
                                                        </p>
                                                    </div>
                                                    <UserPlus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, User, Crown, ArrowRight } from 'lucide-react';

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
}) {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(() => new Set());
    const [customOverrides, setCustomOverrides] = useState(() => new Set());

    useEffect(() => {
        let alive = true;
        setLoading(true);
        axios.get(`/api/kp/apps/${appId}/hours`)
            .then(res => {
                if (!alive) return;
                const data = res.data || [];
                setTeams(data);

                // Seed hoursData on first load — use any pre-saved values.
                if (hoursData.length === 0) {
                    const seed = [];
                    for (const team of data) {
                        for (const m of (team.members || [])) {
                            if (m.hours > 0) {
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
            if (numeric === '' || Number(numeric) === 0) return others;
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

    if (visibleTeams.length === 0) {
        return (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                Нет бригад, доступных для заполнения часов.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Часы</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Укажите отработанные часы. Значение на уровне бригады подставится всем участникам.
                </p>
            </div>

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
                        disabled={!hasAnyHours}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                        Далее — работы <ArrowRight className="w-4 h-4" />
                    </button>
                    {!hasAnyHours && (
                        <p className="text-xs text-gray-400 text-center mt-2">
                            Введите хотя бы одного участника с ненулевыми часами
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

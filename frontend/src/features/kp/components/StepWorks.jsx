import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { IconUsersGroup } from '@tabler/icons-react';
import { getIconComponent, TEAM_ICONS, DEFAULT_TEAM_ICON } from '../../../utils/iconConfig';
import ExtraWorksPicker from './ExtraWorksPicker';

/**
 * Wizard step 2 — plan works (from object_kp_plan via /api/kp/apps/{id}/items)
 * + extra works picker. v2.4.3: adds a "Общие работы | По бригадам" toggle
 * that splits the form into per-team sections with aggregated totals.
 *
 *   Brigadier → per-brigade is forced; no toggle (they only see their team).
 *   Foreman+ with 2+ teams → toggle visible.
 *   Foreman+ with 0-1 teams → no toggle, common mode.
 */
export default function StepWorks({
    appId,
    tgId,
    userRole,
    worksData,
    setWorksData,
    extraWorksData,
    setExtraWorksData,
    onNext,
    onBack,
    readOnly = false,
}) {
    const [planItems, setPlanItems] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previousFiller, setPreviousFiller] = useState(null);

    // v2.4.3: per-brigade mode.
    //   common           — single form, worksMap is {kp_id: volume}
    //   per-brigade      — worksByTeam is {team_id: {kp_id: volume}}
    //                      extraByTeam is {team_id: [items]}
    const [perBrigade, setPerBrigade] = useState(false);
    const [worksByTeam, setWorksByTeam] = useState({});
    const [extraByTeam, setExtraByTeam] = useState({});

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([
            axios.get(`/api/kp/apps/${appId}/items`),
            axios.get(`/api/kp/apps/${appId}/extra_works`),
            axios.get('/api/kp/catalog'),
            axios.get(`/api/kp/apps/${appId}/hours`).catch(() => ({ data: [] })),
        ])
            .then(([itemsRes, extraRes, catRes, hoursRes]) => {
                if (!alive) return;

                const items = (itemsRes.data || []).map(i => ({
                    kp_id: i.kp_id,
                    name: i.name,
                    category: i.category,
                    unit: i.unit || '',
                    volume: i.volume ?? '',
                    filled_by_fio: i.filled_by_fio || '',
                    filled_by_user_id: i.filled_by_user_id || null,
                }));
                setPlanItems(items);

                // Seed worksData from server if local is empty (common mode).
                if (worksData.length === 0 && items.some(i => Number(i.volume) > 0)) {
                    setWorksData(items
                        .filter(i => Number(i.volume) > 0)
                        .map(i => ({ kp_id: i.kp_id, volume: i.volume }))
                    );
                }

                if (extraWorksData.length === 0) {
                    setExtraWorksData((extraRes.data || []).map(ew => ({
                        kp_id: ew.extra_work_id || 0,
                        name: ew.custom_name || ew.catalog_name || '',
                        unit: ew.display_unit || ew.catalog_unit || 'шт',
                        volume: ew.volume ?? '',
                    })));
                }

                setCatalog(catRes.data || []);

                // Teams for per-brigade mode. For brigadier, narrow to
                // teams where they are a member.
                const rawTeams = hoursRes.data || [];
                const visible = (userRole === 'brigadier' || userRole === 'worker')
                    ? rawTeams.filter(t => (t.members || []).some(m => Number(m.tg_user_id) === Number(tgId)))
                    : rawTeams;
                setTeams(visible);

                // Brigadier is always per-brigade mode.
                if (userRole === 'brigadier' && visible.length > 0) {
                    setPerBrigade(true);
                }

                const otherAuthor = (itemsRes.data || []).find(i =>
                    Number(i.volume) > 0 && i.filled_by_user_id && Number(i.filled_by_user_id) !== Number(tgId)
                );
                setPreviousFiller(otherAuthor ? {
                    fio: otherAuthor.filled_by_fio || 'другой пользователь',
                    filled_at: otherAuthor.filled_at || '',
                } : null);
            })
            .catch(() => toast.error('Не удалось загрузить работы'))
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appId]);

    const showToggle = userRole !== 'brigadier' && teams && teams.length > 1;

    // ───── Common mode helpers ─────
    const worksMap = useMemo(() => {
        const m = new Map();
        for (const w of worksData) m.set(w.kp_id, w.volume);
        return m;
    }, [worksData]);

    const setWorkVolume = (kp_id, value) => {
        if (readOnly) return;
        setWorksData(prev => {
            const others = prev.filter(w => w.kp_id !== kp_id);
            if (value === '' || Number(value) <= 0) return others;
            return [...others, { kp_id, volume: Number(value) }];
        });
    };

    // ───── Per-brigade helpers ─────
    const setTeamWorkVolume = (team_id, kp_id, value) => {
        if (readOnly) return;
        setWorksByTeam(prev => {
            const teamMap = { ...(prev[team_id] || {}) };
            if (value === '' || Number(value) <= 0) {
                delete teamMap[kp_id];
            } else {
                teamMap[kp_id] = Number(value);
            }
            return { ...prev, [team_id]: teamMap };
        });
    };

    // When toggling ON, seed per-team state from common worksData as team-0;
    // when toggling OFF, flatten per-team totals back into common.
    const togglePerBrigade = (next) => {
        if (!next) {
            // per-brigade → common: sum by kp_id
            const sums = {};
            for (const tw of Object.values(worksByTeam)) {
                for (const [kp_id, v] of Object.entries(tw)) {
                    sums[kp_id] = (sums[kp_id] || 0) + Number(v);
                }
            }
            const flat = Object.entries(sums)
                .filter(([, v]) => v > 0)
                .map(([kp_id, v]) => ({ kp_id: Number(kp_id), volume: v }));
            setWorksData(flat);
        }
        setPerBrigade(next);
    };

    // Aggregated totals for display
    const aggregatedTotals = useMemo(() => {
        const sums = {};
        for (const tw of Object.values(worksByTeam)) {
            for (const [kp_id, v] of Object.entries(tw)) {
                sums[kp_id] = (sums[kp_id] || 0) + Number(v);
            }
        }
        return planItems
            .filter(it => sums[it.kp_id] > 0)
            .map(it => ({
                kp_id: it.kp_id,
                name: it.name,
                unit: it.unit,
                total: sums[it.kp_id],
            }));
    }, [worksByTeam, planItems]);

    // Flatten per-brigade state into worksData on Next.
    const handleNext = () => {
        if (perBrigade) {
            const flat = [];
            for (const [team_id, tw] of Object.entries(worksByTeam)) {
                for (const [kp_id, v] of Object.entries(tw)) {
                    if (Number(v) > 0) {
                        flat.push({ kp_id: Number(kp_id), volume: Number(v), team_id: Number(team_id) });
                    }
                }
            }
            setWorksData(flat);

            const flatExtras = [];
            for (const [team_id, items] of Object.entries(extraByTeam)) {
                for (const it of items || []) {
                    if (Number(it.volume) > 0) {
                        flatExtras.push({ ...it, team_id: Number(team_id) });
                    }
                }
            }
            setExtraWorksData(flatExtras);
        }
        onNext?.();
    };

    const groupedByCategory = useMemo(() => {
        const out = {};
        for (const item of planItems) {
            const cat = item.category || 'Без категории';
            if (!out[cat]) out[cat] = [];
            out[cat].push(item);
        }
        return out;
    }, [planItems]);

    if (loading) {
        return <div className="text-center py-12 text-gray-400 dark:text-gray-500">Загрузка…</div>;
    }

    // Reusable plan-list renderer. onVolume(kp_id, value) does the write.
    const renderPlanList = (getValue, onVolume) => (
        Object.keys(groupedByCategory).length === 0 ? (
            <div className="text-center text-sm text-gray-400 italic py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                План СМР не назначен для объекта
            </div>
        ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800">
                {Object.entries(groupedByCategory).map(([cat, items]) => (
                    <div key={cat}>
                        <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            {cat}
                        </div>
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {items.map(it => (
                                <li key={it.kp_id} className="flex items-center gap-3 px-4 py-2.5">
                                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                                        {it.name}
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        disabled={readOnly}
                                        value={getValue(it.kp_id) ?? ''}
                                        onChange={(e) => onVolume(it.kp_id, e.target.value)}
                                        placeholder="0"
                                        className="w-20 p-1.5 text-center text-sm font-bold border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    />
                                    <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">
                                        {it.unit || ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        )
    );

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Работы</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Укажите фактический объём выполненных работ.
                </p>
            </div>

            {previousFiller && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold text-amber-700 dark:text-amber-300">
                            {previousFiller.fio} уже заполнил работы
                        </p>
                        {previousFiller.filled_at && (
                            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                                {previousFiller.filled_at.replace('T', ' ')}
                            </p>
                        )}
                        <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                            Проверьте значения и при необходимости отредактируйте.
                        </p>
                    </div>
                </div>
            )}

            {/* Mode toggle — foreman+ with 2+ teams only */}
            {showToggle && (
                <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800/60 rounded-xl">
                    <button
                        type="button"
                        onClick={() => togglePerBrigade(false)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            !perBrigade
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        Общие работы
                    </button>
                    <button
                        type="button"
                        onClick={() => togglePerBrigade(true)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            perBrigade
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        По бригадам
                    </button>
                </div>
            )}

            {/* Common mode */}
            {!perBrigade && (
                <>
                    {renderPlanList((kp_id) => worksMap.get(kp_id), setWorkVolume)}
                    <ExtraWorksPicker
                        catalog={catalog}
                        selected={extraWorksData}
                        onChange={setExtraWorksData}
                        disabled={readOnly}
                        defaultOpen={extraWorksData.length > 0}
                    />
                </>
            )}

            {/* Per-brigade mode */}
            {perBrigade && teams.length > 0 && (
                <div className="space-y-6">
                    {teams.map(team => {
                        const TeamIcon = getIconComponent(team.icon || DEFAULT_TEAM_ICON, TEAM_ICONS) || IconUsersGroup;
                        return (
                            <div key={team.team_id} className="space-y-3">
                                <div className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
                                    <TeamIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" stroke={2} />
                                    <span className="truncate">{team.team_name}</span>
                                </div>
                                {renderPlanList(
                                    (kp_id) => (worksByTeam[team.team_id] || {})[kp_id] ?? '',
                                    (kp_id, value) => setTeamWorkVolume(team.team_id, kp_id, value),
                                )}
                                <ExtraWorksPicker
                                    catalog={catalog}
                                    selected={extraByTeam[team.team_id] || []}
                                    onChange={(items) => setExtraByTeam(prev => ({ ...prev, [team.team_id]: items }))}
                                    disabled={readOnly}
                                />
                            </div>
                        );
                    })}

                    {/* Totals */}
                    {aggregatedTotals.length > 0 && (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-4">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" /> Итого по всем бригадам
                            </h3>
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                {aggregatedTotals.map((t) => (
                                    <li key={t.kp_id} className="flex justify-between py-1.5 text-sm">
                                        <span className="text-gray-700 dark:text-gray-300 truncate mr-3">{t.name}</span>
                                        <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                            {t.total} {t.unit || ''}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {perBrigade && teams.length === 0 && (
                <div className="text-center text-sm text-gray-400 italic py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    К этой заявке не привязаны бригады — доступен только режим «Общие работы».
                </div>
            )}

            {!readOnly && (
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="px-5 py-3.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors active:scale-[0.99] flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Назад
                    </button>
                    <button
                        type="button"
                        onClick={handleNext}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                        Далее — просмотр <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

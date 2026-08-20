import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { IconUsersGroup } from '@tabler/icons-react';
import { getIconComponent, TEAM_ICONS, DEFAULT_TEAM_ICON } from '../../../utils/iconConfig';
import ExtraWorksPicker from './ExtraWorksPicker';
import { genRowId } from '../utils/rowId';

const sourceId = (value, fallback = 0) => Number(
    value?.source_application_id || value?.application_id || fallback || 0
);
const sectionKey = (source, team) => `${Number(source || 0)}:${Number(team || 0)}`;
const workKey = (source, kp) => `${Number(source || 0)}:${Number(kp || 0)}`;
const parseSectionKey = (value, fallbackSource) => {
    const parts = String(value).split(':').map(Number);
    return parts.length > 1 ? parts : [Number(fallbackSource || 0), parts[0]];
};

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
    app,
    tgId,
    userRole,
    worksData,
    setWorksData,
    extraWorksData,
    setExtraWorksData,
    // v2.5 Commit 3: lifted to SMRWizard so re-mounting from Review's
    // "Редактировать работы" preserves per-brigade volumes & toggle.
    perBrigade,
    setPerBrigade,
    worksByTeam,
    setWorksByTeam,
    extraByTeam,
    setExtraByTeam,
    // v2.10 (D6): common (team_id NULL) rows carried through state + payload
    // (not rendered) so a foreman/office per-brigade submit round-trips them.
    commonWorks = [],
    setCommonWorks,
    commonExtras = [],
    setCommonExtras,
    onNext,
    onBack,
    readOnly = false,
    addendumMode = false,
}) {
    const [planItems, setPlanItems] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previousFiller, setPreviousFiller] = useState(null);
    // v2.10 доп.отчёт: existing rows shown read-only for reference (not seeded).
    const [refPlan, setRefPlan] = useState([]);
    const [refExtras, setRefExtras] = useState([]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([
            axios.get(`/api/kp/apps/${appId}/items`),
            // v2.10: in addendum mode pull ALL existing extras (incl. prior
            // addenda) for the read-only reference so the user doesn't re-add.
            axios.get(`/api/kp/apps/${appId}/extra_works${addendumMode ? '?include_additional=1' : ''}`),
            axios.get('/api/kp/catalog'),
            axios.get(`/api/kp/apps/${appId}/hours`).catch(() => ({ data: [] })),
        ])
            .then(([itemsRes, extraRes, catRes, hoursRes]) => {
                if (!alive) return;

                // v2.9: the server now returns one row per (kp_id, team_id).
                // Build a DISTINCT catalog (one row per kp_id) for rendering;
                // per-brigade volumes live in worksByTeam[team_id][kp_id].
                const raw = (itemsRes.data || []).map(i => ({
                    ...i,
                    source_application_id: sourceId(i, appId),
                }));
                const rawExtras = (extraRes.data || []).map(e => ({
                    ...e,
                    source_application_id: sourceId(e, appId),
                }));
                // v2.9.4: per-brigade mode must also engage when only the EXTRA
                // works carry a team_id — e.g. no-KP objects (empty
                // object_kp_plan) where /items returns nothing but the brigadier
                // filled extras under their brigade. Without this, hasTeamRows
                // stayed false and extraByTeam was never seeded from the server.
                const extraHasTeam = rawExtras.some(
                    e => e.team_id !== null && e.team_id !== undefined && String(e.team_id) !== '0'
                );
                const hasTeamRows = raw.some(i => i.team_id !== null && i.team_id !== undefined) || extraHasTeam;

                const seenKp = new Set();
                const items = [];
                for (const i of raw) {
                    const key = workKey(i.source_application_id, i.kp_id);
                    if (seenKp.has(key)) continue;
                    seenKp.add(key);
                    items.push({
                        source_application_id: i.source_application_id,
                        object_name: i.object_name || `Объект ${i.source_application_id}`,
                        application_label: i.application_label || `№${i.source_application_id}`,
                        kp_id: i.kp_id,
                        name: i.name,
                        category: i.category,
                        unit: i.unit || '',
                        volume: i.volume ?? '',
                        filled_by_fio: i.filled_by_fio || '',
                        filled_by_user_id: i.filled_by_user_id || null,
                    });
                }
                setPlanItems(items);

                if (addendumMode) {
                    // Addendum mode: NEVER seed the editable buckets — collect
                    // only NEW rows. Capture existing rows for read-only display.
                    setRefPlan(raw.filter(i => Number(i.volume) > 0).map(i => ({
                        name: i.name,
                        unit: i.unit || '',
                        volume: i.volume,
                        team_name: i.team_name || '',
                        is_additional: i.is_additional,
                    })));
                    setRefExtras(rawExtras.filter(e => Number(e.volume) > 0).map(e => ({
                        source_application_id: e.source_application_id,
                        name: e.custom_name || e.kp_catalog_name || e.catalog_name || '',
                        unit: e.display_unit || e.kp_catalog_unit || e.catalog_unit || 'шт',
                        volume: e.volume,
                        is_additional: e.is_additional,
                        filled_at: e.filled_at,
                    })));
                }

                if (!addendumMode && hasTeamRows) {
                    // Per-brigade submission (e.g. the foreman reviewing a
                    // brigadier's "По бригадам" fill): auto-enable per-brigade
                    // mode and seed the per-team volumes from the server so the
                    // brigade split is re-entered, not collapsed into a common
                    // view. Guards keep an in-progress draft from being clobbered.
                    setPerBrigade(true);
                    if (Object.keys(worksByTeam).length === 0) {
                        const seededWorks = {};
                        for (const i of raw) {
                            const tid = i.team_id;
                            if (tid === null || tid === undefined) continue;
                            if (!(Number(i.volume) > 0)) continue;
                            const key = sectionKey(i.source_application_id, tid);
                            if (!seededWorks[key]) seededWorks[key] = {};
                            seededWorks[key][i.kp_id] = Number(i.volume);
                        }
                        if (Object.keys(seededWorks).length > 0) setWorksByTeam(seededWorks);
                    }
                    if (Object.keys(extraByTeam).length === 0) {
                        const seededExtra = {};
                        for (const ew of rawExtras) {
                            const tid = ew.team_id;
                            if (tid === null || tid === undefined) continue;
                            if (!(Number(ew.volume) > 0)) continue;
                            const key = sectionKey(ew.source_application_id, tid);
                            if (!seededExtra[key]) seededExtra[key] = [];
                            seededExtra[key].push({
                                source_application_id: ew.source_application_id,
                                rid: genRowId(),
                                kp_id: ew.kp_id || 0,
                                extra_work_id: ew.extra_work_id || 0,
                                name: ew.custom_name || ew.kp_catalog_name || ew.catalog_name || '',
                                unit: ew.display_unit || ew.kp_catalog_unit || ew.catalog_unit || 'шт',
                                volume: ew.volume ?? '',
                            });
                        }
                        if (Object.keys(seededExtra).length > 0) setExtraByTeam(seededExtra);
                    }
                    // v2.10 (D6): capture common (team_id NULL) rows — owned by
                    // foreman/office (their delete scope includes team_id IS
                    // NULL) — into preserved buckets so handleNext can round-trip
                    // them. Seeded from the raw server rows under their OWN
                    // length guard, independent of the per-team guards above, so
                    // a restored draft that skipped per-team seeding still seeds
                    // common (otherwise the wipe would re-appear). Brigadier/
                    // worker never own common — skip them so their payload stays
                    // common-free.
                    const ownsCommon = userRole !== 'brigadier' && userRole !== 'worker';
                    if (ownsCommon && commonWorks.length === 0) {
                        const cw = raw
                            .filter(i => (i.team_id === null || i.team_id === undefined) && Number(i.volume) > 0)
                            .map(i => ({
                                source_application_id: i.source_application_id,
                                kp_id: i.kp_id,
                                volume: Number(i.volume),
                            }));
                        if (cw.length > 0) setCommonWorks?.(cw);
                    }
                    if (ownsCommon && commonExtras.length === 0) {
                        const ce = rawExtras
                            .filter(e => (e.team_id === null || e.team_id === undefined) && Number(e.volume) > 0)
                            .map(e => ({
                                rid: genRowId(),
                                source_application_id: e.source_application_id,
                                kp_id: e.kp_id || 0,
                                extra_work_id: e.extra_work_id || 0,
                                name: e.custom_name || e.kp_catalog_name || e.catalog_name || '',
                                unit: e.display_unit || e.kp_catalog_unit || e.catalog_unit || 'шт',
                                volume: e.volume ?? '',
                                team_id: null,
                            }));
                        if (ce.length > 0) setCommonExtras?.(ce);
                    }
                } else if (!addendumMode && worksData.length === 0 && items.some(i => Number(i.volume) > 0)) {
                    // Common mode: seed flat worksData from server (unchanged).
                    setWorksData(items
                        .filter(i => Number(i.volume) > 0)
                        .map(i => ({
                            source_application_id: i.source_application_id,
                            kp_id: i.kp_id,
                            volume: i.volume,
                        }))
                    );
                }

                // Common-mode extra-works seed. Used when NOT per-brigade;
                // harmless otherwise since handleNext re-derives extras from
                // extraByTeam before submit in per-brigade mode. Skipped in
                // addendum mode so the picker starts empty (new rows only).
                if (!addendumMode && extraWorksData.length === 0) {
                    setExtraWorksData(rawExtras.map(ew => ({
                        rid: genRowId(),
                        source_application_id: ew.source_application_id,
                        kp_id: ew.kp_id || 0,
                        extra_work_id: ew.extra_work_id || 0,
                        name: ew.custom_name || ew.kp_catalog_name || ew.catalog_name || '',
                        unit: ew.display_unit || ew.kp_catalog_unit || ew.catalog_unit || 'шт',
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
                setPreviousFiller((!addendumMode && otherAuthor) ? {
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
        for (const w of worksData) {
            m.set(workKey(sourceId(w, appId), w.kp_id), w.volume);
        }
        return m;
    }, [worksData, appId]);

    const setWorkVolume = (source_application_id, kp_id, value) => {
        if (readOnly) return;
        setWorksData(prev => {
            const others = prev.filter(w => !(
                sourceId(w, appId) === Number(source_application_id) && w.kp_id === kp_id
            ));
            if (value === '' || Number(value) <= 0) return others;
            return [...others, { source_application_id, kp_id, volume: Number(value) }];
        });
    };

    // ───── Per-brigade helpers ─────
    const setTeamWorkVolume = (source_application_id, team_id, kp_id, value) => {
        if (readOnly) return;
        const key = sectionKey(source_application_id, team_id);
        setWorksByTeam(prev => {
            const teamMap = { ...(prev[key] || {}) };
            if (value === '' || Number(value) <= 0) {
                delete teamMap[kp_id];
            } else {
                teamMap[kp_id] = Number(value);
            }
            return { ...prev, [key]: teamMap };
        });
    };

    // When toggling ON, seed per-team state from common worksData as team-0;
    // when toggling OFF, flatten per-team totals back into common.
    const togglePerBrigade = (next) => {
        if (!next) {
            // per-brigade → common: sum by kp_id
            const sums = {};
            for (const [section, tw] of Object.entries(worksByTeam)) {
                const [source] = parseSectionKey(section, appId);
                for (const [kp_id, v] of Object.entries(tw)) {
                    const key = workKey(source, kp_id);
                    sums[key] = (sums[key] || 0) + Number(v);
                }
            }
            const flat = Object.entries(sums)
                .filter(([, v]) => v > 0)
                .map(([key, v]) => {
                    const [source_application_id, kp_id] = key.split(':').map(Number);
                    return { source_application_id, kp_id, volume: v };
                });
            setWorksData(flat);
        }
        setPerBrigade(next);
    };

    // Aggregated totals for display
    const aggregatedTotals = useMemo(() => {
        const sums = {};
        for (const [section, tw] of Object.entries(worksByTeam)) {
            const [source] = parseSectionKey(section, appId);
            for (const [kp_id, v] of Object.entries(tw)) {
                const key = workKey(source, kp_id);
                sums[key] = (sums[key] || 0) + Number(v);
            }
        }
        return planItems
            .filter(it => sums[workKey(it.source_application_id, it.kp_id)] > 0)
            .map(it => ({
                source_application_id: it.source_application_id,
                object_name: it.object_name,
                kp_id: it.kp_id,
                name: it.name,
                unit: it.unit,
                total: sums[workKey(it.source_application_id, it.kp_id)],
            }));
    }, [worksByTeam, planItems, appId]);

    // Flatten per-brigade state into worksData on Next.
    const handleNext = () => {
        if (perBrigade) {
            const flat = [];
            for (const [section, tw] of Object.entries(worksByTeam)) {
                const [source_application_id, team_id] = parseSectionKey(section, appId);
                for (const [kp_id, v] of Object.entries(tw)) {
                    if (Number(v) > 0) {
                        flat.push({
                            source_application_id,
                            kp_id: Number(kp_id), volume: Number(v), team_id,
                        });
                    }
                }
            }
            // v2.10 (D6): round-trip common (team_id NULL) plan rows so the
            // foreman/office submit re-inserts them instead of wiping them.
            for (const cw of (commonWorks || [])) {
                if (Number(cw.volume) > 0) {
                    flat.push({
                        ...cw,
                        source_application_id: sourceId(cw, appId),
                        kp_id: Number(cw.kp_id), volume: Number(cw.volume), team_id: null,
                    });
                }
            }
            setWorksData(flat);

            const flatExtras = [];
            for (const [section, items] of Object.entries(extraByTeam)) {
                const [source_application_id, team_id] = parseSectionKey(section, appId);
                for (const it of items || []) {
                    if (Number(it.volume) > 0) {
                        flatExtras.push({ ...it, source_application_id, team_id });
                    }
                }
            }
            // v2.10 (D6): same round-trip for common extras — appended to the
            // SAME array that overwrites extraWorksData so they are not discarded.
            for (const ce of (commonExtras || [])) {
                if (Number(ce.volume) > 0) {
                    flatExtras.push({
                        ...ce,
                        source_application_id: sourceId(ce, appId),
                        team_id: null,
                    });
                }
            }
            setExtraWorksData(flatExtras);
        }
        onNext?.();
    };

    const objectSections = useMemo(() => {
        const sections = new Map();
        for (const item of planItems) {
            const source = sourceId(item, appId);
            if (!sections.has(source)) {
                sections.set(source, {
                    source_application_id: source,
                    object_name: item.object_name || `Объект ${source}`,
                    application_label: item.application_label || `№${source}`,
                    items: [],
                });
            }
            sections.get(source).items.push(item);
        }
        for (const team of teams || []) {
            const source = sourceId(team, appId);
            if (!sections.has(source)) {
                sections.set(source, {
                    source_application_id: source,
                    object_name: team.object_name || `Объект ${source}`,
                    application_label: team.application_label || `№${source}`,
                    items: [],
                });
            }
        }
        const appSections = [
            {
                id: Number(app?.id || appId),
                object_name: app?.object_name || app?.obj_name || app?.object_address,
                application_label: app?.public_number || app?.application_number,
            },
            ...(Array.isArray(app?.merged_with) ? app.merged_with : []),
        ];
        for (const entry of appSections) {
            const source = Number(entry?.id || 0);
            if (!source || sections.has(source)) continue;
            sections.set(source, {
                source_application_id: source,
                object_name: entry.object_name || entry.obj_name || entry.object_address || `Объект ${source}`,
                application_label: entry.public_number || entry.application_label || `№${source}`,
                items: [],
            });
        }
        return [...sections.values()].sort(
            (a, b) => a.source_application_id - b.source_application_id
        );
    }, [planItems, teams, appId, app]);

    if (loading) {
        return <div className="text-center py-12 text-gray-400 dark:text-gray-500">Загрузка…</div>;
    }

    // Reusable plan-list renderer. onVolume(kp_id, value) does the write.
    const renderPlanList = (sourceItems, getValue, onVolume) => {
        const sourceGroups = {};
        for (const item of sourceItems) {
            const category = item.category || 'Без категории';
            if (!sourceGroups[category]) sourceGroups[category] = [];
            sourceGroups[category].push(item);
        }
        return Object.keys(sourceGroups).length === 0 ? (
            <div className="text-center text-sm text-gray-400 italic py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                План СМР не назначен для объекта
            </div>
        ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800">
                {Object.entries(sourceGroups).map(([cat, items]) => (
                    <div key={cat}>
                        <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            {cat}
                        </div>
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {items.map(it => (
                                <li key={workKey(it.source_application_id, it.kp_id)} className="flex items-center gap-3 px-4 py-2.5">
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
        );
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Работы</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {addendumMode
                        ? 'Добавьте работы, забытые в основном отчёте. Существующие записи не меняются.'
                        : 'Укажите фактический объём выполненных работ.'}
                </p>
            </div>

            {/* v2.10 доп.отчёт: read-only reference of what's already reported. */}
            {addendumMode && (refPlan.length > 0 || refExtras.length > 0) && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 overflow-hidden">
                    <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100/70 dark:bg-gray-800/50">
                        Уже в отчёте (только для справки)
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-48 overflow-y-auto">
                        {refPlan.map((r, i) => (
                            <li key={`rp${i}`} className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                                <span className="flex-1 truncate">{r.name}{r.team_name ? ` · ${r.team_name}` : ''}</span>
                                <span className="font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{r.volume} {r.unit}</span>
                            </li>
                        ))}
                        {refExtras.map((r, i) => (
                            <li key={`re${i}`} className="flex items-center gap-2 px-4 py-1.5 text-xs text-amber-600/80 dark:text-amber-400/70">
                                <span className="flex-1 truncate">+ {r.name}{r.is_additional ? ' (добавлено позже)' : ''}</span>
                                <span className="font-semibold whitespace-nowrap">{r.volume} {r.unit}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

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
                <div className="space-y-6">
                    {objectSections.map(section => {
                        const source = section.source_application_id;
                        const selectedExtras = extraWorksData.filter(
                            item => sourceId(item, appId) === source
                        );
                        return (
                            <section key={source} className="space-y-3 rounded-2xl border-2 border-blue-100 dark:border-blue-900/50 p-3">
                                <header>
                                    <p className="text-base font-bold text-gray-900 dark:text-white">
                                        {section.object_name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {section.application_label}
                                    </p>
                                </header>
                                {renderPlanList(
                                    section.items,
                                    (kp_id) => worksMap.get(workKey(source, kp_id)),
                                    (kp_id, value) => setWorkVolume(source, kp_id, value),
                                )}
                                <ExtraWorksPicker
                                    catalog={catalog}
                                    selected={selectedExtras}
                                    onChange={(items) => setExtraWorksData(prev => [
                                        ...prev.filter(item => sourceId(item, appId) !== source),
                                        ...items.map(item => ({ ...item, source_application_id: source })),
                                    ])}
                                    disabled={readOnly}
                                    defaultOpen={selectedExtras.length > 0}
                                />
                            </section>
                        );
                    })}
                </div>
            )}

            {/* Per-brigade mode */}
            {perBrigade && teams.length > 0 && (
                <div className="space-y-6">
                    {teams.map(team => {
                        const source = sourceId(team, appId);
                        const currentSection = sectionKey(source, team.team_id);
                        const sourcePlan = planItems.filter(
                            item => sourceId(item, appId) === source
                        );
                        const TeamIcon = getIconComponent(team.icon || DEFAULT_TEAM_ICON, TEAM_ICONS) || IconUsersGroup;
                        return (
                            <div key={currentSection} className="space-y-3 rounded-2xl border-2 border-blue-100 dark:border-blue-900/50 p-3">
                                <div className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
                                    <TeamIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" stroke={2} />
                                    <span className="truncate">{team.object_name || `Объект ${source}`} · {team.team_name}</span>
                                </div>
                                {renderPlanList(
                                    sourcePlan,
                                    (kp_id) => (worksByTeam[currentSection] || {})[kp_id] ?? '',
                                    (kp_id, value) => setTeamWorkVolume(source, team.team_id, kp_id, value),
                                )}
                                <ExtraWorksPicker
                                    catalog={catalog}
                                    selected={extraByTeam[currentSection] || []}
                                    onChange={(items) => setExtraByTeam(prev => ({
                                        ...prev,
                                        [currentSection]: items.map(item => ({
                                            ...item,
                                            source_application_id: source,
                                        })),
                                    }))}
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
                                    <li key={workKey(t.source_application_id, t.kp_id)} className="flex justify-between py-1.5 text-sm">
                                        <span className="text-gray-700 dark:text-gray-300 truncate mr-3">{t.object_name} · {t.name}</span>
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

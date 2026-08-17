import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Send, Clock, Hammer, Plus, Loader2, Check, WalletCards, Save } from 'lucide-react';

const sourceId = (value, fallback = 0) => Number(
    value?.source_application_id || value?.application_id || fallback || 0
);
const memberKey = (source, team, member) => `${Number(source)}:${Number(team)}:${Number(member)}`;
const workKey = (source, kp) => `${Number(source)}:${Number(kp)}`;

/**
 * Wizard step 3 — review & submit. Loads display metadata (FIO, specialty,
 * work names, units) so the user sees the final summary as it will appear
 * in the Excel report. No prices, no salaries — just the factual entries.
 */
export default function StepReview({
    appId,
    app,
    hoursData,
    worksData,
    extraWorksData,
    onEdit,
    onSubmit,
    submitting,
    approveMode = false,
    addendumMode = false,
    editReadyMode = false,
}) {
    const [teams, setTeams] = useState([]);
    const [planItems, setPlanItems] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([
            axios.get(`/api/kp/apps/${appId}/hours`),
            axios.get(`/api/kp/apps/${appId}/items`),
            axios.get('/api/kp/catalog'),
        ])
            .then(([hRes, pRes, cRes]) => {
                if (!alive) return;
                setTeams(hRes.data || []);
                setPlanItems(pRes.data || []);
                setCatalog(cRes.data || []);
            })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [appId]);

    // Hours: group by team, only include members with hours in current draft
    const hoursByTeam = useMemo(() => {
        const selected = new Map();
        for (const h of hoursData) {
            selected.set(memberKey(sourceId(h, appId), h.team_id, h.user_id), h.hours);
        }

        const out = [];
        for (const t of teams) {
            const rows = (t.members || [])
                // v2.10 (D8): include members PRESENT in the payload (incl. an
                // explicit 0) — not just hours>0 — so a deliberately-zeroed
                // member still shows in the review summary.
                .filter(m => selected.has(memberKey(sourceId(t, appId), t.team_id, m.user_id)))
                .map(m => ({
                    ...m,
                    hours: selected.get(memberKey(sourceId(t, appId), t.team_id, m.user_id)) || 0,
                    participant_salary: hoursData.find(
                        h => memberKey(sourceId(h, appId), h.team_id, h.user_id)
                            === memberKey(sourceId(t, appId), t.team_id, m.user_id)
                    )?.participant_salary || 0,
                }));
            if (rows.length > 0) {
                out.push({
                    source_application_id: sourceId(t, appId),
                    object_name: t.object_name || `Объект ${sourceId(t, appId)}`,
                    application_label: t.application_label || `№${sourceId(t, appId)}`,
                    team_id: t.team_id, team_name: t.team_name, members: rows,
                });
            }
        }
        return out;
    }, [teams, hoursData, appId]);

    const worksView = useMemo(() => {
        // v2.9: worksData may carry several per-brigade entries per kp_id, and
        // /items now returns one planItems row per (kp_id, team_id). Sum the
        // volumes by kp_id and de-duplicate planItems so the review summary
        // shows one line per work with the combined total. Common mode (one
        // entry per kp_id) is unchanged: sum == the single value.
        const byId = new Map();
        for (const w of worksData) {
            const k = workKey(sourceId(w, appId), w.kp_id);
            byId.set(k, (byId.get(k) || 0) + Number(w.volume || 0));
        }
        const seen = new Set();
        return planItems
            .filter(i => {
                const k = workKey(sourceId(i, appId), i.kp_id);
                if (!byId.has(k) || seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .map(i => ({
                name: i.name,
                source_application_id: sourceId(i, appId),
                object_name: i.object_name || `Объект ${sourceId(i, appId)}`,
                unit: i.unit || '',
                volume: byId.get(workKey(sourceId(i, appId), i.kp_id)),
            }));
    }, [planItems, worksData, appId]);

    const objectNames = useMemo(() => {
        const names = new Map();
        for (const row of planItems) {
            names.set(sourceId(row, appId), row.object_name);
        }
        for (const row of teams) {
            names.set(sourceId(row, appId), row.object_name);
        }
        const appRows = [app, ...(Array.isArray(app?.merged_with) ? app.merged_with : [])];
        for (const row of appRows) {
            const source = Number(row?.id || 0);
            if (!source) continue;
            names.set(source, row.object_name || row.obj_name || row.object_address || names.get(source));
        }
        return names;
    }, [planItems, teams, app, appId]);

    const extraView = useMemo(() => {
        const catalogMap = new Map();
        for (const c of catalog) catalogMap.set(Number(c.id), c);
        return (extraWorksData || [])
            .filter(e => Number(e.volume) > 0)
            .map(e => {
                const c = e.kp_id ? catalogMap.get(Number(e.kp_id)) : null;
                return {
                    source_application_id: sourceId(e, appId),
                    object_name: objectNames.get(sourceId(e, appId))
                        || `Объект ${sourceId(e, appId)}`,
                    name: e.name || c?.name || '',
                    unit: e.unit || c?.unit || '',
                    volume: Number(e.volume),
                };
            });
    }, [extraWorksData, catalog, objectNames, appId]);

    if (loading) {
        return <div className="text-center py-12 text-gray-400 dark:text-gray-500">Загрузка…</div>;
    }

    const totalMembers = hoursByTeam.reduce((a, t) => a + t.members.length, 0);
    const totalHours = hoursByTeam.reduce((a, t) => a + t.members.reduce((s, m) => s + Number(m.hours || 0), 0), 0);
    const totalParticipantSalary = hoursByTeam.reduce(
        (total, team) => total + team.members.reduce(
            (sum, member) => sum + Number(member.participant_salary || 0), 0
        ), 0
    );

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Просмотр отчёта</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Проверьте данные перед отправкой. Можно вернуться и отредактировать.
                </p>
            </div>

            {/* Hours section */}
            <section className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800">
                <header className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <Clock className="w-4 h-4 text-blue-500" /> Часы
                    </span>
                    <div className="text-right">
                        <span className="block text-[11px] font-bold text-gray-400">
                            {totalMembers} чел · {totalHours.toFixed(1)} ч
                        </span>
                        {totalParticipantSalary > 0 && (
                            <span className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                ЗП участникам: {totalParticipantSalary.toLocaleString('ru-RU')} ₽
                            </span>
                        )}
                    </div>
                </header>
                {hoursByTeam.length === 0 ? (
                    <p className="text-center text-sm italic text-gray-400 dark:text-gray-500 py-6">
                        Часы не заполнены
                    </p>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {hoursByTeam.map(t => (
                            <div key={`${t.source_application_id}:${t.team_id}`}>
                                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50/60 dark:bg-gray-900/30">
                                    {t.object_name} · {t.team_name}
                                </div>
                                <ul className="divide-y divide-gray-50 dark:divide-gray-700/40">
                                    {t.members.map(m => (
                                        <li key={m.user_id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-2">
                                            <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                                                {m.fio}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 min-w-0 truncate">
                                                {m.specialty || '—'}
                                            </span>
                                            <span className="w-16 text-right text-sm font-bold text-gray-900 dark:text-white">
                                                {Number(m.hours).toFixed(1)} ч
                                            </span>
                                            <span className="min-w-[7rem] text-right text-sm font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center justify-end gap-1">
                                                <WalletCards className="w-3.5 h-3.5" />
                                                {Number(m.participant_salary || 0).toLocaleString('ru-RU')} ₽
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Plan works section */}
            <section className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800">
                <header className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <Hammer className="w-4 h-4 text-emerald-500" /> Выполненные работы
                    </span>
                    <span className="text-[11px] font-bold text-gray-400">{worksView.length}</span>
                </header>
                {worksView.length === 0 ? (
                    <p className="text-center text-sm italic text-gray-400 dark:text-gray-500 py-6">
                        Работы не выбраны
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {worksView.map((w, i) => (
                            <li key={i} className="flex items-center gap-3 px-4 py-2">
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 truncate">{w.object_name}</span>
                                    <span className="block text-sm text-gray-800 dark:text-gray-100 truncate">{w.name}</span>
                                </span>
                                <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">{w.unit}</span>
                                <span className="w-16 text-right text-sm font-bold text-gray-900 dark:text-white">{w.volume}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Extra works — hidden when empty */}
            {extraView.length > 0 && (
                <section className="border border-amber-200 dark:border-amber-700/50 rounded-2xl overflow-hidden bg-yellow-50/40 dark:bg-yellow-900/10">
                    <header className="flex items-center justify-between px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-amber-200 dark:border-amber-700/50">
                        <span className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
                            <Plus className="w-4 h-4" /> Доп. работы
                        </span>
                        <span className="text-[11px] font-bold text-amber-500">{extraView.length}</span>
                    </header>
                    <ul className="divide-y divide-amber-100 dark:divide-amber-900/30">
                        {extraView.map((w, i) => (
                            <li key={i} className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800">
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 truncate">{w.object_name}</span>
                                    <span className="block text-sm text-gray-800 dark:text-gray-100 truncate">{w.name}</span>
                                </span>
                                <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">{w.unit}</span>
                                <span className="w-16 text-right text-sm font-bold text-gray-900 dark:text-white">{w.volume}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onEdit?.('hours')}
                        disabled={submitting}
                        className="px-4 py-3.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors disabled:opacity-60 active:scale-[0.99] flex items-center gap-2"
                        title="Изменить часы"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Редактировать&nbsp;</span>часы
                    </button>
                    <button
                        type="button"
                        onClick={() => onEdit?.('works')}
                        disabled={submitting}
                        className="px-4 py-3.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors disabled:opacity-60 active:scale-[0.99] flex items-center gap-2"
                        title="Изменить работы"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Редактировать&nbsp;</span>работы
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
                >
                    {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Отправка…</>
                    ) : addendumMode ? (
                        <><Plus className="w-4 h-4" /> Сохранить доп. отчёт</>
                    ) : editReadyMode ? (
                        <><Save className="w-4 h-4" /> Сохранить изменения</>
                    ) : approveMode ? (
                        <><Check className="w-4 h-4" /> Одобрить отчёт</>
                    ) : (
                        <><Send className="w-4 h-4" /> Отправить отчёт</>
                    )}
                </button>
            </div>
        </div>
    );
}

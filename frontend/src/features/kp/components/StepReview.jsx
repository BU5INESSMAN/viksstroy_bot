import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Send, Clock, Hammer, Plus, Loader2, Check } from 'lucide-react';

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
        for (const h of hoursData) selected.set(`${h.team_id}:${h.user_id}`, h.hours);

        const out = [];
        for (const t of teams) {
            const rows = (t.members || [])
                .map(m => ({
                    ...m,
                    hours: selected.get(`${t.team_id}:${m.user_id}`) || 0,
                }))
                .filter(m => m.hours > 0);
            if (rows.length > 0) {
                out.push({ team_id: t.team_id, team_name: t.team_name, members: rows });
            }
        }
        return out;
    }, [teams, hoursData]);

    const worksView = useMemo(() => {
        const byId = new Map();
        for (const w of worksData) byId.set(Number(w.kp_id), Number(w.volume));
        return planItems
            .filter(i => byId.has(Number(i.kp_id)))
            .map(i => ({
                name: i.name,
                unit: i.unit || '',
                volume: byId.get(Number(i.kp_id)),
            }));
    }, [planItems, worksData]);

    const extraView = useMemo(() => {
        const catalogMap = new Map();
        for (const c of catalog) catalogMap.set(Number(c.id), c);
        return (extraWorksData || [])
            .filter(e => Number(e.volume) > 0)
            .map(e => {
                const c = e.kp_id ? catalogMap.get(Number(e.kp_id)) : null;
                return {
                    name: e.name || c?.name || '',
                    unit: e.unit || c?.unit || '',
                    volume: Number(e.volume),
                };
            });
    }, [extraWorksData, catalog]);

    if (loading) {
        return <div className="text-center py-12 text-gray-400 dark:text-gray-500">Загрузка…</div>;
    }

    const totalMembers = hoursByTeam.reduce((a, t) => a + t.members.length, 0);
    const totalHours = hoursByTeam.reduce((a, t) => a + t.members.reduce((s, m) => s + Number(m.hours || 0), 0), 0);

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
                    <span className="text-[11px] font-bold text-gray-400">
                        {totalMembers} чел · {totalHours.toFixed(1)} ч
                    </span>
                </header>
                {hoursByTeam.length === 0 ? (
                    <p className="text-center text-sm italic text-gray-400 dark:text-gray-500 py-6">
                        Часы не заполнены
                    </p>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {hoursByTeam.map(t => (
                            <div key={t.team_id}>
                                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50/60 dark:bg-gray-900/30">
                                    {t.team_name}
                                </div>
                                <ul className="divide-y divide-gray-50 dark:divide-gray-700/40">
                                    {t.members.map(m => (
                                        <li key={m.user_id} className="flex items-center gap-3 px-4 py-2">
                                            <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                                                {m.fio}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 min-w-0 truncate">
                                                {m.specialty || '—'}
                                            </span>
                                            <span className="w-16 text-right text-sm font-bold text-gray-900 dark:text-white">
                                                {Number(m.hours).toFixed(1)} ч
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
                                <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{w.name}</span>
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
                                <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{w.name}</span>
                                <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">{w.unit}</span>
                                <span className="w-16 text-right text-sm font-bold text-gray-900 dark:text-white">{w.volume}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onEdit}
                    disabled={submitting}
                    className="px-5 py-3.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors disabled:opacity-60 active:scale-[0.99] flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" /> Редактировать
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
                >
                    {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Отправка…</>
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

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { X, Save, RefreshCw, Plus, AlertTriangle } from 'lucide-react';
import ModalPortal from '../../../components/ui/ModalPortal';
import ExtraWorksPicker from './ExtraWorksPicker';

const keyOf = r => `${r.source_application_id || r.application_id}:${r.team_id || 0}`;
const amount = n => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const freshOperation = () => globalThis.crypto?.randomUUID?.() || `smr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Edit persisted rows, never seed an additive form with existing totals. */
export default function SMRReadyEditor({ appId, onClose, onSubmitted, userRole }) {
    const [state, setState] = useState(null);
    const [rows, setRows] = useState({ hours: [], plan_works: [], extra_works: [] });
    const [catalog, setCatalog] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [newWorks, setNewWorks] = useState({});
    const [newHours, setNewHours] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [searchWorker, setSearchWorker] = useState('');
    const [workerObject, setWorkerObject] = useState('');
    const operation = useRef(null);
    const submitting = useRef(false);
    const finance = ['moderator', 'boss', 'superadmin', 'hr'].includes(userRole);

    useEffect(() => {
        let active = true;
        setState(null); setError('');
        Promise.all([
            axios.get(`/api/kp/apps/${appId}/smr/editor`),
            axios.get('/api/kp/catalog'),
            axios.get(`/api/kp/apps/${appId}/available_workers`),
        ]).then(([response, prices, workers]) => {
            if (!active) return;
            const value = response.data;
            setState(value);
            setRows({ hours: value.report.hours, plan_works: value.report.plan_works, extra_works: value.report.extra_works });
            setNewWorks({});
            setNewHours(value.sections.filter(s => s.status !== 'not_worked').flatMap(s => s.roster
                .filter(m => !value.report.hours.some(h => (h.source_application_id || h.application_id) === s.application_id && h.team_id === s.team_id && h.member_id === m.member_id))
                .map(m => ({ application_id: s.application_id, team_id: s.team_id, team_name: s.team_name, member_id: m.member_id, fio: m.fio, hours: '', participant_salary: 0 }))));
            setCatalog(prices.data || []); setCandidates(workers.data || []);
            setWorkerObject(String(value.report.application_ids[0]));
            operation.current = null;
        }).catch(e => { if (active) setError(e.response?.data?.detail || 'Не удалось загрузить отчёт'); });
        return () => { active = false; };
    }, [appId, reload]);

    const sections = useMemo(() => {
        const result = new Map();
        const add = r => {
            const key = keyOf(r);
            if (!result.has(key)) result.set(key, { key, application_id: Number(key.split(':')[0]), team_id: Number(r.team_id || 0), team_name: r.team_name || 'Общие работы' });
        };
        state?.sections.forEach(add);
        [...rows.hours, ...rows.plan_works, ...rows.extra_works, ...newHours].forEach(add);
        return [...result.values()];
    }, [state, rows, newHours]);

    const update = (kind, id, field, value) => {
        operation.current = null;
        setRows(prev => ({ ...prev, [kind]: prev[kind].map(r => r.id === id ? { ...r, [field]: value } : r) }));
    };
    const totalHours = [...rows.hours, ...newHours].reduce((sum, r) => sum + Number(r.hours || 0), 0);
    const totalPay = [...rows.hours, ...newHours].reduce((sum, r) => sum + Number(r.participant_salary || 0), 0);
    const reloadFromServer = () => {
        if (state && !window.confirm('Загрузить свежую версию? Несохранённые изменения в этом окне будут отменены.')) return;
        setReload(v => v + 1);
    };
    const save = async () => {
        if (submitting.current || !state) return;
        const changes = {};
        for (const kind of ['hours', 'plan_works', 'extra_works']) {
            const field = kind === 'hours' ? 'hours' : 'volume';
            changes[kind] = rows[kind].filter(r => {
                const old = state.report[kind].find(v => v.id === r.id);
                return r[field] !== old[field] || r.participant_salary !== old.participant_salary;
            }).map(r => ({ id: r.id, [field]: r[field], ...(kind === 'hours' ? { participant_salary: r.participant_salary } : {}) }));
        }
        const invalid = [...rows.hours, ...newHours].some(r => r.hours === '' || r.hours == null || !Number.isFinite(Number(r.hours)) || Number(r.hours) < 0 || Number(r.hours) > 24)
            || [...rows.plan_works, ...rows.extra_works].some(r => r.volume === '' || !Number.isFinite(Number(r.volume)) || Number(r.volume) < 0);
        if (invalid) return toast.error('Заполните часы и объёмы. 0 допустим; пустое поле — нет.');
        operation.current ||= freshOperation();
        const payload = {
            action: 'edit', ready_edit: true, editor_revision: state.editor_revision,
            operation_id: operation.current, changes, new_hours: newHours,
            new_works: Object.entries(newWorks).flatMap(([key, values]) => values.map(v => ({
                application_id: Number(key.split(':')[0]), team_id: Number(key.split(':')[1]), kp_id: v.kp_id, volume: v.volume,
            }))),
        };
        submitting.current = true; setBusy(true); setError('');
        try {
            await axios.post(`/api/kp/apps/${appId}/smr/review`, payload);
            toast.success('Отчёт сохранён'); onSubmitted?.(); onClose();
        } catch (e) {
            setError(e.response?.data?.detail || 'Не удалось подтвердить сохранение. Повторите: операция не продублируется.');
        } finally { submitting.current = false; setBusy(false); }
    };
    const inputClass = 'w-24 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-2 text-right';
    const numeric = (kind, row, field, label) => <label className="flex items-center gap-2 text-xs shrink-0">
        {label}<input type="number" min="0" max={field === 'hours' ? 24 : undefined} step={field === 'participant_salary' ? '0.01' : '0.001'}
            disabled={busy} aria-label={`${label}: ${row.fio || row.name}`} className={inputClass} value={row[field] ?? ''}
            onChange={e => update(kind, row.id, field, e.target.value)} placeholder="Не задано" />
    </label>;

    return <ModalPortal><div className="fixed inset-0 z-[9998] bg-black/60 flex items-center justify-center px-3"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="bg-white dark:bg-gray-800 dark:text-white rounded-2xl w-full max-w-4xl flex flex-col min-h-0 shadow-2xl"
            style={{ maxHeight: 'calc(100dvh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom)))' }}>
            <header className="p-4 border-b dark:border-gray-700 flex items-start gap-3 shrink-0">
                <div className="min-w-0 flex-1"><h2 className="font-bold text-lg">Редактирование полного СМР</h2>
                    <p className="text-xs text-gray-500 mt-1">Основная часть и все дополнения. Изменения заменяют значения, а не прибавляются к ним.</p></div>
                <button type="button" disabled={busy} onClick={onClose} className="p-2 shrink-0" aria-label="Закрыть"><X /></button>
            </header>
            <div className="overflow-y-auto min-h-0 p-4 space-y-4">
                {error && <div role="alert" className="rounded-xl bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 p-3 text-sm"><AlertTriangle className="inline w-4 h-4 mr-2" />{error}
                    <button onClick={reloadFromServer} disabled={busy} className="block mt-2 underline">Загрузить свежую версию</button></div>}
                {!state && !error && <p>Загрузка полного отчёта…</p>}
                {state && <>
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-950 p-3 text-sm flex flex-wrap gap-x-6 gap-y-2">
                        <span>Человеко-часы: <b>{amount(totalHours)}</b></span><span>ЗП участникам: <b>{amount(totalPay)} ₽</b></span>
                        {finance && <span>Сохранённая стоимость СМР: <b>{amount(state.report.totals.price)} ₽</b></span>}
                    </div>
                    <p className="text-xs text-gray-500">Цены существующих работ сохраняются. При изменении объёмов итоги пересчитаются после сохранения. Для не работавшего сотрудника укажите 0.</p>
                    {sections.map(section => {
                        const context = state.report.applications.find(a => a.id === section.application_id);
                        const hours = rows.hours.filter(r => keyOf(r) === section.key);
                        const works = ['plan_works', 'extra_works'].flatMap(kind => rows[kind].filter(r => keyOf(r) === section.key).map(r => ({ ...r, kind })));
                        return <section key={section.key} className="border dark:border-gray-700 rounded-xl overflow-hidden">
                            <h3 className="font-bold bg-gray-50 dark:bg-gray-900 p-3 break-words">{context?.object_name} · {section.team_name}
                                <span className="block text-xs font-normal text-gray-500 mt-1">{context?.application_label} · {context?.date_target?.split('-').reverse().join('.')}</span></h3>
                            <div className="p-3 space-y-3">
                                {hours.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 border-b dark:border-gray-700 pb-3">
                                    <div className="flex-1 min-w-44"><p className="text-sm font-medium">{row.fio || `Сотрудник #${row.member_id}`}</p>
                                        <p className="text-xs text-gray-500">{row.is_additional ? 'Дополнение' : 'Основная часть'}{row.filled_at ? ` · ${row.filled_at.slice(0, 10).split('-').reverse().join('.')}` : ''}</p></div>
                                    {numeric('hours', row, 'hours', 'Часы')}{numeric('hours', row, 'participant_salary', 'ЗП, ₽')}
                                </div>)}
                                {newHours.filter(r => keyOf(r) === section.key).map(row => <div key={row.member_id} className="flex flex-wrap gap-2 items-center">
                                    <span className="flex-1 text-sm">{row.fio} · часы ещё не сохранены</span>
                                    <label className="text-xs">Часы <input className={inputClass} type="number" min="0" max="24" value={row.hours} disabled={busy} placeholder="Не задано"
                                        onChange={e => { operation.current = null; setNewHours(prev => prev.map(r => r === row ? { ...r, hours: e.target.value } : r)); }} /></label>
                                    <button disabled={busy} className="text-xs underline" onClick={() => { operation.current = null; setNewHours(prev => prev.filter(r => r !== row)); }}>Убрать</button>
                                </div>)}
                                {works.map(row => <div key={`${row.kind}:${row.id}`} className="flex flex-wrap items-center gap-2">
                                    <div className="flex-1 min-w-44 text-sm"><p>{row.name}</p><p className="text-xs text-gray-500">{row.is_additional ? 'Дополнение' : 'Основная часть'} · {row.unit}</p></div>
                                    {numeric(row.kind, row, 'volume', 'Объём')}
                                </div>)}
                                {!works.length && <p className="text-xs text-gray-500">У этой бригады нет сохранённых работ.</p>}
                                {section.team_id > 0 && <ExtraWorksPicker catalog={catalog} selected={newWorks[section.key] || []} disabled={busy}
                                    onChange={value => { operation.current = null; setNewWorks(prev => ({ ...prev, [section.key]: value })); }} />}
                            </div>
                        </section>;
                    })}
                    <details className="border dark:border-gray-700 rounded-xl p-3"><summary className="cursor-pointer text-sm font-bold"><Plus className="inline w-4 h-4" /> Добавить сотрудника</summary>
                        <div className="mt-3 space-y-2">
                            <select aria-label="Объект сотрудника" className="w-full p-2 border rounded-lg dark:bg-gray-900" value={workerObject} disabled={busy} onChange={e => setWorkerObject(e.target.value)}>
                                {state.report.applications.map(a => <option value={a.id} key={a.id}>{a.object_name} · {a.application_label}</option>)}
                            </select>
                            <input aria-label="Поиск сотрудника" placeholder="Поиск сотрудника" className="w-full p-2 border rounded-lg dark:bg-gray-900" value={searchWorker} onChange={e => setSearchWorker(e.target.value)} />
                            <div className="max-h-48 overflow-y-auto">{candidates.filter(w => !newHours.some(h => h.member_id === w.member_id) && `${w.fio} ${w.team_name}`.toLowerCase().includes(searchWorker.toLowerCase())).slice(0, 50).map(w => <button key={w.member_id} disabled={busy} className="block w-full text-left text-sm p-2 hover:bg-blue-50 dark:hover:bg-gray-700" onClick={() => {
                                operation.current = null; setNewHours(prev => [...prev, { application_id: Number(workerObject), team_id: w.team_id, team_name: w.team_name, member_id: w.member_id, fio: w.fio, hours: '', participant_salary: 0 }]);
                            }}>{w.fio} · {w.team_name}</button>)}</div>
                        </div>
                    </details>
                </>}
            </div>
            <footer className="border-t dark:border-gray-700 p-3 shrink-0 flex flex-wrap gap-2 justify-between">
                <button disabled={busy} onClick={reloadFromServer} className="px-3 py-2 text-sm flex gap-2 items-center"><RefreshCw className="w-4 h-4" />Обновить данные</button>
                <button disabled={busy || !state} onClick={save} className="bg-blue-600 text-white rounded-xl px-5 py-3 font-bold flex gap-2 items-center disabled:opacity-50"><Save className="w-4 h-4" />{busy ? 'Сохранение…' : 'Сохранить'}</button>
            </footer>
        </div>
    </div></ModalPortal>;
}

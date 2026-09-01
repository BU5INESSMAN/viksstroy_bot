import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    AlertTriangle, CheckCircle2, Database, GitMerge, History,
    RefreshCw, Save, Search, UserRoundCheck, Users, X,
} from 'lucide-react';

function Metric({ icon, label, value, tone = 'blue' }) {
    const IconComponent = icon;
    const tones = {
        blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
        red: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
        green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    };
    return (
        <div className={`rounded-2xl p-4 ${tones[tone] || tones.blue}`}>
            <div className="flex items-center gap-2 text-xs font-bold opacity-80"><IconComponent className="w-4 h-4" /> {label}</div>
            <div className="mt-2 text-2xl font-black">{value ?? 0}</div>
        </div>
    );
}

function IdentityEditor({ identity, onSaved }) {
    const [fio, setFio] = useState(identity.canonical_fio || '');
    const [position, setPosition] = useState(identity.position || '');
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        try {
            await axios.patch(`/api/admin/employee-identities/${identity.id}`, {
                canonical_fio: fio,
                position,
                notes: identity.notes || '',
            });
            toast.success('ФИО восстановлено');
            onSaved();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Не удалось сохранить');
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                <span className="font-bold">Историческая карточка #{identity.id}</span>
                <span>ID сотрудников: {(identity.member_ids || []).join(', ') || '—'}</span>
                <span>строк часов: {identity.hour_rows || 0}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                <input value={fio} onChange={(event) => setFio(event.target.value)} placeholder="Полное ФИО" className="min-h-11 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 px-3 text-sm" />
                <input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="Должность" className="min-h-11 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 px-3 text-sm" />
                <button type="button" disabled={busy || fio.trim().length < 3} onClick={save} className="min-h-11 rounded-xl bg-amber-600 text-white px-4 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    <Save className="w-4 h-4" /> Сохранить
                </button>
            </div>
        </div>
    );
}

export default function EmployeeAuditPanel() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [mergeGroup, setMergeGroup] = useState(null);
    const [targetId, setTargetId] = useState(null);
    const [confirmation, setConfirmation] = useState('');
    const [mergeBusy, setMergeBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/admin/employee-audit');
            setData(response.data || {});
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Не удалось провести аудит сотрудников');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const identities = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('ru');
        if (!needle) return data?.identities || [];
        return (data?.identities || []).filter((item) => [
            item.canonical_fio, item.position, ...(item.member_ids || []), item.linked_user_id,
        ].join(' ').toLocaleLowerCase('ru').includes(needle));
    }, [data, query]);

    const openMerge = (group) => {
        setMergeGroup(group);
        setTargetId(group.identities?.[0]?.id || null);
        setConfirmation('');
    };

    const merge = async () => {
        const sources = (mergeGroup?.identities || []).map((item) => item.id).filter((id) => id !== targetId);
        if (!targetId || !sources.length) return;
        setMergeBusy(true);
        try {
            await axios.post('/api/admin/employee-identities/merge', {
                target_identity_id: targetId,
                source_identity_ids: sources,
                confirmation,
            });
            toast.success('Карточки объединены без потери истории');
            setMergeGroup(null);
            await load();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Не удалось объединить карточки');
        } finally {
            setMergeBusy(false);
        }
    };

    const metrics = data?.metrics || {};
    return (
        <section id="admin-employee-audit" className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Database className="w-5 h-5 text-indigo-500" /> Аудит сотрудников</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Текущие и удалённые карточки объединяются в устойчивые личности без переписывания истории СМР.</p>
                </div>
                <button type="button" onClick={load} disabled={loading} className="min-h-11 rounded-xl border border-gray-200 dark:border-gray-700 px-4 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Перепроверить
                </button>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                    <Metric icon={Users} label="Текущие карточки" value={metrics.current_cards} />
                    <Metric icon={UserRoundCheck} label="Личности" value={metrics.identities} tone="green" />
                    <Metric icon={History} label="Исторические ID" value={metrics.historical_cards} />
                    <Metric icon={AlertTriangle} label="Не распознано" value={metrics.unresolved} tone={metrics.unresolved ? 'red' : 'green'} />
                    <Metric icon={GitMerge} label="Группы дублей" value={metrics.duplicate_groups} tone={metrics.duplicate_groups ? 'amber' : 'green'} />
                    <Metric icon={Database} label="Старые строки часов" value={metrics.orphan_hour_rows} tone={metrics.orphan_hour_rows ? 'amber' : 'green'} />
                </div>

                {(data?.duplicates || []).length > 0 && (
                    <div className="space-y-3">
                        <div>
                            <h4 className="font-bold text-gray-900 dark:text-white">Возможные дубли</h4>
                            <p className="text-xs text-gray-500 mt-1">Объединение выполняется только вручную. Разные связанные MAX-аккаунты объединить нельзя.</p>
                        </div>
                        {(data.duplicates || []).map((group) => (
                            <div key={group.key} className="rounded-2xl border border-amber-200 dark:border-amber-800/60 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="font-bold text-amber-900 dark:text-amber-200">{group.key}</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {group.identities.map((identity) => (
                                            <span key={identity.id} className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200">#{identity.id} {identity.canonical_fio} · ID: {(identity.member_ids || []).join(', ')}</span>
                                        ))}
                                    </div>
                                </div>
                                <button type="button" onClick={() => openMerge(group)} className="min-h-11 flex-shrink-0 rounded-xl bg-amber-600 text-white px-4 text-sm font-bold flex items-center justify-center gap-2"><GitMerge className="w-4 h-4" /> Проверить и объединить</button>
                            </div>
                        ))}
                    </div>
                )}

                {(data?.unresolved || []).length > 0 && (
                    <div className="space-y-3">
                        <div><h4 className="font-bold text-gray-900 dark:text-white">Не удалось восстановить ФИО</h4><p className="text-xs text-gray-500 mt-1">После заполнения эти строки автоматически исправятся во всех новых отчётах за период.</p></div>
                        {data.unresolved.map((identity) => <IdentityEditor key={identity.id} identity={identity} onSaved={load} />)}
                    </div>
                )}

                {(data?.incomplete_current || []).length > 0 && (
                    <div className="rounded-2xl border border-red-200 dark:border-red-800/60 p-4">
                        <h4 className="font-bold text-red-800 dark:text-red-300">Неполные действующие ФИО</h4>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {data.incomplete_current.map((member) => <a key={member.id} href={`/resources?tab=teams&search=${encodeURIComponent(member.fio || member.id)}`} className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs font-bold text-red-700 dark:text-red-300">{member.fio || `Сотрудник #${member.id}`} · {member.team_name || 'без бригады'}</a>)}
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по ФИО, должности или внутреннему ID" className="w-full min-h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-10 pr-3 text-sm" /></div>
                    <div className="max-h-80 overflow-y-auto rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                        {identities.map((identity) => (
                            <div key={identity.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                                <div className="min-w-0"><div className="font-bold text-gray-900 dark:text-white truncate">{identity.canonical_fio}</div><div className="text-xs text-gray-500 truncate">{identity.position || 'Должность не указана'} · ID карточек: {(identity.member_ids || []).join(', ') || '—'}</div></div>
                                {identity.status === 'unresolved' ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {mergeGroup && (
                <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMergeGroup(null)}>
                    <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-gray-800 shadow-2xl p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-bold text-gray-900 dark:text-white">Объединение карточек</h4><p className="text-xs text-gray-500 mt-1">Выберите правильное ФИО — оно останется основным во всех отчётах.</p></div><button onClick={() => setMergeGroup(null)} className="w-10 h-10 rounded-xl flex items-center justify-center"><X className="w-5 h-5" /></button></div>
                        <div className="mt-4 space-y-2">{mergeGroup.identities.map((identity) => <label key={identity.id} className={`block rounded-xl border p-3 cursor-pointer ${targetId === identity.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-gray-200 dark:border-gray-700'}`}><input type="radio" name="target-identity" className="mr-2" checked={targetId === identity.id} onChange={() => setTargetId(identity.id)} /><span className="font-bold text-sm">{identity.canonical_fio}</span><span className="block ml-6 mt-1 text-xs text-gray-500">Карточки: {(identity.member_ids || []).join(', ')} · строк часов: {identity.hour_rows || 0}</span></label>)}</div>
                        <label className="block mt-4"><span className="text-xs font-bold text-gray-500">Для подтверждения напишите ОБЪЕДИНИТЬ</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm" /></label>
                        <button type="button" disabled={mergeBusy || confirmation.trim().toLocaleUpperCase('ru') !== 'ОБЪЕДИНИТЬ'} onClick={merge} className="mt-4 w-full min-h-12 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"><GitMerge className="w-5 h-5" /> {mergeBusy ? 'Объединение…' : 'Объединить без потери истории'}</button>
                    </div>
                </div>
            )}
        </section>
    );
}

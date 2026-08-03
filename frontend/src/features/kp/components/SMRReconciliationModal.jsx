import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    AlertTriangle, CheckCircle2, Clock3, FileClock, RefreshCw,
    Scale, X,
} from 'lucide-react';
import ModalPortal from '../../../components/ui/ModalPortal';

const money = (value) => `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const number = (value) => Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

const EVENT_LABELS = {
    hours_updated: 'Изменены часы',
    smr_submitted: 'СМР сохранено',
    smr_addendum_created: 'Добавлен доп. отчёт',
    smr_review_edited: 'Правки при проверке',
    smr_accounted: 'Отмечено учтённым',
    smr_unaccounted: 'Снята отметка «Учтено»',
    volumes_updated: 'Изменены объёмы',
    legacy_smr_submitted: 'СМР сохранено',
    legacy_smr_review_edited: 'Правки при проверке',
    legacy_extra_works_updated: 'Изменены доп. работы',
};

export default function SMRReconciliationModal({ apps = [], onClose, onOpenApp }) {
    const options = useMemo(() => apps.filter((app) => app?.id), [apps]);
    const [selectedId, setSelectedId] = useState(options[0]?.id || '');
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(Boolean(options[0]?.id));
    const [error, setError] = useState('');

    useEffect(() => {
        axios.get('/api/kp/catalog/versions?limit=10')
            .then((response) => setVersions(response.data?.items || []))
            .catch(() => setVersions([]));
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        let cancelled = false;
        Promise.all([
            axios.get(`/api/kp/apps/${selectedId}/smr/reconciliation`),
            axios.get(`/api/kp/apps/${selectedId}/smr/audit?limit=30`),
        ]).then(([reconciliation, audit]) => {
            if (cancelled) return;
            setResult(reconciliation.data || null);
            setHistory(audit.data?.items || []);
        }).catch((requestError) => {
            if (cancelled) return;
            setResult(null);
            setHistory([]);
            setError(requestError?.response?.data?.detail || 'Не удалось выполнить сверку');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedId]);

    const latestVersion = versions[0];
    const issueCount = (result?.discrepancies?.length || 0) + (result?.missing_catalog_rows?.length || 0);

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-6">
                <div className="min-h-full flex items-start justify-center">
                    <div className="w-full max-w-5xl bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
                        <header className="flex items-start gap-3 p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800">
                            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
                                <Scale className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="font-extrabold text-lg sm:text-xl text-gray-900 dark:text-white">Сверка СМР</h2>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    Сохранённые значения сравниваются с действующим справочником цен
                                </p>
                            </div>
                            <button onClick={onClose} className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0" aria-label="Закрыть">
                                <X className="w-5 h-5" />
                            </button>
                        </header>

                        <div className="p-4 sm:p-6 space-y-5 max-h-[calc(100dvh-7rem)] overflow-y-auto custom-scrollbar">
                            <div className="flex flex-col md:flex-row md:items-end gap-3">
                                <label className="block min-w-0 flex-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                                    Готовая заявка
                                    <select
                                        value={selectedId}
                                        onChange={(event) => {
                                            setLoading(true);
                                            setError('');
                                            setSelectedId(event.target.value);
                                        }}
                                        disabled={options.length === 0}
                                        className="mt-1.5 w-full min-h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white disabled:opacity-60"
                                    >
                                        {options.length === 0 && <option value="">Нет готовых заявок</option>}
                                        {options.map((app) => (
                                            <option key={app.id} value={app.id}>
                                                №{app.id} · {app.object_name || app.obj_name || app.object_address || 'Без объекта'} · {app.date_target || 'без даты'}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <div className="min-h-11 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <FileClock className="w-4 h-4 flex-shrink-0" />
                                    {latestVersion ? `Прайс №${latestVersion.version_number} · ${latestVersion.row_count} позиций` : 'Версии прайса пока нет'}
                                </div>
                            </div>

                            {options.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                    Готовых заявок для сверки пока нет.
                                </div>
                            )}

                            {loading && (
                                <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                                    <RefreshCw className="w-7 h-7 animate-spin" />
                                    <span className="text-sm">Сверяем данные…</span>
                                </div>
                            )}

                            {!loading && error && (
                                <div className="rounded-2xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0" /> {error}
                                </div>
                            )}

                            {!loading && result && (
                                <>
                                    <div className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center gap-3 ${issueCount ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800'}`}>
                                        {issueCount ? <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" /> : <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-gray-900 dark:text-white">
                                                {issueCount ? `Найдено расхождений: ${issueCount}` : 'Расхождений с текущим прайсом нет'}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                                                {result.object_name || 'Объект'} · заявка {result.application_ids?.map((id) => `№${id}`).join(', ')}
                                            </p>
                                        </div>
                                        <button onClick={() => onOpenApp?.(Number(selectedId))} className="min-h-10 px-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                            Открыть СМР
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <Metric label="Часы" value={`${number(result.totals?.hours)} ч`} />
                                        <Metric label="Сумма ЗП" value={money(result.totals?.salary)} />
                                        <Metric label="Стоимость" value={money(result.totals?.price)} />
                                    </div>

                                    {result.discrepancies?.length > 0 && (
                                        <section className="space-y-2">
                                            <h3 className="font-bold text-gray-900 dark:text-white">Расхождения ставок и цен</h3>
                                            {result.discrepancies.map((row) => (
                                                <div key={`${row.section}-${row.row_id}`} className="rounded-2xl border border-amber-200 dark:border-amber-800/60 p-4 bg-amber-50/40 dark:bg-amber-900/10">
                                                    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                                                        <p className="font-bold text-sm text-gray-900 dark:text-white break-words flex-1 min-w-0">{row.name}</p>
                                                        <span className="text-xs text-gray-500 whitespace-nowrap">Объём: {number(row.volume)}</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-xs">
                                                        <DeltaRow label="ЗП за единицу" stored={row.stored_salary_rate} current={row.catalog_salary_rate} delta={row.salary_total_delta} />
                                                        <DeltaRow label="Цена за единицу" stored={row.stored_price_rate} current={row.catalog_price_rate} delta={row.price_total_delta} />
                                                    </div>
                                                </div>
                                            ))}
                                        </section>
                                    )}

                                    {result.missing_catalog_rows?.length > 0 && (
                                        <Notice title="Позиции удалены из текущего справочника" rows={result.missing_catalog_rows} tone="red" />
                                    )}
                                    {result.custom_rows?.length > 0 && (
                                        <Notice title="Ручные дополнительные работы" rows={result.custom_rows} tone="blue" />
                                    )}

                                    <section className="space-y-2">
                                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Clock3 className="w-4 h-4" /> Финансовая история</h3>
                                        {history.length === 0 ? (
                                            <p className="text-sm text-gray-400 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4">История появится после следующего изменения СМР.</p>
                                        ) : history.map((entry) => (
                                            <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 text-sm">
                                                <span className="font-semibold text-gray-800 dark:text-gray-200 flex-1 min-w-0 break-words">{EVENT_LABELS[entry.event_type] || entry.event_type}</span>
                                                <span className="text-xs text-gray-500 break-words">{entry.actor_name || 'Система'}</span>
                                                <span className="text-xs text-gray-400 whitespace-nowrap">{String(entry.created_at || '').replace('T', ' ').slice(0, 16)}</span>
                                            </div>
                                        ))}
                                    </section>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}

function Metric({ label, value }) {
    return <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4"><p className="text-xs text-gray-500">{label}</p><p className="font-extrabold text-lg text-gray-900 dark:text-white mt-1 break-words">{value}</p></div>;
}

function DeltaRow({ label, stored, current, delta }) {
    return (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
            <p className="font-bold text-gray-700 dark:text-gray-200">{label}</p>
            <p className="text-gray-500 mt-1 break-words">В СМР: {money(stored)} · в прайсе: {money(current)}</p>
            <p className={`font-bold mt-1 ${Number(delta) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Итоговая дельта: {money(delta)}</p>
        </div>
    );
}

function Notice({ title, rows, tone }) {
    const classes = tone === 'red' ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10' : 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10';
    return (
        <section className={`rounded-2xl border p-4 ${classes}`}>
            <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
            <div className="mt-2 space-y-1.5">
                {rows.map((row, index) => <p key={`${row.row_id || row.kp_id}-${index}`} className="text-sm text-gray-700 dark:text-gray-300 break-words">{row.name || 'Без названия'} · {number(row.volume)} {row.unit || ''}</p>)}
            </div>
        </section>
    );
}

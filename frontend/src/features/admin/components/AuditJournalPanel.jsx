import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, AlertTriangle, ChevronDown, ChevronRight, Download, Gauge, MousePointerClick, RefreshCw, Search, Users } from 'lucide-react';
import { GlassCard, SectionHeader } from '../../system/components/UIHelpers';

const CATEGORY_LABELS = { interaction: 'Действие', navigation: 'Переход', form: 'Форма', api: 'API', error: 'Ошибка', performance: 'Скорость', lifecycle: 'Приложение', friction: 'Неудобство' };
const EVENT_LABELS = { page_view: 'Открыл страницу', click: 'Нажал', rage_click: 'Повторные нажатия', form_submit: 'Отправил форму', field_complete: 'Заполнил поле', invalid_field: 'Ошибка поля', long_field_edit: 'Долго заполнял поле', api_failure: 'Ошибка запроса', javascript_error: 'Ошибка интерфейса', react_render_error: 'Сбой экрана', unhandled_rejection: 'Сбой операции', http_request: 'Запрос к серверу', server_exception: 'Ошибка сервера', performance_snapshot: 'Замер скорости', app_start: 'Запустил приложение', app_exit: 'Закрыл приложение', network_offline: 'Пропала сеть' };

const formatTime = (value) => {
  if (!value) return '—';
  const raw = String(value).replace(' ', 'T');
  const utc = /Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`;
  return new Date(utc).toLocaleString('ru-RU', { timeZone: 'Asia/Barnaul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

function Stat({ icon, label, value, tone = 'blue' }) {
  const colors = { blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30', red: 'text-red-600 bg-red-100 dark:bg-red-900/30', amber: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', violet: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30' };
  return <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 p-3 flex items-center gap-3"><span className={`rounded-lg p-2 ${colors[tone]}`}>{icon}</span><div><div className="text-lg font-extrabold text-gray-900 dark:text-white">{value}</div><div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{label}</div></div></div>;
}

export default function AuditJournalPanel() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [outcome, setOutcome] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { days, limit: 150, ...(search.trim() ? { search: search.trim() } : {}), ...(category ? { category } : {}), ...(outcome ? { outcome } : {}) };
      const [summaryRes, eventsRes] = await Promise.all([axios.get('/api/audit/summary', { params: { days } }), axios.get('/api/audit/events', { params })]);
      setSummary(summaryRes.data); setEvents(eventsRes.data.events || []); setTotal(eventsRes.data.total || 0);
    } finally { setLoading(false); }
  }, [days, search, category, outcome]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  const totals = summary?.totals || {};

  return <GlassCard className="p-5 sm:p-7 overflow-hidden">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div><SectionHeader icon={Activity} iconColor="text-violet-500 bg-violet-500" title="Большой журнал аудита" /><p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">Действия, ошибки, задержки и признаки неудобного интерфейса. Значения полей и секреты не записываются.</p></div>
      <div className="flex gap-2 flex-wrap">{[2, 7, 30].map((value) => <button key={value} onClick={() => setDays(value)} className={`px-3 py-2 rounded-lg text-xs font-bold ${days === value ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{value === 2 ? '2 дня' : `${value} дней`}</button>)}<button onClick={load} disabled={loading} aria-label="Обновить аудит" className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button><a href={`/api/audit/export.csv?days=${days}`} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><Download className="w-3.5 h-3.5" /> CSV</a></div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-5">
      <Stat icon={<MousePointerClick className="w-4 h-4" />} label="Событий" value={totals.events || 0} />
      <Stat icon={<Users className="w-4 h-4" />} label="Пользователей" value={totals.users || 0} tone="violet" />
      <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Ошибок / отказов" value={`${totals.errors || 0} / ${totals.rejected || 0}`} tone="red" />
      <Stat icon={<Gauge className="w-4 h-4" />} label="95% времени" value={`${totals.p95_ms || 0} мс`} tone="amber" />
    </div>

    {summary?.insights?.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 p-4"><div className="text-sm font-extrabold text-amber-900 dark:text-amber-200 mb-2">Что стоит проверить</div><div className="grid sm:grid-cols-2 gap-2">{summary.insights.map((item, index) => <div key={`${item.kind}-${index}`} className="rounded-lg bg-white/70 dark:bg-gray-900/40 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-gray-900 dark:text-white break-all">{item.title}</span><span className="text-[10px] bg-amber-200/70 dark:bg-amber-900/50 rounded-full px-2 py-0.5 font-bold">×{item.count}</span></div><p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{item.recommendation}</p></div>)}</div></div>}

    <div className="mt-5 grid sm:grid-cols-[1fr_150px_150px] gap-2">
      <label className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Страница, кнопка, пользователь или ошибка" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-white" /></label>
      <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm dark:text-white"><option value="">Все категории</option>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm dark:text-white"><option value="">Все результаты</option><option value="success">Успешно</option><option value="rejected">Отклонено</option><option value="error">Ошибка</option><option value="abandoned">Прервано</option></select>
    </div>

    <div className="mt-3 text-[11px] text-gray-500">Показано {events.length} из {total}. Для полного разбора скачайте CSV.</div>
    <div className="mt-2 border border-gray-100 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700 max-h-[620px] overflow-auto">
      {events.map((event) => { const isOpen = expanded === event.id; const bad = event.outcome === 'error' || event.outcome === 'rejected'; return <button type="button" key={event.id} onClick={() => setExpanded(isOpen ? null : event.id)} className={`w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 ${bad ? 'border-l-2 border-red-500' : ''}`}>
        <div className="flex items-start gap-2"><span className="mt-0.5 text-gray-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-xs font-extrabold text-gray-900 dark:text-white">{EVENT_LABELS[event.event_name] || event.event_name}</span><span className="text-[10px] rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-gray-500">{CATEGORY_LABELS[event.category] || event.category}</span>{event.duration_ms != null && <span className={`text-[10px] ${event.duration_ms >= 1500 ? 'text-amber-600 font-bold' : 'text-gray-400'}`}>{event.duration_ms} мс</span>}</div><div className="mt-1 text-[11px] text-gray-500 truncate">{formatTime(event.occurred_at)} · {event.user_fio || 'До входа'} ({event.user_role || '—'}) · {event.element || event.route || event.page || event.error_message || '—'}</div>{isOpen && <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-950/50 p-3 text-[11px] text-gray-600 dark:text-gray-300 space-y-1 overflow-hidden"><div><b>Экран:</b> {event.page || '—'}</div><div><b>Маршрут:</b> {event.method} {event.route || '—'} {event.status_code || ''}</div>{event.error_message && <div className="text-red-600 dark:text-red-400 break-words"><b>Ошибка:</b> {event.error_type} — {event.error_message}</div>}<div><b>Версия:</b> {event.app_version || '—'} · <b>Запрос:</b> {event.request_id || '—'}</div><pre className="mt-2 whitespace-pre-wrap break-words text-[10px] text-gray-500">{JSON.stringify({ metadata: event.metadata, client: event.client }, null, 2)}</pre></div>}</div></div>
      </button>; })}
      {!loading && events.length === 0 && <div className="p-8 text-center text-sm text-gray-400">За выбранный период событий пока нет</div>}
    </div>
  </GlassCard>;
}

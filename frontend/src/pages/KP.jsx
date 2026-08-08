import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    FileText, CheckCircle, Search, X, MapPin,
    Download, Save, AlertTriangle, Edit3, Upload, Lock, Settings, Bell, HardHat, Plus, Trash2, Archive,
    Calendar as CalendarIcon, Link2, Link2Off, Eye, EyeOff, CheckCheck, Undo2, Clock, Scale
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KPSkeleton } from '../components/ui/PageSkeletons';
import TabBadge from '../components/ui/TabBadge';
import ExtraWorksPicker, { genRowId } from '../features/kp/components/ExtraWorksPicker';
import SMRWizard from '../features/kp/components/SMRWizard';
import ObjectDisplay from '../components/ui/ObjectDisplay';
import SMRReconciliationModal from '../features/kp/components/SMRReconciliationModal';
import { formatApplicationNumber } from '../utils/applicationNumber';
import { matchesDeepSearch } from '../utils/deepSearch';

// Pull the server-supplied filename out of a Content-Disposition header.
// Honours both `filename*=UTF-8''<pct-encoded>` and plain `filename="…"`.
function parseFilenameFromCD(header, fallback) {
    if (!header) return fallback;
    const star = /filename\*\s*=\s*([^;]+)/i.exec(header);
    if (star) {
        const raw = star[1].trim();
        const m = /^UTF-8''(.+)$/i.exec(raw);
        if (m) {
            try { return decodeURIComponent(m[1].replace(/^"|"$/g, '')); } catch { /* fall through */ }
        }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
    if (plain) return plain[1].trim();
    return fallback;
}

// Group SMR applications by the selected operational view.
function groupSMRItems(items, mode) {
    const groupMap = new Map();
    for (const app of items || []) {
        let key;
        let title;
        let subtitle = '';
        if (mode === 'foreman') {
            key = `foreman:${app.foreman_id || 0}`;
            title = app.foreman_name || 'Без прораба';
        } else if (mode === 'date') {
            key = `date:${app.date_target || '—'}`;
            title = app.date_target || 'Без даты';
        } else {
            const name = app.object_name || app.obj_name || app.object_address || 'Без объекта';
            key = `object:${app.object_id || 0}|${name}`;
            title = name;
            subtitle = app.object_clean_address || (app.object_name ? app.object_address : '') || '';
        }
        if (!groupMap.has(key)) groupMap.set(key, { key, title, subtitle, apps: [] });
        groupMap.get(key).apps.push(app);
    }
    const groups = [...groupMap.values()];
    groups.sort((a, b) => {
        if (mode === 'date') return b.title.localeCompare(a.title, 'ru');
        return a.title.localeCompare(b.title, 'ru');
    });
    for (const group of groups) {
        group.apps.sort((a, b) => {
            const dateCompare = (b.date_target || '').localeCompare(a.date_target || '');
            return dateCompare || Number(b.id || 0) - Number(a.id || 0);
        });
    }
    return groups;
}

export default function KP() {
    const [searchParams, setSearchParams] = useSearchParams();
    const role = localStorage.getItem('user_role') || 'worker';
    const tgId = localStorage.getItem('tg_id') || '0';

    const isOffice = ['moderator', 'boss', 'superadmin', 'hr'].includes(role);
    const canViewFinance = ['moderator', 'boss', 'superadmin', 'hr'].includes(role);
    const isForemanOrBrigadier = ['foreman', 'brigadier'].includes(role);
    // v2.10 доп.отчёт: who may create an addendum (backend re-enforces scope).
    const canCreateAddendum = ['foreman', 'brigadier', 'moderator', 'boss', 'superadmin', 'hr'].includes(role);
    // v2.10: workers get READ-ONLY access to the Готовые tab only — no
    // to_fill/pending tabs, no fill/review/addendum affordances.
    const isViewerOnly = role === 'worker';

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ to_fill: [], pending_review: [], approved: [] });
    const [activeTab, setActiveTab] = useState(() => {
        // Workers can only ever see Готовые — ignore any ?tab= override.
        if (isViewerOnly) return 'approved';
        const tab = searchParams.get('tab');
        if (tab && ['to_fill', 'pending_review', 'approved'].includes(tab)) return tab;
        return isOffice ? 'approved' : 'to_fill';
    });

    useEffect(() => {
        if (isViewerOnly) return;   // workers stay pinned to Готовые
        const tab = searchParams.get('tab');
        if (tab && ['to_fill', 'pending_review', 'approved'].includes(tab)) {
            setActiveTab(tab);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams]);

    const [modalApp, setModalApp] = useState(null);
    const [kpItems, setKpItems] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedForExport, setSelectedForExport] = useState([]);
    const [showSettings, setShowSettings] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [extraWorksCatalog, setExtraWorksCatalog] = useState([]);
    const [extraWorks, setExtraWorks] = useState([]);
    const [smrHours, setSmrHours] = useState([]);
    const [smrTotals, setSmrTotals] = useState(null);
    const [showArchive, setShowArchive] = useState(false);
    const [archivedApps, setArchivedApps] = useState([]);
    // v2.4.5 SMR wizard integration
    const [wizardApp, setWizardApp] = useState(null);
    const [wizardApproveMode, setWizardApproveMode] = useState(false);
    // v2.10 доп.отчёт: addendum-mode wizard + the app picker that opens it.
    const [wizardAddendumMode, setWizardAddendumMode] = useState(false);
    const [showAddendumPicker, setShowAddendumPicker] = useState(false);
    // v2.4.4 SMR merge — only applies to the "to_fill" tab.
    const [mergeSelected, setMergeSelected] = useState([]);
    const [mergeBusy, setMergeBusy] = useState(false);
    const [groupMode, setGroupMode] = useState(() => {
        const saved = localStorage.getItem('smr_group_mode');
        return ['foreman', 'object', 'date'].includes(saved) ? saved : 'object';
    });
    const [showAccounted, setShowAccounted] = useState(false);
    const [accountingBusy, setAccountingBusy] = useState(false);
    const [showReconciliation, setShowReconciliation] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fileInputRef = useRef(null);

    const fetchApps = async ({ showLoader = true } = {}) => {
        if (showLoader) setLoading(true);
        try {
            // v2.4.5: /api/kp/smr/list returns {to_fill, pending, completed}
            // — same shape as before with `pending_review` → `pending` and
            // `approved` → `completed` renamed, so remap for the existing UI.
            const res = await axios.get('/api/kp/smr/list');
            const mapped = {
                to_fill: res.data.to_fill || [],
                pending_review: res.data.pending || [],
                approved: res.data.completed || [],
            };
            setData(mapped);
            if (isViewerOnly) {
                // Workers only have the Готовые tab — never auto-switch them
                // onto the hidden to_fill/pending tabs.
                setActiveTab('approved');
            } else if (mapped[activeTab]?.length === 0) {
                if (mapped.to_fill.length > 0) setActiveTab('to_fill');
                else if (mapped.pending_review.length > 0) setActiveTab('pending_review');
                else if (mapped.approved.length > 0) setActiveTab('approved');
            }
        } catch (e) {
            console.error(e);
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    const fetchArchived = async () => {
        try {
            const res = await axios.get('/api/kp/archived');
            setArchivedApps(res.data || []);
        } catch { setArchivedApps([]); }
    };

    useEffect(() => { fetchApps(); }, [tgId]);

    // Clear merge selection whenever the tab changes away from to_fill
    // or the underlying list refreshes — stale selections are confusing.
    useEffect(() => {
        if (activeTab !== 'to_fill') setMergeSelected([]);
    }, [activeTab]);

    useEffect(() => {
        localStorage.setItem('smr_group_mode', groupMode);
    }, [groupMode]);

    const toggleMergeSelect = (appId) => {
        setMergeSelected(prev => (
            prev.includes(appId) ? prev.filter(x => x !== appId) : [...prev, appId]
        ));
    };

    const handleMerge = async () => {
        if (mergeSelected.length < 2) return;
        setMergeBusy(true);
        try {
            await axios.post('/api/kp/smr/merge', { app_ids: mergeSelected });
            toast.success(`Объединено заявок: ${mergeSelected.length}`);
            setMergeSelected([]);
            await fetchApps();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Не удалось объединить');
        } finally {
            setMergeBusy(false);
        }
    };

    const handleUnmerge = async (appId) => {
        try {
            await axios.post('/api/kp/smr/unmerge', { app_id: appId });
            toast.success('Объединение отменено');
            await fetchApps();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Не удалось отменить');
        }
    };

    const openModal = async (app) => {
        setModalApp(app);
        setIsEditing(false);
        setExtraWorks([]);
        setSmrHours([]);
        setSmrTotals(null);
        try {
            const [summaryRes, catRes] = await Promise.all([
                axios.get(`/api/kp/apps/${app.id}/smr/summary`),
                axios.get('/api/kp/catalog'),
            ]);
            const summary = summaryRes.data || {};
            setKpItems((summary.plan_works || []).map(i => ({
                ...i,
                volume: i.volume || '',
                current_salary: i.current_salary || 0,
                current_price: i.current_price || 0,
            })));
            setSmrHours(summary.hours || []);
            setSmrTotals(summary.totals || null);
            // v2.4.3: catalog for extra works is the global KP catalog.
            setExtraWorksCatalog(catRes.data || []);
            // Restore existing extra works. Legacy rows may lack kp_id —
            // in that case we keep them in view-only form via custom_name.
            setExtraWorks((summary.extra_works || []).map(ew => ({
                rid: genRowId(),
                kp_id: ew.kp_id || null,
                extra_work_id: ew.extra_work_id || null,
                name: ew.name || ew.custom_name || '',
                unit: ew.unit || 'шт',
                volume: ew.volume ?? '',
                salary: ew.salary || 0,
                price: ew.price || 0,
                // v2.10: carry the addendum flag + date so ExtraWorksPicker
                // badges доп.отчёт rows ("добавлено позже · {date}").
                is_additional: ew.is_additional,
                filled_at: ew.filled_at,
            })));
        } catch (e) { toast.error("Ошибка загрузки"); setModalApp(null); }
    };

    // v2.9: match by composite (kp_id, team_id) so editing one brigade's
    // volume no longer mutates every row that shares the kp_id. team_id is
    // null for common-mode rows.
    const handleVolumeChange = (kp_id, team_id, value) => {
        setKpItems(prev => prev.map(i =>
            (i.kp_id === kp_id && (i.team_id ?? null) === (team_id ?? null))
                ? { ...i, volume: value }
                : i
        ));
    };

    const submitVolumes = async () => {
        setIsSubmitting(true);
        try {
            await Promise.all([
                axios.post(`/api/kp/apps/${modalApp.id}/submit`, {
                    items: kpItems.map(i => ({
                        kp_id: i.kp_id,
                        volume: i.volume || 0,
                        team_id: i.team_id ?? null,
                        ...(isOffice ? { salary: i.current_salary, price: i.current_price } : {}),
                    })),
                }),
                axios.post(`/api/kp/apps/${modalApp.id}/extra_works/submit`, {
                    items: extraWorks
                        .filter(ew => parseFloat(ew.volume || 0) > 0)
                        .map(ew => ({
                            kp_id: ew.kp_id || 0,
                            extra_work_id: ew.extra_work_id || 0,
                            // Backend looks up name/unit/price from kp_catalog
                            // when kp_id is set. Keep name + unit in the
                            // payload as a fallback for legacy rows.
                            custom_name: ew.name || '',
                            unit: ew.unit || '',
                            volume: ew.volume || 0,
                            ...(isOffice ? { salary: ew.salary, price: ew.price } : {}),
                        })),
                }),
            ]);
            toast.success("Отчет отправлен!");
            setModalApp(null); fetchApps();
        } catch (e) { toast.error("Ошибка сохранения"); }
        setIsSubmitting(false);
    };

    // v2.4.6: bulk download uses the NEW /smr/download endpoint per app,
    // so every file follows the clean format (Часы / Работы / Доп. работы)
    // with no salary or price columns. The old /api/kp/export endpoint
    // still exists for legacy callers but is no longer used here.
    const handleExportReport = async (appIds) => {
        if (!appIds?.length) return;
        setIsSubmitting(true);
        let ok = 0;
        for (const id of appIds) {
            try {
                const res = await axios.get(`/api/kp/apps/${id}/smr/download`, { responseType: 'blob' });
                const name = parseFilenameFromCD(res.headers?.['content-disposition'], `smr_${id}.xlsx`);
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', name);
                document.body.appendChild(link); link.click(); link.remove();
                window.URL.revokeObjectURL(url);
                ok += 1;
            } catch { /* keep going; show aggregate result below */ }
        }
        if (ok === appIds.length) toast.success(`Скачано отчётов: ${ok}`);
        else if (ok > 0) toast.success(`Скачано: ${ok} из ${appIds.length}`);
        else toast.error('Не удалось скачать отчёты');
        setIsSubmitting(false);
    };

    const setAccounted = async (appIds, accounted) => {
        if (!appIds.length || accountingBusy) return;
        const scrollPosition = window.scrollY;
        setAccountingBusy(true);
        try {
            await axios.post('/api/kp/smr/accounted', { app_ids: appIds, accounted });
            toast.success(accounted
                ? `Учтено заявок: ${appIds.length}`
                : `Отметка снята: ${appIds.length}`);
            setSelectedForExport(prev => prev.filter(id => !appIds.includes(id)));
            // Refresh in place: replacing the page with the loading skeleton
            // collapses the list and sends the moderator back to its beginning.
            await fetchApps({ showLoader: false });
            requestAnimationFrame(() => {
                window.scrollTo({ top: scrollPosition, behavior: 'auto' });
            });
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Не удалось изменить отметку');
        } finally {
            setAccountingBusy(false);
        }
    };

    const handleDownloadCatalog = async () => {
        try {
            const res = await axios.get('/api/kp/catalog/download', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Справочник_КП_актуальный.xlsx');
            document.body.appendChild(link); link.click(); link.remove();
        } catch (e) { toast.error("Файл не найден на сервере. Загрузите его впервые."); }
    };

    const handleUploadCatalog = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        setIsSubmitting(true);
        try {
            await axios.post('/api/kp/catalog/upload', fd);
            toast.success("Справочник успешно обновлен!");
            fetchApps();
        } catch (e) { toast.error(e.response?.data?.detail || "Ошибка загрузки файла"); }
        setIsSubmitting(false);
        e.target.value = null;
    };

    const totalSalary = smrTotals?.salary ?? 0;
    const totalPrice = smrTotals?.price ?? 0;
    const unaccountedReady = isOffice
        ? data.approved.filter(app => !app.smr_accounted_at)
        : data.approved;
    const accountedReady = isOffice
        ? data.approved.filter(app => Boolean(app.smr_accounted_at))
        : [];
    const visibleReady = showAccounted
        ? [...unaccountedReady, ...accountedReady]
        : unaccountedReady;
    const activeItems = activeTab === 'approved' ? visibleReady : (data[activeTab] || []);
    const searchedItems = activeItems.filter((app) => matchesDeepSearch([
        app.search_text,
        app.public_number,
        app.id,
        app.foreman_name,
        app.object_name,
        app.obj_name,
        app.object_address,
        app.date_target,
        app.smr_accounted_at ? 'учтено учтенный' : 'не учтено',
    ], searchQuery));
    const selectedUnaccounted = selectedForExport.filter(id =>
        unaccountedReady.some(app => app.id === id)
    );
    const selectedAccounted = selectedForExport.filter(id =>
        accountedReady.some(app => app.id === id)
    );

    if (!['superadmin', 'boss', 'moderator', 'hr', 'foreman', 'brigadier', 'worker'].includes(role)) {
        return (
            <main className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24 flex flex-col items-center justify-center min-h-[60vh] text-gray-400 dark:text-gray-500">
                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-6 shadow-inner">
                    <Lock className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-xl font-bold">Доступ закрыт</p>
                <p className="text-sm mt-2 text-center max-w-sm">Заполнение сметных расчетов (СМР) доступно только бригадирам и руководству.</p>
            </main>
        );
    }

    if (loading) return <KPSkeleton />;

    return (
        <main className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex flex-col md:flex-row justify-between md:items-center pt-6 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <FileText className="w-7 h-7 text-emerald-500 mr-2" /> Выполненные работы
                </h2>

                {isOffice && (
                    <div className="grid grid-cols-[44px_minmax(0,1fr)] md:flex md:items-center gap-2 w-full md:w-auto">
                        <input type="file" className="hidden" ref={fileInputRef} onChange={handleUploadCatalog} accept=".xlsx,.csv" />
                        <button onClick={() => { setShowArchive(true); fetchArchived(); }}
                            className="min-h-11 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 transition-all flex items-center justify-center gap-2 hover:bg-gray-100"
                            title="Архив СМР">
                            <Archive className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowSettings(true)} className="min-h-11 min-w-0 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 transition-all flex items-center justify-center gap-2 hover:bg-gray-100">
                            <Settings className="w-4 h-4" /> Настройка СМР
                        </button>
                        <button onClick={() => setShowReconciliation(true)} className="col-span-2 md:col-span-1 min-h-11 min-w-0 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-4 py-2.5 rounded-xl text-sm font-bold border border-indigo-200 dark:border-indigo-800/60 transition-all flex items-center justify-center gap-2 hover:bg-indigo-100">
                            <Scale className="w-4 h-4" /> Сверка цен
                        </button>
                    </div>
                )}
            </div>

            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5 overflow-x-auto custom-scrollbar gap-1" data-tour="kp-tabs">
                {!isViewerOnly && (
                    <button
                        onClick={() => setActiveTab('to_fill')}
                        className={`relative flex-1 min-w-[100px] py-3 px-3 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'to_fill' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        К заполнению
                        <TabBadge count={data.to_fill.length} active={activeTab === 'to_fill'} />
                    </button>
                )}
                {(isForemanOrBrigadier || isOffice) && (
                    <button
                        onClick={() => setActiveTab('pending_review')}
                        className={`relative flex-1 min-w-[100px] py-3 px-3 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'pending_review' ? 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        На проверку
                        <TabBadge count={data.pending_review.length} active={activeTab === 'pending_review'} />
                    </button>
                )}
                {(isForemanOrBrigadier || isOffice || isViewerOnly) && (
                    <button
                        onClick={() => setActiveTab('approved')}
                        className={`relative flex-1 min-w-[100px] py-3 px-3 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'approved' ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Готовые
                        <TabBadge count={isOffice ? unaccountedReady.length : data.approved.length} active={activeTab === 'approved'} />
                    </button>
                )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
                    {[
                        ['foreman', 'По прорабу'],
                        ['object', 'По объекту'],
                        ['date', 'По дате'],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setGroupMode(value)}
                            className={`min-h-10 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                                groupMode === value
                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {activeTab === 'approved' && isOffice && accountedReady.length > 0 && (
                    <button
                        onClick={() => {
                            if (showAccounted) {
                                const accountedIds = new Set(accountedReady.map(app => app.id));
                                setSelectedForExport(prev => prev.filter(id => !accountedIds.has(id)));
                            }
                            setShowAccounted(prev => !prev);
                        }}
                        className="self-start sm:self-auto min-h-10 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50"
                    >
                        {showAccounted
                            ? <EyeOff className="w-4 h-4" />
                            : <Eye className="w-4 h-4" />}
                        {showAccounted ? 'Скрыть учтённые' : `Показать учтённые (${accountedReady.length})`}
                    </button>
                )}
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Глубокий поиск: участник, работа, объект, прораб, номер, дата…"
                    className="w-full min-h-12 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-12 pr-24 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {searchQuery && <span className="hidden sm:inline text-[11px] font-semibold text-gray-400">Найдено: {searchedItems.length}</span>}
                    {searchQuery && (
                        <button type="button" onClick={() => setSearchQuery('')} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Очистить поиск">
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    )}
                </div>
            </div>

            {activeTab === 'approved' && isOffice && data.approved.length > 0 && (
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 bg-emerald-50/50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                    <button
                        onClick={() => {
                            const ids = searchedItems.map(app => app.id);
                            const allSelected = ids.length > 0 && ids.every(id => selectedForExport.includes(id));
                            setSelectedForExport(allSelected ? [] : ids);
                        }}
                        className="self-start text-sm font-bold text-emerald-700 dark:text-emerald-400"
                    >
                        {searchedItems.length > 0 && searchedItems.every(app => selectedForExport.includes(app.id))
                            ? 'Снять выделение'
                            : 'Выделить видимые'}
                    </button>
                    <div className="flex flex-wrap gap-2">
                        {selectedUnaccounted.length > 0 && (
                            <button
                                disabled={accountingBusy}
                                onClick={() => setAccounted(selectedUnaccounted, true)}
                            className="min-h-10 bg-violet-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 disabled:opacity-50"
                            >
                                <CheckCheck className="w-4 h-4" /> Учесть ({selectedUnaccounted.length})
                            </button>
                        )}
                        {selectedAccounted.length > 0 && (
                            <button
                                disabled={accountingBusy}
                                onClick={() => setAccounted(selectedAccounted, false)}
                                className="min-h-10 bg-white dark:bg-gray-700 text-violet-700 dark:text-violet-300 px-4 py-2 rounded-xl text-xs font-bold border border-violet-200 dark:border-violet-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                <Undo2 className="w-4 h-4" /> Снять ({selectedAccounted.length})
                            </button>
                        )}
                        <button
                            disabled={selectedForExport.length === 0 || isSubmitting}
                            onClick={() => handleExportReport(selectedForExport)}
                            className="min-h-10 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" /> Скачать ({selectedForExport.length})
                        </button>
                    </div>
                </div>
            )}

            {/* v2.10 доп.отчёт: create an addendum to an already-completed report. */}
            {activeTab === 'approved' && canCreateAddendum && (
                <div className="flex justify-end">
                    <button
                        onClick={() => setShowAddendumPicker(true)}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-colors active:scale-[0.99]"
                    >
                        <Plus className="w-4 h-4" /> Создать отчёт
                    </button>
                </div>
            )}

            <GroupedSMRList
                items={searchedItems}
                tab={activeTab}
                groupMode={groupMode}
                isOffice={isOffice}
                tgId={tgId}
                selectedForExport={selectedForExport}
                setSelectedForExport={setSelectedForExport}
                mergeSelected={mergeSelected}
                toggleMergeSelect={toggleMergeSelect}
                onUnmerge={handleUnmerge}
                onFill={(app) => { setWizardApproveMode(false); setWizardApp(app); }}
                onReview={(app) => { setWizardApproveMode(true); setWizardApp(app); }}
                onView={(app) => openModal(app)}
                onArchive={async (app) => {
                    if (!window.confirm(`Архивировать СМР: ${app.object_name || app.obj_name || 'Объект'} (${app.date_target})?`)) return;
                    try {
                        await axios.post(`/api/kp/apps/${app.id}/archive`);
                        toast.success('СМР перемещена в архив');
                        fetchApps();
                    } catch { toast.error('Ошибка архивации'); }
                }}
                onRemind={async (app) => {
                    try {
                        const fd = new FormData();
                        fd.append('tg_id', tgId);
                        await axios.post(`/api/applications/${app.id}/remind`, fd);
                        toast.success('Напоминание отправлено прорабу!');
                    } catch (e) { toast.error(e.response?.data?.detail || 'Ошибка отправки'); }
                }}
                onDownload={async (app) => {
                    try {
                        const res = await axios.get(`/api/kp/apps/${app.id}/smr/download`, { responseType: 'blob' });
                        const name = parseFilenameFromCD(res.headers?.['content-disposition'], `smr_${app.id}.xlsx`);
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', name);
                        document.body.appendChild(link); link.click(); link.remove();
                        window.URL.revokeObjectURL(url);
                    } catch { toast.error('Не удалось скачать отчёт'); }
                }}
                onAccounted={(app, accounted) => setAccounted([app.id], accounted)}
            />

            {showReconciliation && (
                <SMRReconciliationModal
                    apps={data.approved}
                    onClose={() => setShowReconciliation(false)}
                    onOpenApp={(appId) => {
                        const app = data.approved.find((item) => Number(item.id) === Number(appId));
                        setShowReconciliation(false);
                        if (app) openModal(app);
                    }}
                />
            )}

            {modalApp && (
                <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl relative overflow-hidden">
                        <div className="flex justify-between items-center gap-3 p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                            <div className="min-w-0">
                                <h3 className="text-lg sm:text-xl font-bold dark:text-white flex items-center gap-2"><FileText className="w-6 h-6 text-blue-500 flex-shrink-0" /> Отчет о работах</h3>
                                <p className="text-sm text-gray-500 mt-1 truncate">{modalApp.obj_name} ({modalApp.date_target})</p>
                            </div>
                            <button onClick={() => setModalApp(null)} className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-gray-400 bg-white dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700" aria-label="Закрыть"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 sm:p-6 max-h-[calc(100dvh-10rem)] sm:max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {kpItems.length > 0 ? (
                                <div className="space-y-6">
                                    {Object.entries(kpItems.reduce((acc, curr) => { acc[curr.category] = acc[curr.category] || []; acc[curr.category].push(curr); return acc; }, {})).map(([cat, items]) => (
                                        <div key={cat} className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                            <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 text-xs font-bold text-gray-500 uppercase">{cat}</div>
                                            <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                                {items.map(item => (
                                                    <div key={`${item.kp_id}_${item.team_id ?? 'common'}`} className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                                                        <div className="flex-1">
                                                            <p className="font-bold text-sm text-gray-800 dark:text-gray-100 flex items-center gap-2 flex-wrap">
                                                                {item.name}
                                                                {item.is_additional ? (
                                                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                                                        добавлено позже
                                                                    </span>
                                                                ) : null}
                                                                {item.team_name && (
                                                                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
                                                                        {item.team_name}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {canViewFinance && (
                                                                <p className="text-[10px] text-gray-400 mt-1">ЗП: {item.current_salary}₽ · Цена: {item.current_price}₽</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" min="0" step="0.1" disabled={activeTab !== 'to_fill' && !(activeTab === 'approved' && isOffice) && !(activeTab === 'pending_review' && isEditing)} value={item.volume} onChange={(e) => handleVolumeChange(item.kp_id, item.team_id ?? null, e.target.value)} className="w-20 p-2 text-center font-bold border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white" />
                                                            <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">{item.unit || ''}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-center text-gray-400 py-8">Работы не назначены.</p>}

                            {smrHours.length > 0 && (
                                <div className="mt-6 border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 text-xs font-bold text-gray-500 uppercase flex items-center justify-between">
                                        <span className="inline-flex items-center gap-2"><Clock className="w-4 h-4" /> Часы сотрудников</span>
                                        <span>{smrTotals?.hours ?? 0} ч</span>
                                    </div>
                                    <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                        {smrHours.map(row => (
                                            <div key={`hours-${row.id}`} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{row.fio || 'Сотрудник'}</p>
                                                    <p className="text-[11px] text-gray-400 truncate">{row.team_name || '—'}{row.is_additional ? ' · добавлено позже' : ''}</p>
                                                </div>
                                                <span className="font-bold text-gray-900 dark:text-white whitespace-nowrap">{row.hours} ч</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Доп. работы — v2.4.3 collapsible category picker */}
                            {(extraWorks.length > 0 || activeTab === 'to_fill') && (
                                <div className="mt-6">
                                    <ExtraWorksPicker
                                        catalog={extraWorksCatalog}
                                        selected={extraWorks}
                                        onChange={setExtraWorks}
                                        disabled={activeTab !== 'to_fill' && !(activeTab === 'approved' && isOffice) && !(activeTab === 'pending_review' && isEditing)}
                                        defaultOpen={extraWorks.length > 0}
                                    />
                                </div>
                            )}
                        </div>
                        {kpItems.length > 0 && (
                            <div className="p-6 border-t bg-gray-50/50 dark:bg-gray-900/50">
                                {canViewFinance && (
                                    <div className="space-y-2 mb-6">
                                        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <span className="text-xs font-bold text-gray-400 uppercase">Сумма ЗП:</span>
                                            <span className="text-xl font-black text-gray-800 dark:text-white">{totalSalary.toLocaleString()} ₽</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <span className="text-xs font-bold text-gray-400 uppercase">Сумма Цена:</span>
                                            <span className="text-xl font-black text-gray-800 dark:text-white">{totalPrice.toLocaleString()} ₽</span>
                                        </div>
                                    </div>
                                )}
                                <div className="flex gap-3">
                                    {activeTab === 'to_fill' && <button onClick={submitVolumes} disabled={isSubmitting} className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-xl disabled:opacity-50">Отправить отчет</button>}
                                    {activeTab === 'pending_review' && (role === 'foreman' || isOffice) && (
                                        <>
                                            <button onClick={() => setIsEditing(e => !e)} className={`flex items-center justify-center gap-2 px-5 py-4 rounded-xl font-bold transition-colors ${isEditing ? 'bg-yellow-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                                                <Edit3 className="w-4 h-4" /> {isEditing ? 'Отмена' : 'Редактировать'}
                                            </button>
                                            <button onClick={async () => {
                                                const payload = { action: 'approve' };
                                                if (isEditing) payload.items = kpItems.map(i => ({ kp_id: i.kp_id, volume: i.volume || 0, team_id: i.team_id ?? null }));
                                                await axios.post(`/api/kp/apps/${modalApp.id}/review`, payload);
                                                setModalApp(null); fetchApps();
                                            }} className="flex-1 bg-emerald-500 text-white font-bold py-4 rounded-xl">Одобрить</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {showSettings && (
                <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-lg font-bold dark:text-white flex items-center gap-2"><Settings className="w-5 h-5 text-blue-500" /> Настройка СМР</h3>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 border border-gray-100 dark:border-gray-700"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Импорт обновляет справочник цен из Excel-файла. Экспорт выгружает актуальный справочник для просмотра и редактирования.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => { fileInputRef.current.click(); setShowSettings(false); }} className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-4 rounded-2xl text-sm font-bold border border-blue-100 dark:border-blue-800/30 flex flex-col items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                                    <Upload className="w-6 h-6" /> Импорт
                                </button>
                                <button onClick={() => { handleDownloadCatalog(); setShowSettings(false); }} className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 p-4 rounded-2xl text-sm font-bold border border-emerald-100 dark:border-emerald-800/30 flex flex-col items-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                                    <Download className="w-6 h-6" /> Экспорт
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showArchive && (
                <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                                <Archive className="w-5 h-5 text-gray-500" /> Архив СМР
                            </h3>
                            <button onClick={() => setShowArchive(false)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 border border-gray-100 dark:border-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            {archivedApps.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-8">Архив пуст</p>
                            ) : (
                                <div className="space-y-3">
                                    {archivedApps.map(app => (
                                        <div key={app.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <div>
                                                <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{app.obj_name || app.object_address || 'Объект'}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">{app.foreman_name} · {app.date_target}</p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await axios.post(`/api/kp/apps/${app.id}/restore`);
                                                        toast.success('СМР восстановлена');
                                                        fetchArchived();
                                                        fetchApps();
                                                    } catch { toast.error('Ошибка восстановления'); }
                                                }}
                                                className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-emerald-200 dark:border-emerald-800/50"
                                            >
                                                Восстановить
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showAddendumPicker && (
                <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-amber-500" /> Создать доп. отчёт
                            </h3>
                            <button onClick={() => setShowAddendumPicker(false)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 border border-gray-100 dark:border-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400 px-2 pb-3 leading-relaxed">
                                Выберите готовый отчёт, чтобы добавить забытые работы или часы. Существующие данные не изменятся — записи только добавляются.
                            </p>
                            {data.approved.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-8">Нет готовых отчётов</p>
                            ) : (
                                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-1.5">
                                    {data.approved.map(app => (
                                        <button
                                            key={app.id}
                                            onClick={() => {
                                                setShowAddendumPicker(false);
                                                setWizardApproveMode(false);
                                                setWizardAddendumMode(true);
                                                setWizardApp(app);
                                            }}
                                            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/60 dark:bg-gray-900/20 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors active:scale-[0.99]"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                                                    {app.object_name || app.obj_name || app.object_address || 'Объект'}
                                                </p>
                                                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                    {formatApplicationNumber(app)} · {app.date_target || '—'}{app.foreman_name ? ` · ${app.foreman_name}` : ''}
                                                </p>
                                            </div>
                                            <Plus className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {wizardApp && (
                <SMRWizard
                    appId={wizardApp.id}
                    app={wizardApp}
                    userRole={role}
                    tgId={tgId}
                    approveMode={wizardApproveMode}
                    addendumMode={wizardAddendumMode}
                    onClose={() => { setWizardApp(null); setWizardApproveMode(false); setWizardAddendumMode(false); }}
                    onSubmitted={() => { fetchApps(); }}
                />
            )}

            {/* Floating "Объединить" action — only when the user has 2+
                to_fill applications selected via the checkboxes. */}
            <AnimatePresence>
                {activeTab === 'to_fill' && mergeSelected.length >= 2 && (
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 24 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-8 z-[90]"
                    >
                        <div className="flex items-center gap-2 bg-blue-600 text-white pl-4 pr-2 py-2 rounded-full shadow-2xl ring-4 ring-blue-600/10">
                            <Link2 className="w-4 h-4" />
                            <span className="text-sm font-bold">
                                Выбрано: {mergeSelected.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => setMergeSelected([])}
                                className="text-white/70 hover:text-white px-2 text-xs"
                            >
                                Сбросить
                            </button>
                            <button
                                type="button"
                                disabled={mergeBusy}
                                onClick={handleMerge}
                                className="bg-white text-blue-700 font-bold text-sm px-4 py-1.5 rounded-full hover:bg-blue-50 transition-colors disabled:opacity-50 active:scale-[0.98]"
                            >
                                {mergeBusy ? 'Объединение…' : 'Объединить'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}

// ============================================================
// Grouped SMR list (foreman / object / date)
// ============================================================
function GroupedSMRList({
    items,
    tab,
    groupMode,
    isOffice,
    tgId,
    selectedForExport,
    setSelectedForExport,
    mergeSelected,
    toggleMergeSelect,
    onUnmerge,
    onFill,
    onReview,
    onView,
    onArchive,
    onRemind,
    onDownload,
    onAccounted,
}) {
    const groups = useMemo(() => groupSMRItems(items, groupMode), [items, groupMode]);

    if (groups.length === 0) {
        return (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 italic">
                Нет заявок
            </div>
        );
    }

    return (
        <div className="space-y-4" data-tour="kp-grid">
            {groups.map((group, gi) => (
                <div key={group.key || gi} className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="px-5 py-4 bg-gray-50/70 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700">
                        {groupMode === 'object' ? (
                            <ObjectDisplay
                                name={group.title}
                                address={group.subtitle}
                                showIcon
                                nameClassName="font-bold text-base text-gray-900 dark:text-white leading-tight"
                                addressClassName="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                            />
                        ) : (
                            <div className="flex items-center gap-2">
                                {groupMode === 'foreman'
                                    ? <HardHat className="w-4 h-4 text-emerald-500" />
                                    : <CalendarIcon className="w-4 h-4 text-blue-500" />}
                                <span className="font-bold text-base text-gray-900 dark:text-white">
                                    {group.title}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {group.apps.length}
                                </span>
                            </div>
                        )}
                    </div>

                    <ul className="space-y-1.5 p-3">
                        {group.apps.map(app => (
                            <SMRGroupRow
                                key={app.id}
                                app={app}
                                tab={tab}
                                groupMode={groupMode}
                                isOffice={isOffice}
                                tgId={tgId}
                                selectedForExport={selectedForExport}
                                setSelectedForExport={setSelectedForExport}
                                mergeSelected={mergeSelected}
                                toggleMergeSelect={toggleMergeSelect}
                                onUnmerge={onUnmerge}
                                onFill={onFill}
                                onReview={onReview}
                                onView={onView}
                                onArchive={onArchive}
                                onRemind={onRemind}
                                onDownload={onDownload}
                                onAccounted={onAccounted}
                            />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function SMRGroupRow({
    app, tab, groupMode, isOffice, tgId,
    selectedForExport, setSelectedForExport,
    mergeSelected, toggleMergeSelect, onUnmerge,
    onFill, onReview, onView, onArchive, onRemind, onDownload, onAccounted,
}) {
    const isBrigadierSubmission = app.smr_filled_by_role === 'brigadier';
    const mergedWith = Array.isArray(app.merged_with) ? app.merged_with : [];
    const isMerged = mergedWith.length > 0;
    const isMergeSelected = (mergeSelected || []).includes(app.id);
    const isAccounted = Boolean(app.smr_accounted_at);
    const objectLabel = app.object_name || app.obj_name || app.object_address || 'Без объекта';

    const isRemindMode = tab === 'to_fill' && isOffice && app.foreman_id !== Number(tgId);
    let rowAction = null;
    if (tab === 'to_fill' && !isRemindMode) rowAction = () => onFill(app);
    else if (tab === 'pending_review') rowAction = () => onReview(app);
    else if (tab === 'approved') rowAction = () => onView(app);

    return (
        <li
            className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                isMergeSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700'
                    : isAccounted
                        ? 'bg-violet-50 dark:bg-violet-900/20 ring-1 ring-violet-300 dark:ring-violet-700 border-l-4 border-violet-500'
                    : isMerged
                        ? 'bg-blue-50/40 dark:bg-blue-900/10'
                        : 'bg-gray-50/60 dark:bg-gray-900/20 hover:bg-gray-100 dark:hover:bg-gray-700/40'
            }`}
        >
            {/* Merge checkbox — only on the to_fill tab and only for
                apps that aren't already part of a merged group. */}
            {tab === 'to_fill' && !isMerged && (
                <input
                    type="checkbox"
                    checked={isMergeSelected}
                    onChange={() => toggleMergeSelect?.(app.id)}
                    onClick={(e) => e.stopPropagation()}
                    title="Выбрать для объединения"
                    className="w-5 h-5 text-blue-600 rounded flex-shrink-0 self-start sm:self-auto mt-0.5 sm:mt-0"
                />
            )}

            <div
                className={`flex-1 min-w-0 ${rowAction ? 'cursor-pointer' : ''}`}
                onClick={rowAction || undefined}
            >
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="whitespace-nowrap">{formatApplicationNumber(app)}</span>
                    {isMerged && (
                        <span
                            className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-500/20 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
                            title="Объединённая СМР"
                        >
                            <Link2 className="w-2.5 h-2.5" /> объединено
                        </span>
                    )}
                    {isAccounted && (
                        <span
                            className="text-[10px] font-extrabold text-white bg-violet-600 dark:bg-violet-500 px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 shadow-sm"
                            title={`Учтено: ${app.smr_accounted_by_fio || '—'} · ${app.smr_accounted_at || '—'}`}
                        >
                            <CheckCheck className="w-2.5 h-2.5" /> учтено
                        </span>
                    )}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                    {groupMode !== 'foreman' && (
                        <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                            <HardHat className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            {app.foreman_name || '—'}
                        </span>
                    )}
                    {groupMode !== 'object' && (
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="break-words">{objectLabel}</span>
                        </span>
                    )}
                    {groupMode !== 'date' && (
                        <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            {app.date_target || '—'}
                        </span>
                    )}
                    {isBrigadierSubmission && tab === 'pending_review' && (
                        <span className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">
                            бригадир
                        </span>
                    )}
                </p>
                {isAccounted && (
                    <p className="text-[10px] text-violet-600 dark:text-violet-400 mt-1">
                        {app.smr_accounted_by_fio || 'Пользователь'} · {String(app.smr_accounted_at || '').replace('T', ' ').slice(0, 16)}
                    </p>
                )}
                {isMerged && tab === 'to_fill' && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>+ объединено с {mergedWith.map(m => `№${m.id}`).join(', ')}</span>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onUnmerge?.(app.id); }}
                            className="text-[11px] font-bold text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100 inline-flex items-center gap-0.5"
                        >
                            <Link2Off className="w-3 h-3" /> Отменить
                        </button>
                    </p>
                )}
            </div>

            <div className="flex items-center justify-end gap-1.5 flex-wrap flex-shrink-0">
                {tab === 'approved' && isOffice && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onAccounted?.(app, !isAccounted);
                        }}
                        className={`transition-colors w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg ${
                            isAccounted
                                ? 'text-violet-600 bg-violet-50 hover:bg-violet-100 dark:text-violet-300 dark:bg-violet-900/20'
                                : 'text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                        }`}
                        title={isAccounted ? 'Снять отметку «Учтено»' : 'Учесть'}
                    >
                        {isAccounted
                            ? <Undo2 className="w-3.5 h-3.5" />
                            : <CheckCheck className="w-3.5 h-3.5" />}
                    </button>
                )}
                {isOffice && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onArchive(app); }}
                        className="text-gray-400 hover:text-red-500 transition-colors w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="В архив"
                    >
                        <Archive className="w-3.5 h-3.5" />
                    </button>
                )}

                {tab === 'to_fill' && isOffice && app.foreman_id !== Number(tgId) ? (
                    <button
                        onClick={() => onRemind(app)}
                        className="text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800/50 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors active:scale-95 flex items-center gap-1.5"
                    >
                        <Bell className="w-3.5 h-3.5" /> Напомнить
                    </button>
                ) : tab === 'to_fill' ? (
                    <button
                        onClick={() => onFill(app)}
                        className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors active:scale-95"
                    >
                        Заполнить
                    </button>
                ) : tab === 'pending_review' ? (
                    <button
                        onClick={() => onReview(app)}
                        className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors active:scale-95"
                    >
                        Проверить
                    </button>
                ) : (
                    <>
                        {isOffice && (
                            <input
                                type="checkbox"
                                checked={selectedForExport.includes(app.id)}
                                onChange={() => setSelectedForExport(prev =>
                                    prev.includes(app.id) ? prev.filter(x => x !== app.id) : [...prev, app.id]
                                )}
                                className="w-5 h-5 text-emerald-600 rounded mx-1"
                                title="Выбрать для пакетной выгрузки"
                            />
                        )}
                        <button
                            onClick={() => onView(app)}
                            className="text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors active:scale-95"
                        >
                            Открыть
                        </button>
                        <button
                            onClick={() => onDownload(app)}
                            title="Скачать отчёт"
                            className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors active:scale-95"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}
            </div>
        </li>
    );
}

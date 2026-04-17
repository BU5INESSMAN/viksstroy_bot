import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    FileText, CheckCircle, Clock, Search, X, MapPin,
    Download, Save, AlertTriangle, Edit3, Upload, Lock, Settings, Bell, HardHat, Plus, Trash2, Archive,
    Calendar as CalendarIcon
} from 'lucide-react';
import { KPSkeleton } from '../components/ui/PageSkeletons';
import TabBadge from '../components/ui/TabBadge';
import ExtraWorksPicker from '../features/kp/components/ExtraWorksPicker';
import SMRWizard from '../features/kp/components/SMRWizard';
import ObjectDisplay from '../components/ui/ObjectDisplay';

// v2.4.6 — group flat list of SMR apps by object → date for cleaner scanning.
function groupByObjectAndDate(items) {
    const objMap = new Map();
    for (const app of items || []) {
        const name = app.object_name || app.obj_name || app.object_address || 'Без объекта';
        const addr = app.object_clean_address || (app.object_name ? app.object_address : '') || '';
        const key = `${app.object_id || 0}|${name}`;
        if (!objMap.has(key)) {
            objMap.set(key, {
                object_name: name,
                object_address: addr,
                dates: new Map(),
            });
        }
        const group = objMap.get(key);
        const date = app.date_target || '—';
        if (!group.dates.has(date)) group.dates.set(date, []);
        group.dates.get(date).push(app);
    }
    // Sort objects alphabetically (ru-aware), dates chronologically descending
    const groups = [...objMap.values()]
        .sort((a, b) => (a.object_name || '').localeCompare(b.object_name || '', 'ru'));
    for (const g of groups) {
        g.dates = [...g.dates.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, apps]) => ({ date, apps }));
    }
    return groups;
}

export default function KP() {
    const [searchParams, setSearchParams] = useSearchParams();
    const role = localStorage.getItem('user_role') || 'worker';
    const tgId = localStorage.getItem('tg_id') || '0';

    const isOffice = ['moderator', 'boss', 'superadmin'].includes(role);
    const isForemanOrBrigadier = ['foreman', 'brigadier'].includes(role);

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ to_fill: [], pending_review: [], approved: [] });
    const [activeTab, setActiveTab] = useState(() => {
        const tab = searchParams.get('tab');
        if (tab && ['to_fill', 'pending_review', 'approved'].includes(tab)) return tab;
        return isOffice ? 'approved' : 'to_fill';
    });

    useEffect(() => {
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
    const [smrUnlockTime, setSmrUnlockTime] = useState('');
    const [extraWorksCatalog, setExtraWorksCatalog] = useState([]);
    const [extraWorks, setExtraWorks] = useState([]);
    const [showArchive, setShowArchive] = useState(false);
    const [archivedApps, setArchivedApps] = useState([]);
    // v2.4.5 SMR wizard integration
    const [wizardApp, setWizardApp] = useState(null);
    const [wizardApproveMode, setWizardApproveMode] = useState(false);

    const fileInputRef = useRef(null);

    const fetchApps = async () => {
        setLoading(true);
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
            if (mapped[activeTab]?.length === 0) {
                if (mapped.to_fill.length > 0) setActiveTab('to_fill');
                else if (mapped.pending_review.length > 0) setActiveTab('pending_review');
                else if (mapped.approved.length > 0) setActiveTab('approved');
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchArchived = async () => {
        try {
            const res = await axios.get('/api/kp/archived');
            setArchivedApps(res.data || []);
        } catch { setArchivedApps([]); }
    };

    useEffect(() => { fetchApps(); }, [tgId]);

    useEffect(() => {
        axios.get('/api/settings').then(res => {
            setSmrUnlockTime(res.data.smr_unlock_time || '');
        }).catch(() => {});
    }, []);

    const isSmrLocked = (() => {
        if (!smrUnlockTime || isOffice) return false;
        const [h, m] = smrUnlockTime.split(':').map(Number);
        const now = new Date();
        return now.getHours() < h || (now.getHours() === h && now.getMinutes() < m);
    })();

    const openModal = async (app) => {
        setModalApp(app);
        setIsEditing(false);
        setExtraWorks([]);
        try {
            const [res, ewRes, catRes] = await Promise.all([
                axios.get(`/api/kp/apps/${app.id}/items`),
                axios.get(`/api/kp/apps/${app.id}/extra_works`),
                axios.get('/api/kp/catalog'),
            ]);
            setKpItems(res.data.map(i => ({
                ...i,
                volume: i.volume || '',
                current_salary: i.saved_salary !== null ? i.saved_salary : i.salary,
                current_price: i.saved_price !== null ? i.saved_price : i.price,
            })));
            // v2.4.3: catalog for extra works is the global KP catalog.
            setExtraWorksCatalog(catRes.data || []);
            // Restore existing extra works. Legacy rows may lack kp_id —
            // in that case we keep them in view-only form via custom_name.
            setExtraWorks((ewRes.data || []).map(ew => ({
                kp_id: ew.extra_work_id || null,
                name: ew.custom_name || ew.catalog_name || '',
                unit: ew.display_unit || ew.catalog_unit || 'шт',
                volume: ew.volume ?? '',
                salary: ew.salary || 0,
                price: ew.price || 0,
            })));
        } catch (e) { toast.error("Ошибка загрузки"); setModalApp(null); }
    };

    const handleVolumeChange = (kp_id, value) => {
        setKpItems(prev => prev.map(i => i.kp_id === kp_id ? { ...i, volume: value } : i));
    };

    const submitVolumes = async () => {
        setIsSubmitting(true);
        try {
            await Promise.all([
                axios.post(`/api/kp/apps/${modalApp.id}/submit`, {
                    items: kpItems.map(i => ({
                        kp_id: i.kp_id,
                        volume: i.volume || 0,
                        ...(isOffice ? { salary: i.current_salary, price: i.current_price } : {}),
                    })),
                }),
                axios.post(`/api/kp/apps/${modalApp.id}/extra_works/submit`, {
                    items: extraWorks
                        .filter(ew => parseFloat(ew.volume || 0) > 0)
                        .map(ew => ({
                            kp_id: ew.kp_id || 0,
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
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `smr_${id}.xlsx`);
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

    const totalSalary = kpItems.reduce((acc, curr) => acc + (parseFloat(curr.volume || 0) * parseFloat(curr.current_salary || 0)), 0)
        + extraWorks.reduce((acc, ew) => acc + (parseFloat(ew.volume || 0) * parseFloat(ew.salary || 0)), 0);
    const totalPrice = kpItems.reduce((acc, curr) => acc + (parseFloat(curr.volume || 0) * parseFloat(curr.current_price || 0)), 0)
        + extraWorks.reduce((acc, ew) => acc + (parseFloat(ew.volume || 0) * parseFloat(ew.price || 0)), 0);

    if (!['superadmin', 'boss', 'moderator', 'foreman', 'brigadier'].includes(role)) {
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
                    <div className="flex items-center gap-2">
                        <input type="file" className="hidden" ref={fileInputRef} onChange={handleUploadCatalog} accept=".xlsx,.csv" />
                        <button onClick={() => { setShowArchive(true); fetchArchived(); }}
                            className="bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 transition-all flex items-center gap-2 hover:bg-gray-100"
                            title="Архив СМР">
                            <Archive className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowSettings(true)} className="bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 transition-all flex items-center gap-2 hover:bg-gray-100">
                            <Settings className="w-4 h-4" /> Настройка СМР
                        </button>
                    </div>
                )}
            </div>

            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5 overflow-x-auto custom-scrollbar gap-1" data-tour="kp-tabs">
                <button
                    onClick={() => setActiveTab('to_fill')}
                    className={`relative flex-1 min-w-[100px] py-3 px-3 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'to_fill' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    К заполнению
                    <TabBadge count={data.to_fill.length} active={activeTab === 'to_fill'} />
                </button>
                {(isForemanOrBrigadier || isOffice) && (
                    <button
                        onClick={() => setActiveTab('pending_review')}
                        className={`relative flex-1 min-w-[100px] py-3 px-3 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'pending_review' ? 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        На проверку
                        <TabBadge count={data.pending_review.length} active={activeTab === 'pending_review'} />
                    </button>
                )}
                {(isForemanOrBrigadier || isOffice) && (
                    <button
                        onClick={() => setActiveTab('approved')}
                        className={`relative flex-1 min-w-[100px] py-3 px-3 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'approved' ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Готовые
                        <TabBadge count={data.approved.length} active={activeTab === 'approved'} />
                    </button>
                )}
            </div>

            {activeTab === 'approved' && isOffice && data.approved.length > 0 && (
                <div className="flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                    <button onClick={() => setSelectedForExport(selectedForExport.length === data.approved.length ? [] : data.approved.map(a => a.id))} className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Выделить все</button>
                    <button disabled={selectedForExport.length === 0 || isSubmitting} onClick={() => handleExportReport(selectedForExport)} className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" /> Скачать отчет ({selectedForExport.length})</button>
                </div>
            )}

            <GroupedSMRList
                items={data[activeTab] || []}
                tab={activeTab}
                isOffice={isOffice}
                tgId={tgId}
                isSmrLocked={isSmrLocked}
                smrUnlockTime={smrUnlockTime}
                selectedForExport={selectedForExport}
                setSelectedForExport={setSelectedForExport}
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
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `smr_${app.id}.xlsx`);
                        document.body.appendChild(link); link.click(); link.remove();
                        window.URL.revokeObjectURL(url);
                    } catch { toast.error('Не удалось скачать отчёт'); }
                }}
            />

            {modalApp && (
                <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl relative overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                            <div>
                                <h3 className="text-xl font-bold dark:text-white flex items-center gap-2"><FileText className="w-6 h-6 text-blue-500" /> Отчет о работах</h3>
                                <p className="text-sm text-gray-500 mt-1">{modalApp.obj_name} ({modalApp.date_target})</p>
                            </div>
                            <button onClick={() => setModalApp(null)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 border border-gray-100 dark:border-gray-700"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
                            {kpItems.length > 0 ? (
                                <div className="space-y-6">
                                    {Object.entries(kpItems.reduce((acc, curr) => { acc[curr.category] = acc[curr.category] || []; acc[curr.category].push(curr); return acc; }, {})).map(([cat, items]) => (
                                        <div key={cat} className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                            <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 text-xs font-bold text-gray-500 uppercase">{cat}</div>
                                            <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                                {items.map(item => (
                                                    <div key={item.kp_id} className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                                                        <div className="flex-1">
                                                            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{item.name}</p>
                                                            {isOffice && (
                                                                <p className="text-[10px] text-gray-400 mt-1">ЗП: {item.current_salary}₽ · Цена: {item.current_price}₽</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" min="0" step="0.1" disabled={activeTab !== 'to_fill' && !(activeTab === 'approved' && isOffice) && !(activeTab === 'pending_review' && isEditing)} value={item.volume} onChange={(e) => handleVolumeChange(item.kp_id, e.target.value)} className="w-20 p-2 text-center font-bold border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white" />
                                                            <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">{item.unit || ''}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-center text-gray-400 py-8">Работы не назначены.</p>}

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
                                {isOffice && (
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
                                                if (isEditing) payload.items = kpItems.map(i => ({ kp_id: i.kp_id, volume: i.volume || 0 }));
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

            {wizardApp && (
                <SMRWizard
                    appId={wizardApp.id}
                    app={wizardApp}
                    userRole={role}
                    tgId={tgId}
                    approveMode={wizardApproveMode}
                    onClose={() => { setWizardApp(null); setWizardApproveMode(false); }}
                    onSubmitted={() => { fetchApps(); }}
                />
            )}
        </main>
    );
}

// ============================================================
// v2.4.6 — Grouped SMR list (object → date → applications)
// ============================================================
function GroupedSMRList({
    items,
    tab,
    isOffice,
    tgId,
    isSmrLocked,
    smrUnlockTime,
    selectedForExport,
    setSelectedForExport,
    onFill,
    onReview,
    onView,
    onArchive,
    onRemind,
    onDownload,
}) {
    const groups = useMemo(() => groupByObjectAndDate(items), [items]);

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
                <div key={gi} className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {/* Object header */}
                    <div className="px-5 py-4 bg-gray-50/70 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700">
                        <ObjectDisplay
                            name={group.object_name}
                            address={group.object_address}
                            showIcon
                            nameClassName="font-bold text-base text-gray-900 dark:text-white leading-tight"
                            addressClassName="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                        />
                    </div>

                    {/* Date sections */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {group.dates.map(({ date, apps }) => (
                            <div key={date} className="px-5 py-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <CalendarIcon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                        {date}
                                    </span>
                                    <span className="text-[10px] text-gray-400">{apps.length} заявка{apps.length === 1 ? '' : apps.length < 5 ? 'и' : ''}</span>
                                </div>
                                <ul className="space-y-1.5">
                                    {apps.map(app => (
                                        <SMRGroupRow
                                            key={app.id}
                                            app={app}
                                            tab={tab}
                                            isOffice={isOffice}
                                            tgId={tgId}
                                            isSmrLocked={isSmrLocked}
                                            smrUnlockTime={smrUnlockTime}
                                            selectedForExport={selectedForExport}
                                            setSelectedForExport={setSelectedForExport}
                                            onFill={onFill}
                                            onReview={onReview}
                                            onView={onView}
                                            onArchive={onArchive}
                                            onRemind={onRemind}
                                            onDownload={onDownload}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function SMRGroupRow({
    app, tab, isOffice, tgId, isSmrLocked, smrUnlockTime,
    selectedForExport, setSelectedForExport,
    onFill, onReview, onView, onArchive, onRemind, onDownload,
}) {
    const isBrigadierSubmission = app.smr_filled_by_role === 'brigadier';

    return (
        <li className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/60 dark:bg-gray-900/20 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    Заявка №{app.id}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5">
                    <HardHat className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    {app.foreman_name || '—'}
                    {isBrigadierSubmission && tab === 'pending_review' && (
                        <span className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">
                            бригадир
                        </span>
                    )}
                </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                {isOffice && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onArchive(app); }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
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
                ) : tab === 'to_fill' && isSmrLocked ? (
                    <span className="text-xs font-medium text-gray-400 italic flex items-center gap-1">
                        <Clock className="w-3 h-3" /> до {smrUnlockTime}
                    </span>
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
                                className="w-4 h-4 text-emerald-600 rounded"
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
                            className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-1.5 rounded-lg border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors active:scale-95"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}
            </div>
        </li>
    );
}
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    FileText, CheckCircle, Clock, Search, X, MapPin,
    Download, Save, AlertTriangle, Edit3, Upload, Lock, Settings, Bell, HardHat, Plus, Trash2, Archive
} from 'lucide-react';

export default function KP() {
    const role = localStorage.getItem('user_role') || 'worker';
    const tgId = localStorage.getItem('tg_id') || '0';

    const isOffice = ['moderator', 'boss', 'superadmin'].includes(role);
    const isForemanOrBrigadier = ['foreman', 'brigadier'].includes(role);

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ to_fill: [], pending_review: [], approved: [] });
    const [activeTab, setActiveTab] = useState(isOffice ? 'approved' : 'to_fill');

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

    const fileInputRef = useRef(null);

    const fetchApps = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/kp/dashboard?tg_id=${tgId}`);
            setData(res.data);
            if (res.data[activeTab]?.length === 0) {
                if (res.data.to_fill.length > 0) setActiveTab('to_fill');
                else if (res.data.pending_review.length > 0) setActiveTab('pending_review');
                else if (res.data.approved.length > 0) setActiveTab('approved');
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchArchived = async () => {
        try {
            const res = await axios.get(`/api/kp/archived?tg_id=${tgId}`);
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
                axios.get(`/api/kp/apps/${app.id}/items?tg_id=${tgId}`),
                axios.get(`/api/kp/apps/${app.id}/extra_works?tg_id=${tgId}`),
                axios.get('/api/extra_works/catalog'),
            ]);
            setKpItems(res.data.map(i => ({
                ...i,
                volume: i.volume || '',
                current_salary: i.saved_salary !== null ? i.saved_salary : i.salary,
                current_price: i.saved_price !== null ? i.saved_price : i.price,
            })));
            setExtraWorksCatalog(catRes.data);
            setExtraWorks(ewRes.data.map(ew => ({
                extra_work_id: ew.extra_work_id,
                custom_name: ew.custom_name || ew.catalog_name || '',
                volume: ew.volume || '',
                salary: ew.salary || 0,
                price: ew.price || 0,
                unit: ew.catalog_unit || 'шт',
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
                    tg_id: tgId, role: role,
                    items: kpItems.map(i => ({ kp_id: i.kp_id, volume: i.volume || 0, ...(isOffice ? { salary: i.current_salary, price: i.current_price } : {}) }))
                }),
                axios.post(`/api/kp/apps/${modalApp.id}/extra_works/submit`, {
                    items: extraWorks.filter(ew => parseFloat(ew.volume || 0) > 0).map(ew => ({
                        extra_work_id: ew.extra_work_id,
                        custom_name: ew.custom_name,
                        volume: ew.volume || 0,
                        ...(isOffice ? { salary: ew.salary, price: ew.price } : { salary: 0, price: 0 })
                    }))
                }),
            ]);
            toast.success("Отчет отправлен!");
            setModalApp(null); fetchApps();
        } catch (e) { toast.error("Ошибка сохранения"); }
        setIsSubmitting(false);
    };

    const handleExportReport = async (appIds) => {
        setIsSubmitting(true);
        try {
            const res = await axios.post('/api/kp/export', { app_ids: appIds }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Отчет_работы_${new Date().toLocaleDateString()}.xlsx`);
            document.body.appendChild(link); link.click(); link.remove();
        } catch (e) { toast.error("Ошибка генерации Excel"); }
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
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24 flex flex-col items-center justify-center min-h-[60vh] text-gray-400 dark:text-gray-500">
                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-6 shadow-inner">
                    <Lock className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-xl font-bold">Доступ закрыт</p>
                <p className="text-sm mt-2 text-center max-w-sm">Заполнение сметных расчетов (СМР) доступно только бригадирам и руководству.</p>
            </main>
        );
    }

    if (loading) return <div className="mt-32 text-center text-gray-400 font-bold animate-pulse">Загрузка...</div>;

    return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex flex-col md:flex-row justify-between md:items-center bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <FileText className="w-8 h-8 text-emerald-500 mr-3" /> Выполненные работы
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

            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5 overflow-x-auto custom-scrollbar">
                <button onClick={() => setActiveTab('to_fill')} className={`flex-1 min-w-[120px] py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'to_fill' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>К заполнению ({data.to_fill.length})</button>
                {(isForemanOrBrigadier || isOffice) && <button onClick={() => setActiveTab('pending_review')} className={`flex-1 min-w-[120px] py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'pending_review' ? 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>На проверку ({data.pending_review.length})</button>}
                {(isForemanOrBrigadier || isOffice) && <button onClick={() => setActiveTab('approved')} className={`flex-1 min-w-[120px] py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'approved' ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Готовые ({data.approved.length})</button>}
            </div>

            {activeTab === 'approved' && isOffice && data.approved.length > 0 && (
                <div className="flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                    <button onClick={() => setSelectedForExport(selectedForExport.length === data.approved.length ? [] : data.approved.map(a => a.id))} className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Выделить все</button>
                    <button disabled={selectedForExport.length === 0 || isSubmitting} onClick={() => handleExportReport(selectedForExport)} className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" /> Скачать отчет ({selectedForExport.length})</button>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(data[activeTab] || []).map(app => (
                    <div key={app.id} className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md">{app.date_target}</span>
                            <div className="flex items-center gap-2">
                                {isOffice && (
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!window.confirm(`Архивировать СМР: ${app.obj_name || 'Объект'} (${app.date_target})?`)) return;
                                            try {
                                                await axios.post(`/api/kp/apps/${app.id}/archive`, { tg_id: parseInt(tgId) });
                                                toast.success('СМР перемещена в архив');
                                                fetchApps();
                                            } catch { toast.error('Ошибка архивации'); }
                                        }}
                                        className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                        title="В архив"
                                    >
                                        <Archive className="w-4 h-4" />
                                    </button>
                                )}
                                {activeTab === 'approved' && isOffice && <input type="checkbox" checked={selectedForExport.includes(app.id)} onChange={() => setSelectedForExport(prev => prev.includes(app.id) ? prev.filter(x => x !== app.id) : [...prev, app.id])} className="w-5 h-5 text-emerald-600 rounded" />}
                            </div>
                        </div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 flex items-start gap-1.5 mb-2 leading-tight"><MapPin className="w-4 h-4 text-red-500 mt-0.5" />{app.obj_name || 'Объект'}</h4>
                        <p className="text-xs text-gray-500 mb-4 flex items-center gap-1"><HardHat className="w-3.5 h-3.5 text-gray-400" /> {app.foreman_name}</p>
                        {activeTab === 'to_fill' && isOffice ? (
                            <button onClick={async () => {
                                try {
                                    const fd = new FormData();
                                    fd.append('tg_id', tgId);
                                    await axios.post(`/api/applications/${app.id}/remind`, fd);
                                    toast.success('Напоминание отправлено прорабу!');
                                } catch (e) { toast.error(e.response?.data?.detail || 'Ошибка отправки'); }
                            }} className="w-full bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 py-3 rounded-xl text-sm font-bold border border-orange-200 dark:border-orange-800/50 flex justify-center items-center gap-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors active:scale-[0.98]">
                                <Bell className="w-4 h-4" /> Напомнить
                            </button>
                        ) : activeTab === 'to_fill' && isSmrLocked ? (
                            <div className="w-full bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 py-3 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 flex justify-center items-center gap-2 cursor-not-allowed">
                                <Clock className="w-4 h-4" /> Откроется в {smrUnlockTime}
                            </div>
                        ) : (
                            <button onClick={() => openModal(app)} className="w-full bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 flex justify-center items-center gap-2">{activeTab === 'to_fill' ? 'Заполнить' : 'Посмотреть'}</button>
                        )}
                    </div>
                ))}
            </div>

            {modalApp && (
                <div className="fixed inset-0 w-screen h-[100dvh] z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
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
                                                        <div className="flex-1"><p className="font-bold text-sm text-gray-800 dark:text-gray-100">{item.name}</p>{isOffice ? <p className="text-[10px] text-gray-400 mt-1">ЗП: {item.current_salary}₽ · Цена: {item.current_price}₽ / {item.unit}</p> : <p className="text-[10px] text-gray-400 mt-1">{item.unit}</p>}</div>
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" min="0" step="0.1" disabled={activeTab !== 'to_fill' && !(activeTab === 'approved' && isOffice) && !(activeTab === 'pending_review' && isEditing)} value={item.volume} onChange={(e) => handleVolumeChange(item.kp_id, e.target.value)} className="w-20 p-2 text-center font-bold border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white" />
                                                            <span className="text-[10px] font-bold text-gray-400">{item.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-center text-gray-400 py-8">Работы не назначены.</p>}

                            {/* Доп. работы */}
                            {(extraWorks.length > 0 || activeTab === 'to_fill') && (
                                <div className="mt-6 border border-amber-200 dark:border-amber-700/50 rounded-2xl overflow-hidden">
                                    <div className="bg-yellow-50 dark:bg-yellow-900/30 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase flex items-center justify-between">
                                        <span>Доп. работы</span>
                                        {activeTab === 'to_fill' && (
                                            <button onClick={() => setExtraWorks(prev => [...prev, { extra_work_id: 0, custom_name: '', volume: '', salary: 0, price: 0, unit: 'шт' }])} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 transition-colors">
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="divide-y divide-yellow-100 dark:divide-yellow-900/20">
                                        {extraWorks.map((ew, idx) => (
                                            <div key={idx} className="p-4 bg-yellow-50/50 dark:bg-yellow-900/10 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                                <div className="flex-1 w-full">
                                                    {activeTab === 'to_fill' ? (
                                                        <select value={ew.extra_work_id || ''} onChange={(e) => {
                                                            const catItem = extraWorksCatalog.find(c => c.id === parseInt(e.target.value));
                                                            setExtraWorks(prev => prev.map((item, i) => i === idx ? {
                                                                ...item,
                                                                extra_work_id: catItem ? catItem.id : 0,
                                                                custom_name: catItem ? catItem.name : '',
                                                                unit: catItem ? catItem.unit : 'шт',
                                                                salary: catItem ? catItem.salary : 0,
                                                                price: catItem ? catItem.price : 0,
                                                            } : item));
                                                        }} className="w-full p-2 text-sm font-medium border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white">
                                                            <option value="">Выберите работу...</option>
                                                            {extraWorksCatalog.map(c => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                                                        </select>
                                                    ) : (
                                                        <div>
                                                            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{ew.custom_name}</p>
                                                            {isOffice && <p className="text-[10px] text-gray-400 mt-1">ЗП: {ew.salary}₽ · Цена: {ew.price}₽ / {ew.unit}</p>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" min="0" step="0.1" disabled={activeTab !== 'to_fill' && !(activeTab === 'approved' && isOffice) && !(activeTab === 'pending_review' && isEditing)} value={ew.volume} onChange={(e) => setExtraWorks(prev => prev.map((item, i) => i === idx ? { ...item, volume: e.target.value } : item))} className="w-20 p-2 text-center font-bold border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white" />
                                                    <span className="text-[10px] font-bold text-gray-400">{ew.unit}</span>
                                                    {activeTab === 'to_fill' && (
                                                        <button onClick={() => setExtraWorks(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 transition-colors p-1">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {extraWorks.length === 0 && activeTab !== 'to_fill' && (
                                            <p className="text-center text-gray-400 text-xs py-3">Нет доп. работ</p>
                                        )}
                                    </div>
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
                <div className="fixed inset-0 w-screen h-[100dvh] z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
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
                <div className="fixed inset-0 w-screen h-[100dvh] z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
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
                                                        await axios.post(`/api/kp/apps/${app.id}/restore`, { tg_id: parseInt(tgId) });
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
        </main>
    );
}
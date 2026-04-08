import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
    FileText, CheckCircle, Clock, Search, X, MapPin,
    Download, Save, AlertTriangle, Edit3, Upload, Lock
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

    useEffect(() => { fetchApps(); }, [tgId]);

    const openModal = async (app) => {
        setModalApp(app);
        try {
            const res = await axios.get(`/api/kp/apps/${app.id}/items`);
            setKpItems(res.data.map(i => ({
                ...i,
                volume: i.volume || '',
                current_salary: i.saved_salary !== null ? i.saved_salary : i.salary,
                current_price: i.saved_price !== null ? i.saved_price : i.price,
            })));
        } catch (e) { alert("Ошибка загрузки"); setModalApp(null); }
    };

    const handleVolumeChange = (kp_id, value) => {
        setKpItems(prev => prev.map(i => i.kp_id === kp_id ? { ...i, volume: value } : i));
    };

    const submitVolumes = async () => {
        setIsSubmitting(true);
        try {
            await axios.post(`/api/kp/apps/${modalApp.id}/submit`, {
                tg_id: tgId, role: role,
                items: kpItems.map(i => ({ kp_id: i.kp_id, volume: i.volume || 0, salary: i.current_salary, price: i.current_price }))
            });
            alert("Отчет отправлен!");
            setModalApp(null); fetchApps();
        } catch (e) { alert("Ошибка сохранения"); }
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
        } catch (e) { alert("Ошибка генерации Excel"); }
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
        } catch (e) { alert("Файл не найден на сервере. Загрузите его впервые."); }
    };

    const handleUploadCatalog = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        setIsSubmitting(true);
        try {
            await axios.post('/api/kp/catalog/upload', fd);
            alert("Справочник успешно обновлен!");
            fetchApps();
        } catch (e) { alert(e.response?.data?.detail || "Ошибка загрузки файла"); }
        setIsSubmitting(false);
        e.target.value = null;
    };

    const totalSalary = kpItems.reduce((acc, curr) => acc + (parseFloat(curr.volume || 0) * parseFloat(curr.current_salary || 0)), 0);
    const totalPrice = kpItems.reduce((acc, curr) => acc + (parseFloat(curr.volume || 0) * parseFloat(curr.current_price || 0)), 0);

    if (!['superadmin', 'boss', 'moderator', 'foreman', 'brigadier'].includes(role)) {
        return (
            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24 flex flex-col items-center justify-center min-h-[60vh] text-gray-400 dark:text-gray-500">
                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-6 shadow-inner">
                    <Lock className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-xl font-bold">Доступ закрыт</p>
                <p className="text-sm mt-2 text-center max-w-sm">Заполнение сметных расчетов (КП) доступно только бригадирам и руководству.</p>
            </main>
        );
    }

    if (loading) return <div className="mt-32 text-center text-gray-400 font-bold animate-pulse">Загрузка...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex flex-col md:flex-row justify-between md:items-center bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <FileText className="w-8 h-8 text-emerald-500 mr-3" /> Выполненные работы
                </h2>

                {isOffice && (
                    <div className="flex flex-wrap gap-2">
                        <input type="file" className="hidden" ref={fileInputRef} onChange={handleUploadCatalog} accept=".xlsx,.csv" />
                        <button onClick={() => fileInputRef.current.click()} className="flex-1 md:flex-none bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 transition-all flex items-center justify-center gap-2 hover:bg-gray-100">
                            <Upload className="w-4 h-4" /> Импорт
                        </button>
                        <button onClick={handleDownloadCatalog} className="flex-1 md:flex-none bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 transition-all flex items-center justify-center gap-2 hover:bg-gray-100">
                            <Download className="w-4 h-4" /> Экспорт
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
                            {activeTab === 'approved' && isOffice && <input type="checkbox" checked={selectedForExport.includes(app.id)} onChange={() => setSelectedForExport(prev => prev.includes(app.id) ? prev.filter(x => x !== app.id) : [...prev, app.id])} className="w-5 h-5 text-emerald-600 rounded" />}
                        </div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 flex items-start gap-1.5 mb-2 leading-tight"><MapPin className="w-4 h-4 text-red-500 mt-0.5" />{app.obj_name || 'Объект'}</h4>
                        <p className="text-xs text-gray-500 mb-4">Прораб: {app.foreman_name}</p>
                        <button onClick={() => openModal(app)} className="w-full bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-600 flex justify-center items-center gap-2">{activeTab === 'to_fill' ? 'Заполнить' : 'Посмотреть'}</button>
                    </div>
                ))}
            </div>

            {modalApp && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
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
                                                        <div className="flex-1"><p className="font-bold text-sm text-gray-800 dark:text-gray-100">{item.name}</p><p className="text-[10px] text-gray-400 mt-1">ЗП: {item.current_salary}₽ / {item.unit}</p></div>
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" min="0" step="0.1" disabled={activeTab !== 'to_fill' && !(activeTab === 'approved' && isOffice)} value={item.volume} onChange={(e) => handleVolumeChange(item.kp_id, e.target.value)} className="w-20 p-2 text-center font-bold border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white" />
                                                            <span className="text-[10px] font-bold text-gray-400">{item.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-center text-gray-400 py-8">Работы не назначены.</p>}
                        </div>
                        {kpItems.length > 0 && (
                            <div className="p-6 border-t bg-gray-50/50 dark:bg-gray-900/50">
                                <div className="flex justify-between items-center mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <span className="text-xs font-bold text-gray-400 uppercase">Сумма ЗП:</span>
                                    <span className="text-xl font-black text-gray-800 dark:text-white">{totalSalary.toLocaleString()} ₽</span>
                                </div>
                                <div className="flex gap-3">
                                    {activeTab === 'to_fill' && <button onClick={submitVolumes} className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-xl">Отправить отчет</button>}
                                    {activeTab === 'pending_review' && <button onClick={() => axios.post(`/api/kp/apps/${modalApp.id}/review`, {action: 'approve'}).then(() => fetchApps())} className="flex-1 bg-emerald-500 text-white font-bold py-4 rounded-xl">Одобрить</button>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
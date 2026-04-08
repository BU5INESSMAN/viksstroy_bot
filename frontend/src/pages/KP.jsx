import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    FileText, CheckCircle, Clock, Search, X, MapPin,
    Download, Save, AlertTriangle, Edit3
} from 'lucide-react';

export default function KP() {
    const role = localStorage.getItem('user_role') || 'worker';
    const tgId = localStorage.getItem('tg_id') || '0';

    const isOffice = ['moderator', 'boss', 'superadmin'].includes(role);
    const isForeman = role === 'foreman';

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ to_fill: [], pending_review: [], approved: [] });

    // Вкладки: 'to_fill', 'review', 'approved'
    const [activeTab, setActiveTab] = useState(isOffice ? 'approved' : 'to_fill');

    // Модалка заполнения / проверки
    const [modalApp, setModalApp] = useState(null);
    const [kpItems, setKpItems] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Массовый экспорт
    const [selectedForExport, setSelectedForExport] = useState([]);

    const fetchApps = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/kp/dashboard?tg_id=${tgId}`);
            setData(res.data);

            // Если вкладка пуста, переключим на первую непустую
            if (res.data[activeTab]?.length === 0) {
                if (res.data.to_fill.length > 0) setActiveTab('to_fill');
                else if (res.data.pending_review.length > 0) setActiveTab('pending_review');
                else if (res.data.approved.length > 0) setActiveTab('approved');
            }
        } catch (e) {
            console.error("Ошибка загрузки заявок КП", e);
        }
        setLoading(false);
    };

    useEffect(() => { fetchApps(); }, [tgId]);

    const openModal = async (app) => {
        setModalApp(app);
        try {
            const res = await axios.get(`/api/kp/apps/${app.id}/items`);
            // Если сохраненных цен нет (saved_salary=null), берем актуальные из справочника
            const items = res.data.map(i => ({
                ...i,
                volume: i.volume || '',
                current_salary: i.saved_salary !== null ? i.saved_salary : i.salary,
                current_price: i.saved_price !== null ? i.saved_price : i.price,
            }));
            setKpItems(items);
        } catch (e) {
            alert("Ошибка загрузки плана работ");
            setModalApp(null);
        }
    };

    const handleVolumeChange = (kp_id, value) => {
        setKpItems(prev => prev.map(i => i.kp_id === kp_id ? { ...i, volume: value } : i));
    };

    const submitVolumes = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                tg_id: tgId,
                items: kpItems.map(i => ({ kp_id: i.kp_id, volume: i.volume || 0, salary: i.current_salary, price: i.current_price }))
            };
            await axios.post(`/api/kp/apps/${modalApp.id}/submit`, payload);
            alert("Отчет успешно отправлен!");
            setModalApp(null);
            fetchApps();
        } catch (e) { alert("Ошибка сохранения"); }
        setIsSubmitting(false);
    };

    const updateVolumesOnly = async () => {
        setIsSubmitting(true);
        try {
            const payload = { items: kpItems.map(i => ({ kp_id: i.kp_id, volume: i.volume || 0 })) };
            await axios.post(`/api/kp/apps/${modalApp.id}/update_volumes`, payload);
            alert("Объемы обновлены!");
            setModalApp(null);
            fetchApps();
        } catch (e) { alert("Ошибка обновления"); }
        setIsSubmitting(false);
    };

    const reviewReport = async (action) => {
        setIsSubmitting(true);
        try {
            await axios.post(`/api/kp/apps/${modalApp.id}/review`, { action });
            alert(action === 'approve' ? "Отчет одобрен!" : "Отчет возвращен на доработку!");
            setModalApp(null);
            fetchApps();
        } catch (e) { alert("Ошибка модерации"); }
        setIsSubmitting(false);
    };

    const handleExport = async (appIds) => {
        setIsSubmitting(true);
        try {
            const res = await axios.post('/api/kp/export', { app_ids: appIds }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Экспорт_Выполненные_Работы_${new Date().toLocaleDateString()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (e) { alert("Ошибка генерации Excel. Возможно, нет заполненных объемов."); }
        setIsSubmitting(false);
    };

    const toggleExportSelect = (id) => {
        setSelectedForExport(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const selectAllExport = () => {
        if (selectedForExport.length === data.approved.length) setSelectedForExport([]);
        else setSelectedForExport(data.approved.map(a => a.id));
    };

    // Подсчет итогов для модалки
    const totalSalary = kpItems.reduce((acc, curr) => acc + (parseFloat(curr.volume || 0) * parseFloat(curr.current_salary || 0)), 0);
    const totalPrice = kpItems.reduce((acc, curr) => acc + (parseFloat(curr.volume || 0) * parseFloat(curr.current_price || 0)), 0);

    const getListByTab = () => data[activeTab] || [];

    if (loading) return <div className="mt-32 text-center text-gray-400 font-bold animate-pulse">Загрузка данных...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <FileText className="w-8 h-8 text-emerald-500 mr-3" /> Выполненные работы
                </h2>
                {isOffice && activeTab === 'approved' && data.approved.length > 0 && (
                    <button disabled={selectedForExport.length === 0 || isSubmitting} onClick={() => handleExport(selectedForExport)} className="bg-emerald-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 active:scale-95">
                        <Download className="w-4 h-4" /> Скачать выбранные ({selectedForExport.length})
                    </button>
                )}
            </div>

            {/* ВКЛАДКИ */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5 overflow-x-auto custom-scrollbar">
                <button onClick={() => setActiveTab('to_fill')} className={`flex-1 min-w-[120px] py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'to_fill' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    К заполнению <span className="ml-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs">{data.to_fill.length}</span>
                </button>
                {(isForeman || isOffice) && (
                    <button onClick={() => setActiveTab('pending_review')} className={`flex-1 min-w-[120px] py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'pending_review' ? 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                        На проверку <span className="ml-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs">{data.pending_review.length}</span>
                    </button>
                )}
                {(isForeman || isOffice) && (
                    <button onClick={() => setActiveTab('approved')} className={`flex-1 min-w-[120px] py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === 'approved' ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                        Готовые <span className="ml-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs">{data.approved.length}</span>
                    </button>
                )}
            </div>

            {/* СПИСОК ЗАЯВОК */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeTab === 'approved' && isOffice && data.approved.length > 0 && (
                    <div className="col-span-full mb-2">
                        <button onClick={selectAllExport} className="text-sm font-bold text-blue-600 hover:underline">
                            {selectedForExport.length === data.approved.length ? 'Снять выделение со всех' : 'Выделить все для экспорта'}
                        </button>
                    </div>
                )}

                {getListByTab().map(app => (
                    <div key={app.id} className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">{app.date_target}</span>
                            {activeTab === 'approved' && isOffice && (
                                <input type="checkbox" checked={selectedForExport.includes(app.id)} onChange={() => toggleExportSelect(app.id)} className="w-5 h-5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500" />
                            )}
                        </div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 flex items-start gap-1.5 mb-2 leading-tight">
                            <MapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            {app.obj_name || 'Объект не указан'}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 font-medium">Прораб: {app.foreman_name}</p>

                        <button onClick={() => openModal(app)} className="w-full bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 py-3 rounded-xl text-sm font-bold transition-colors border border-gray-200 dark:border-gray-600 flex justify-center items-center gap-2">
                            {activeTab === 'to_fill' ? <Edit3 className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                            {activeTab === 'to_fill' ? 'Заполнить объемы' : 'Посмотреть'}
                        </button>
                    </div>
                ))}
                {getListByTab().length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-400 italic bg-gray-50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                        В этой вкладке пока нет заявок.
                    </div>
                )}
            </div>

            {/* МОДАЛЬНОЕ ОКНО ЗАПОЛНЕНИЯ / ПРОВЕРКИ */}
            {modalApp && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl relative overflow-hidden">

                        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                            <div>
                                <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                                    <FileText className="w-6 h-6 text-blue-500" /> Отчет о выполненных работах
                                </h3>
                                <p className="text-sm text-gray-500 font-medium mt-1">{modalApp.obj_name} ({modalApp.date_target})</p>
                            </div>
                            <button onClick={() => setModalApp(null)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 border border-gray-100 dark:border-gray-700"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
                            {kpItems.length > 0 ? (
                                <div className="space-y-6">
                                    {Object.entries(kpItems.reduce((acc, curr) => {
                                        acc[curr.category] = acc[curr.category] || [];
                                        acc[curr.category].push(curr);
                                        return acc;
                                    }, {})).map(([category, items]) => (
                                        <div key={category} className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 border-b border-gray-100 dark:border-gray-700 font-bold text-xs uppercase tracking-wider text-gray-500">{category}</div>
                                            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                                {items.map(item => {
                                                    // Формируем права доступа к инпутам
                                                    const canEdit = activeTab === 'to_fill' || (activeTab === 'approved' && isOffice);

                                                    return (
                                                        <div key={item.kp_id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-800">
                                                            <div className="flex-1">
                                                                <p className="font-bold text-sm text-gray-800 dark:text-gray-100 leading-tight">{item.name}</p>
                                                                {isOffice ? (
                                                                    <p className="text-xs text-gray-500 mt-1 font-medium flex gap-3">
                                                                        <span>ЗП: {item.current_salary}₽</span>
                                                                        <span>Цена: {item.current_price}₽</span>
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-xs text-gray-500 mt-1 font-medium">Ставка: {item.current_salary} руб / {item.unit}</p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    min="0" step="0.01"
                                                                    disabled={!canEdit || isSubmitting}
                                                                    value={item.volume}
                                                                    onChange={(e) => handleVolumeChange(item.kp_id, e.target.value)}
                                                                    placeholder="0"
                                                                    className="w-24 p-2.5 text-center font-bold border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:text-white disabled:opacity-75 disabled:bg-gray-100 dark:disabled:bg-gray-800 transition-all"
                                                                />
                                                                <span className="text-xs font-bold text-gray-400 w-10">{item.unit}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 flex flex-col items-center">
                                    <AlertTriangle className="w-12 h-12 text-yellow-400 mb-3 opacity-50" />
                                    <p>В этой заявке нет запланированных работ.</p>
                                    <p className="text-sm mt-1">Офис должен назначить План работ для этого объекта.</p>
                                </div>
                            )}
                        </div>

                        {kpItems.length > 0 && (
                            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50">
                                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-sm">
                                    <span className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs mb-2 sm:mb-0">Ориентировочная сумма:</span>
                                    <div className="text-right flex gap-6">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Сумма ЗП</p>
                                            <p className="text-xl font-black text-gray-800 dark:text-white">{totalSalary.toLocaleString('ru-RU')} ₽</p>
                                        </div>
                                        {isOffice && (
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">Сумма Цена</p>
                                                <p className="text-xl font-black text-blue-600 dark:text-blue-400">{totalPrice.toLocaleString('ru-RU')} ₽</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3">
                                    {activeTab === 'to_fill' && (
                                        <button disabled={isSubmitting} onClick={submitVolumes} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                                            <Save className="w-5 h-5" /> Отправить отчет
                                        </button>
                                    )}

                                    {activeTab === 'pending_review' && (
                                        <>
                                            <button disabled={isSubmitting} onClick={() => reviewReport('reject')} className="flex-1 bg-red-50 text-red-600 font-bold py-4 rounded-xl border border-red-200 hover:bg-red-100 transition-all flex justify-center items-center gap-2">
                                                <X className="w-5 h-5" /> Вернуть (Ошибка)
                                            </button>
                                            <button disabled={isSubmitting} onClick={() => reviewReport('approve')} className="flex-[2] bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-md hover:bg-emerald-600 transition-all flex justify-center items-center gap-2">
                                                <CheckCircle className="w-5 h-5" /> Одобрить отчет
                                            </button>
                                        </>
                                    )}

                                    {activeTab === 'approved' && isOffice && (
                                        <div className="w-full flex gap-3">
                                            <button disabled={isSubmitting} onClick={updateVolumesOnly} className="flex-[2] bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                                                <Save className="w-5 h-5" /> Сохранить изменения цифр
                                            </button>
                                            <button disabled={isSubmitting} onClick={() => handleExport([modalApp.id])} className="flex-[1] bg-emerald-50 text-emerald-700 font-bold py-4 rounded-xl border border-emerald-200 hover:bg-emerald-100 transition-all flex justify-center items-center gap-2">
                                                <Download className="w-5 h-5" /> Excel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
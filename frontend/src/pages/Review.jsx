import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, Clock, CheckCircle, HardHat, Flag,
    XCircle, Search, Undo, Send, ChevronDown, ChevronUp, User, X, Check
} from 'lucide-react';

import { getTodayStr } from '../utils/dateUtils';
import useConfirm from '../hooks/useConfirm';
import ScheduleModal from '../features/applications/components/ScheduleModal';

const ReviewSection = ({ title, icon: Icon, colorClass, titleColorClass, apps, statusType, renderAppCard }) => {
    const [showAll, setShowAll] = useState(false);
    const displayedApps = showAll ? apps : apps.slice(0, 10);

    if (apps.length === 0) return null;

    return (
        <div className={`bg-gray-50/80 dark:bg-gray-800/40 rounded-3xl p-5 border ${colorClass} transition-all duration-300 shadow-sm`}>
            <h3 className={`font-bold mb-4 flex items-center text-lg ${titleColorClass}`}>
                <Icon className="w-6 h-6 mr-2" /> {title}
                <span className="ml-2 bg-white/60 dark:bg-black/20 text-gray-800 dark:text-white text-xs px-2.5 py-0.5 rounded-full shadow-sm">{apps.length}</span>
            </h3>
            <div className="space-y-4">
                {displayedApps.map(a => renderAppCard(a, statusType))}
            </div>
            {apps.length > 10 && (
                <button onClick={() => setShowAll(!showAll)} className="w-full mt-4 py-3 text-sm font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-white/50 hover:bg-white dark:bg-gray-800/50 dark:hover:bg-gray-800 rounded-xl transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2">
                    {showAll ? <><ChevronUp className="w-4 h-4" /> Свернуть</> : <><ChevronDown className="w-4 h-4" /> Показать все ({apps.length})</>}
                </button>
            )}
        </div>
    );
};

export default function Review() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const { openProfile } = useOutletContext();
    const [reviewApps, setReviewApps] = useState([]);

    const [selectedApp, setSelectedApp] = useState(null);
    const [isPublishModalOpen, setPublishModalOpen] = useState(false);
    const [publishDateFilter, setPublishDateFilter] = useState('');
    const [selectedToPublish, setSelectedToPublish] = useState([]);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isScheduleOpen, setScheduleOpen] = useState(false);
    const { confirm, prompt, ConfirmUI } = useConfirm();

    const fetchData = () => {
        axios.get(`/api/applications/review?tg_id=${tgId}`).then(res => setReviewApps(res.data || [])).catch(() => {});
    };

    useEffect(() => { fetchData(); }, []);

    const handleReviewAction = async (status) => {
        let reason = '';
        if (status === 'rejected') {
            reason = await prompt('Укажите причину отклонения/отзыва заявки (увидит прораб):', { title: 'Отклонение заявки', placeholder: 'Причина...' });
            if (reason === null) return;
        } else if (status === 'completed') {
            const ok = await confirm('Завершить заявку досрочно и освободить всю технику?', { title: 'Досрочное завершение', variant: 'warning', confirmText: 'Завершить' });
            if (!ok) return;
        } else {
            const ok = await confirm('Одобрить заявку?', { title: 'Одобрение заявки', variant: 'info', confirmText: 'Одобрить' });
            if (!ok) return;
        }

        setIsProcessing(true);
        try {
            const fd = new FormData();
            fd.append('new_status', status);
            fd.append('tg_id', tgId);
            if (reason) fd.append('reason', reason);

            await axios.post(`/api/applications/${selectedApp.id}/review`, fd);
            setSelectedApp(null);
            fetchData();
        } catch (err) {
            toast.error("Ошибка при обновлении статуса");
        } finally {
            setIsProcessing(false);
        }
    };

    const openPublishModal = () => {
        setPublishDateFilter('');
        setSelectedToPublish(approvedApps.map(a => a.id));
        setPublishModalOpen(true);
    };

    const togglePublishSelect = (id) => {
        if (isProcessing) return;
        setSelectedToPublish(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleExecutePublish = async () => {
        if(selectedToPublish.length === 0) return toast.error("Выберите хотя бы одну заявку!");

        setIsProcessing(true);
        try {
            const fd = new FormData();
            fd.append('app_ids', selectedToPublish.join(','));
            fd.append('tg_id', tgId);
            const res = await axios.post('/api/applications/publish', fd);
            toast.success(`Опубликовано нарядов: ${res.data.published}`);
            setPublishModalOpen(false);
            fetchData();
        } catch(e) {
            toast.error("Ошибка публикации");
        } finally {
            setIsProcessing(false);
        }
    };

    const isModOrBoss = ['moderator', 'boss', 'superadmin'].includes(role);

    const todayYYYYMMDD = getTodayStr();

    const waitingApps = reviewApps.filter(a => a.status === 'waiting');
    const approvedApps = reviewApps.filter(a => a.status === 'approved');
    const inProgressApps = reviewApps.filter(a => a.status === 'in_progress' || a.status === 'published');
    const completedApps = reviewApps.filter(a => a.status === 'completed');

    const filteredForPublish = publishDateFilter
        ? approvedApps.filter(a => a.date_target === publishDateFilter && a.status === 'approved')
        : approvedApps.filter(a => a.status === 'approved');

    const canModerate = ['moderator', 'boss', 'superadmin'].includes(role);

    const renderAppCard = (app, statusType) => {
        let equipList = [];
        if (app.equipment_data) {
            try {
                const parsed = JSON.parse(app.equipment_data);
                if (parsed && parsed.length > 0) equipList = parsed;
            } catch(e){}
        }

        // Парсим ID бригад, чтобы вывести их раздельно
        const teamIds = app.team_id && app.team_id !== '0' ? String(app.team_id).split(',').map(Number) : [];
        const freedTeamIds = app.freed_team_ids ? String(app.freed_team_ids).split(',').map(Number) : [];

        return (
            <div key={app.id} onClick={() => setSelectedApp(app)} className="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100/80 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between gap-4 transition-all duration-200 cursor-pointer hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 active:scale-[0.99] group">
                <div className="text-sm w-full md:w-3/4">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest font-bold mb-2">
                        <span>Наряд №{app.id}</span>
                        <span className="w-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {app.date_target}</span>
                    </div>

                    <p className="font-bold dark:text-white text-base group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-start gap-1.5 leading-tight mb-3">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                        <span>{app.object_address}</span>
                    </p>

                    <div className="bg-gray-50 dark:bg-gray-700/30 p-3 rounded-xl border border-gray-100 dark:border-gray-600/50 space-y-2.5">
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-medium flex items-center gap-1.5">
                            <HardHat className="w-4 h-4 text-gray-400" />
                            {app.foreman_id ? (
                                <button type="button" onClick={(e) => { e.stopPropagation(); openProfile(app.foreman_id); }} className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-left">
                                    {app.foreman_name || 'Неизвестный прораб'}
                                </button>
                            ) : (
                                <span>{app.foreman_name || 'Неизвестный прораб'}</span>
                            )}
                        </p>

                        {/* Раздельное отображение бригад */}
                        <div className="space-y-1.5">
                            {teamIds.length > 0 ? (
                                teamIds.map(tId => {
                                    const tMembers = app.members_data?.filter(m => m.team_id === tId) || [];
                                    const tName = tMembers.length > 0 ? tMembers[0].team_name : `Бригада #${tId}`;
                                    const isFreed = freedTeamIds.includes(tId) || app.is_team_freed === 1;

                                    return (
                                        <p key={tId} className={`text-xs flex items-center gap-1.5 ${isFreed ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'}`}>
                                            <Users className={`w-3.5 h-3.5 ${isFreed ? 'text-gray-400' : 'text-indigo-400'}`} />
                                            <span className="font-medium">{tName}</span>
                                            {isFreed && <span className="ml-1 text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Свободна</span>}
                                        </p>
                                    );
                                })
                            ) : (
                                <p className="text-xs text-gray-500 italic flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Без бригад (только техника)</p>
                            )}
                        </div>

                        {equipList.length > 0 && (
                            <div className="pt-1 space-y-1.5 border-t border-gray-200 dark:border-gray-600/50">
                                {equipList.map((eq, idx) => (
                                    <p key={idx} className={`text-xs truncate flex items-center gap-1.5 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400 font-medium'}`}>
                                        <Truck className={`w-3.5 h-3.5 ${eq.is_freed ? 'text-gray-400' : 'text-blue-400'}`} />
                                        <span>{eq.name}</span>
                                        {eq.is_freed && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end justify-center min-w-[140px] pt-2 md:pt-0">
                    {statusType === 'waiting' && <span className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs font-bold px-3 py-2 rounded-xl border border-yellow-200 dark:border-yellow-700/50 text-center w-full md:w-auto shadow-sm flex items-center justify-center gap-1.5"><Clock className="w-3.5 h-3.5" /> На модерации</span>}
                    {statusType === 'approved' && app.status === 'approved' && <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-700/50 text-center w-full md:w-auto shadow-sm flex items-center justify-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Одобрено</span>}
                    {statusType === 'approved' && app.status === 'published' && <span className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-xs font-bold px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-700/50 text-center w-full md:w-auto shadow-sm flex items-center justify-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Ожидает начала</span>}
                    {statusType === 'published' && <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-bold px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-700/50 text-center w-full md:w-auto shadow-sm flex items-center justify-center gap-1.5"><HardHat className="w-3.5 h-3.5" /> В работе</span>}
                </div>
            </div>
        );
    };

    return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24 relative">

            {isProcessing && isPublishModalOpen && (
                <div className="fixed inset-0 w-screen h-[100dvh] z-[200] bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center transition-opacity">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center border border-gray-100 dark:border-gray-700">
                        <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Публикация нарядов...</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Пожалуйста, не закрывайте страницу</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 border border-gray-100 dark:border-gray-700 gap-4">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <ClipboardList className="w-7 h-7 text-blue-500 mr-2.5" /> Управление заявками
                </h2>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {isModOrBoss && (
                        <button onClick={() => setScheduleOpen(true)} disabled={isProcessing} className="w-full sm:w-auto bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                            <Calendar className="w-4 h-4" /> Расстановка
                        </button>
                    )}
                    {filteredForPublish.length > 0 && (
                        <button onClick={openPublishModal} disabled={isProcessing} className="w-full sm:w-auto bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                            <Send className="w-4 h-4" /> Опубликовать ({filteredForPublish.length})
                        </button>
                    )}
                </div>
            </div>

            <ReviewSection title="Требуют проверки" icon={Clock} colorClass="border-yellow-200 dark:border-yellow-900/30" titleColorClass="text-yellow-700 dark:text-yellow-500" apps={waitingApps} statusType="waiting" renderAppCard={renderAppCard} />
            <ReviewSection title="Одобрены (ожидают начала)" icon={CheckCircle} colorClass="border-emerald-200 dark:border-emerald-900/30" titleColorClass="text-emerald-700 dark:text-emerald-500" apps={approvedApps} statusType="approved" renderAppCard={renderAppCard} />
            <ReviewSection title="В работе" icon={HardHat} colorClass="border-blue-200 dark:border-blue-900/30" titleColorClass="text-blue-700 dark:text-blue-500" apps={inProgressApps} statusType="published" renderAppCard={renderAppCard} />
            <ReviewSection title="Завершены" icon={Flag} colorClass="border-gray-200 dark:border-gray-700" titleColorClass="text-gray-600 dark:text-gray-400" apps={completedApps} statusType="completed" renderAppCard={renderAppCard} />

            {reviewApps.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Активных заявок пока нет</p>
                </div>
            )}

            {/* МОДАЛЬНОЕ ОКНО ПУБЛИКАЦИИ */}
            {isPublishModalOpen && (
                <div className="fixed inset-0 w-screen h-[100dvh] z-[120] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden border border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                                <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                                    <Send className="w-5 h-5 text-emerald-500" /> Опубликовать заявки
                                </h3>
                                <button disabled={isProcessing} onClick={() => setPublishModalOpen(false)} className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Фильтр по дате:</label>
                                    <div className="flex space-x-2">
                                        <button disabled={isProcessing} onClick={() => setPublishDateFilter('')} className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 disabled:opacity-50 ${!publishDateFilter ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Все даты</button>
                                        <input type="date" disabled={isProcessing} value={publishDateFilter} onChange={e => setPublishDateFilter(e.target.value)} className="flex-1 px-3 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner" />
                                    </div>
                                </div>

                                <div className="max-h-72 overflow-y-auto space-y-2 border border-gray-100 dark:border-gray-700 p-2.5 rounded-2xl bg-gray-50/80 dark:bg-gray-900/30 custom-scrollbar">
                                    {filteredForPublish.map(app => (
                                        <div key={app.id} onClick={() => togglePublishSelect(app.id)} className={`p-4 rounded-xl border cursor-pointer flex items-center transition-all active:scale-[0.99] ${isProcessing ? 'opacity-70 cursor-not-allowed' : ''} ${selectedToPublish.includes(app.id) ? 'bg-emerald-50/80 border-emerald-500 dark:bg-emerald-900/30 shadow-sm ring-1 ring-emerald-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                                            <div className={`w-5 h-5 mr-3.5 rounded flex items-center justify-center border transition-colors ${selectedToPublish.includes(app.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                                {selectedToPublish.includes(app.id) && <Check className="w-3.5 h-3.5" />}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-sm dark:text-white leading-tight mb-1">{app.object_address}</p>
                                                <p className="text-xs text-gray-500 flex items-center gap-1.5 font-medium"><Calendar className="w-3 h-3" /> {app.date_target}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredForPublish.length === 0 && <p className="text-center text-sm text-gray-500 py-6 italic flex flex-col items-center gap-2"><Search className="w-6 h-6 opacity-30" /> Нет заявок по этому фильтру</p>}
                                </div>

                                <div className="flex space-x-3 pt-4 border-t border-gray-100 dark:border-gray-700/80">
                                    <button disabled={isProcessing} onClick={() => setPublishModalOpen(false)} className="w-1/3 bg-white border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 py-3.5 rounded-xl disabled:opacity-50 font-bold text-gray-700 dark:text-gray-300 transition-all active:scale-[0.98] shadow-sm">Отмена</button>
                                    <button disabled={isProcessing || selectedToPublish.length === 0} onClick={handleExecutePublish} className="w-2/3 bg-emerald-500 text-white py-3.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
                                        {isProcessing ? '⏳ Обработка...' : <><Send className="w-4 h-4" /> Опубликовать ({selectedToPublish.length})</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* МОДАЛЬНОЕ ОКНО ЗАЯВКИ (ИНДИВИДУАЛЬНОЕ) */}
            {selectedApp && (
                <div className="fixed inset-0 w-screen h-[100dvh] z-[110] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden border border-gray-100 dark:border-gray-700">

                            {isProcessing && (
                                <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                                </div>
                            )}

                            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                                <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                                    <ClipboardList className="w-6 h-6 text-blue-500" /> Наряд №{selectedApp.id}
                                </h3>
                                <button disabled={isProcessing} onClick={() => setSelectedApp(null)} className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6 text-sm">
                                <div className="space-y-5">
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                            <Calendar className="w-4 h-4" /> Дата выезда
                                        </label>
                                        <p className="font-bold text-gray-800 dark:text-gray-100 text-lg bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl inline-block border border-gray-100 dark:border-gray-600/50">{selectedApp.date_target}</p>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                            <MapPin className="w-4 h-4" /> Адрес объекта
                                        </label>
                                        <p className="font-bold text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-100 dark:border-gray-600/50">{selectedApp.object_address}</p>

                                        <div className="mt-4 flex items-center p-4 bg-gray-50/80 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600/50 shadow-sm">
                                            <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-full mr-4 text-blue-600 dark:text-blue-400">
                                                <HardHat className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-0.5">Прораб (Создатель заявки)</p>
                                                {selectedApp.foreman_id ? (
                                                    <button type="button" disabled={isProcessing} onClick={() => { setSelectedApp(null); openProfile(selectedApp.foreman_id); }} className="text-sm font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50 hover:underline text-left">
                                                        {selectedApp.foreman_name}
                                                    </button>
                                                ) : (
                                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{selectedApp.foreman_name}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <hr className="border-gray-100 dark:border-gray-700/80" />

                                <div className="space-y-4">
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        <Users className="w-4 h-4" /> Состав бригад
                                    </label>

                                    <div className="flex flex-col gap-4">
                                        {selectedApp.team_id && selectedApp.team_id !== '0' ? (
                                            selectedApp.team_id.toString().split(',').map(Number).map(teamId => {
                                                const tMembers = selectedApp.members_data?.filter(m => m.team_id === teamId) || [];
                                                const tName = tMembers.length > 0 ? tMembers[0].team_name : `Бригада`;
                                                const isThisFreed = (selectedApp.freed_team_ids && selectedApp.freed_team_ids.includes(teamId)) || selectedApp.is_team_freed === 1;

                                                return (
                                                    <div key={teamId} className="p-4 bg-gray-50/80 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600/50 rounded-2xl shadow-sm">
                                                        <div className="flex justify-between items-center mb-4">
                                                            <h4 className={`font-bold flex items-center gap-2 ${isThisFreed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                                                                <div className={`p-1.5 rounded-lg ${isThisFreed ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500'}`}>
                                                                    <Users className="w-4 h-4" />
                                                                </div>
                                                                {tName}
                                                            </h4>
                                                            {isThisFreed && <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-md flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Свободна</span>}
                                                        </div>
                                                        {tMembers.length > 0 ? (
                                                            <div className="flex flex-wrap gap-2.5">
                                                                {tMembers.map(m => (
                                                                    <button
                                                                        type="button"
                                                                        key={m.id}
                                                                        disabled={isProcessing}
                                                                        onClick={() => { setSelectedApp(null); openProfile(m.tg_user_id, 'member', m.id); }}
                                                                        className="px-3.5 py-2 bg-white dark:bg-gray-800 disabled:opacity-50 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold border border-gray-200 dark:border-gray-700 rounded-xl text-xs transition-all flex items-center gap-2 shadow-sm active:scale-95 hover:shadow-md"
                                                                    >
                                                                        <User className="w-3.5 h-3.5 text-gray-400" /> {m.fio}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ) : <p className="text-xs text-gray-500 italic bg-white dark:bg-gray-800 p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">Нет рабочих</p>}
                                                    </div>
                                                )
                                            })
                                        ) : (
                                            <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center">
                                                <Truck className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                                <p className="font-medium text-gray-600 dark:text-gray-300">Только техника (люди не требуются)</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <hr className="border-gray-100 dark:border-gray-700/80" />

                                <div className="space-y-4">
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        <Truck className="w-4 h-4" /> Требуемая техника
                                    </label>
                                    {selectedApp.equipment_data && JSON.parse(selectedApp.equipment_data).length > 0 ? (
                                        <div className="space-y-2.5">
                                            {JSON.parse(selectedApp.equipment_data).map(eq => (
                                                <div key={eq.id} className="flex justify-between items-center bg-gray-50/80 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600/50 shadow-sm transition-all hover:bg-white dark:hover:bg-gray-700">
                                                    <button type="button" disabled={isProcessing} onClick={() => { setSelectedApp(null); openProfile(0, 'equip', eq.id); }} className={`font-bold flex items-center gap-2 hover:underline disabled:opacity-50 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
                                                        <Truck className={`w-4 h-4 ${eq.is_freed ? 'text-gray-400' : 'text-blue-500'}`} />
                                                        {eq.name}
                                                        {eq.is_freed && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                                                    </button>
                                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-300 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center gap-1.5 shadow-sm">
                                                        <Clock className="w-3.5 h-3.5" /> {eq.time_start}:00 - {eq.time_end}:00
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 italic bg-gray-50 dark:bg-gray-700/30 p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-center">Не требуется</p>
                                    )}
                                </div>
                                <hr className="border-gray-100 dark:border-gray-700/80" />

                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                        <MessageSquare className="w-4 h-4" /> Комментарий
                                    </label>
                                    <div className="bg-gray-50/80 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600/50">
                                        <p className="font-medium text-gray-800 dark:text-gray-100">{selectedApp.comment || <span className="text-gray-400 italic">Нет комментариев</span>}</p>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                                    {selectedApp.status === 'waiting' && canModerate && (
                                        <>
                                            <button disabled={isProcessing} onClick={() => handleReviewAction('rejected')} className="w-full sm:w-1/2 bg-red-50 text-red-600 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 py-3.5 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-all active:scale-[0.98] border border-red-200 dark:border-red-800 flex items-center justify-center gap-2 shadow-sm">
                                                <XCircle className="w-4 h-4" /> Отклонить
                                            </button>
                                            <button disabled={isProcessing} onClick={() => handleReviewAction('approved')} className="w-full sm:w-1/2 bg-emerald-500 text-white disabled:opacity-50 py-3.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-emerald-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                                                <CheckCircle className="w-4 h-4" /> Одобрить
                                            </button>
                                        </>
                                    )}
                                    {selectedApp.status === 'approved' && canModerate && (
                                        <button disabled={isProcessing} onClick={() => handleReviewAction('rejected')} className="w-full bg-red-50 text-red-600 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 py-3.5 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-all active:scale-[0.98] border border-red-200 dark:border-red-800 flex items-center justify-center gap-2 shadow-sm">
                                            <Undo className="w-4 h-4" /> Отозвать заявку
                                        </button>
                                    )}
                                                    {(selectedApp.status === 'published' || selectedApp.status === 'in_progress') && canModerate && (
                                        <button disabled={isProcessing} onClick={() => handleReviewAction('completed')} className="w-full bg-gray-800 text-white disabled:opacity-50 dark:bg-gray-700 py-3.5 rounded-xl font-bold hover:bg-gray-900 dark:hover:bg-gray-600 transition-all active:scale-[0.98] shadow-md hover:shadow-lg flex items-center justify-center gap-2">
                                            <Flag className="w-4 h-4" /> Отменить / Завершить наряд
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <ScheduleModal isOpen={isScheduleOpen} onClose={() => setScheduleOpen(false)} tgId={tgId} />
            {ConfirmUI}
        </main>
    );
}
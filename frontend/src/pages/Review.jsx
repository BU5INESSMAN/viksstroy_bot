import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';

const getTodayStr = () => {
    try {
        return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Barnaul'}).format(new Date());
    } catch(e) {
        return new Date().toISOString().split('T')[0];
    }
};

const ReviewSection = ({ title, icon, colorClass, titleColorClass, apps, statusType, renderAppCard }) => {
    const [showAll, setShowAll] = useState(false);
    const displayedApps = showAll ? apps : apps.slice(0, 10);

    if (apps.length === 0) return null;

    return (
        <div className={`bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border ${colorClass}`}>
            <h3 className={`font-bold mb-4 flex items-center ${titleColorClass}`}>
                <span className="mr-2 text-xl">{icon}</span> {title}
                <span className="ml-2 bg-white/60 dark:bg-black/20 text-gray-800 dark:text-white text-xs px-2 py-0.5 rounded-full shadow-sm">{apps.length}</span>
            </h3>
            <div className="space-y-3">
                {displayedApps.map(a => renderAppCard(a, statusType))}
            </div>
            {apps.length > 10 && (
                <button onClick={() => setShowAll(!showAll)} className="w-full mt-3 py-2 text-sm font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg transition-colors shadow-sm">
                    {showAll ? 'Свернуть 🔼' : `Показать все (${apps.length}) 🔽`}
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

    const fetchData = () => {
        axios.get('/api/applications/review').then(res => setReviewApps(res.data || [])).catch(() => {});
    };

    useEffect(() => { fetchData(); }, []);

    const handleReviewAction = async (status) => {
        let reason = '';
        if (status === 'rejected') {
            reason = window.prompt('Укажите причину отклонения/отзыва заявки (увидит прораб):');
            if (reason === null) return;
        } else if (status === 'completed') {
            if (!window.confirm('Завершить заявку досрочно и освободить всю технику?')) return;
        } else {
            if (!window.confirm('Одобрить заявку?')) return;
        }

        try {
            const fd = new FormData();
            fd.append('new_status', status);
            fd.append('tg_id', tgId);
            if (reason) fd.append('reason', reason);

            await axios.post(`/api/applications/${selectedApp.id}/review`, fd);
            setSelectedApp(null);
            fetchData();
        } catch (err) { alert("Ошибка при обновлении статуса"); }
    };

    const openPublishModal = () => {
        setPublishDateFilter('');
        setSelectedToPublish(approvedApps.map(a => a.id));
        setPublishModalOpen(true);
    };

    const togglePublishSelect = (id) => {
        setSelectedToPublish(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleExecutePublish = async () => {
        if(selectedToPublish.length === 0) return alert("Выберите хотя бы одну заявку!");
        try {
            const fd = new FormData();
            fd.append('app_ids', selectedToPublish.join(','));
            fd.append('tg_id', tgId);
            const res = await axios.post('/api/applications/publish', fd);
            alert(`Опубликовано нарядов: ${res.data.published}`);
            setPublishModalOpen(false);
            fetchData();
        } catch(e) { alert("Ошибка публикации"); }
    };

    const todayYYYYMMDD = getTodayStr();

    const waitingApps = reviewApps.filter(a => a.status === 'waiting');

    const approvedApps = reviewApps.filter(a => a.status === 'approved' || (a.status === 'published' && a.date_target > todayYYYYMMDD));

    const publishedApps = reviewApps.filter(a => (a.status === 'published' || a.status === 'in_progress') && a.date_target <= todayYYYYMMDD);

    const filteredForPublish = publishDateFilter
        ? approvedApps.filter(a => a.date_target === publishDateFilter && a.status === 'approved')
        : approvedApps.filter(a => a.status === 'approved');

    const renderAppCard = (app, statusType) => {
        let equipList = [];
        if (app.equipment_data) {
            try {
                const parsed = JSON.parse(app.equipment_data);
                if (parsed && parsed.length > 0) equipList = parsed;
            } catch(e){}
        }

        return (
            <div key={app.id} onClick={() => setSelectedApp(app)} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between gap-4 transition-colors cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 group">
                <div className="text-sm space-y-1.5 w-full md:w-3/4">
                    <p><span className="text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest block mb-0.5">Наряд №{app.id} • {app.date_target}</span> <b className="dark:text-white text-base group-hover:text-blue-600 dark:group-hover:text-blue-400">{app.object_address}</b></p>

                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 font-medium flex items-center">
                        <span className="mr-1">👷‍♂️</span>
                        {app.foreman_id ? (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openProfile(app.foreman_id); }}
                                className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-left"
                            >
                                {app.foreman_name || 'Неизвестный прораб'}
                            </button>
                        ) : (
                            <span>{app.foreman_name || 'Неизвестный прораб'}</span>
                        )}
                    </p>

                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate mb-1">
                        👥 <span className={app.is_team_freed === 1 ? 'line-through text-gray-400' : 'dark:text-white font-bold'}>{app.team_name || 'Без бригады'}</span>
                        {app.is_team_freed === 1 ? <span className="ml-1 text-[10px] text-emerald-500 font-bold">Свободна</span> : null}
                    </p>

                    {equipList.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                            {equipList.map((eq, idx) => (
                                <p key={idx} className={`text-xs truncate ${eq.is_freed ? 'text-gray-400 line-through' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                    🚜 {eq.name.split('(')[0].trim()} {eq.is_freed ? '✅' : ''}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-end justify-center min-w-[120px] pt-3 md:pt-0">
                    {statusType === 'waiting' && <span className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-yellow-200 dark:border-yellow-700/50 text-center w-full md:w-auto">На модерации</span>}
                    {statusType === 'approved' && app.status === 'approved' && <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-700/50 text-center w-full md:w-auto">Одобрено</span>}
                    {statusType === 'approved' && app.status === 'published' && <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-700/50 text-center w-full md:w-auto">Ожидает начала</span>}
                    {statusType === 'published' && <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700/50 text-center w-full md:w-auto">В работе</span>}
                </div>
            </div>
        );
    };

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-20">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📋</span> Управление заявками</h2>
                {filteredForPublish.length > 0 && (
                    <button onClick={openPublishModal} className="bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-emerald-600 animate-pulse transition">
                        📤 Опубликовать ({filteredForPublish.length})
                    </button>
                )}
            </div>

            <ReviewSection title="Требуют проверки" icon="⏳" colorClass="border-yellow-200 dark:border-yellow-900/50" titleColorClass="text-yellow-700 dark:text-yellow-500" apps={waitingApps} statusType="waiting" renderAppCard={renderAppCard} />
            <ReviewSection title="Одобрены (ожидают начала)" icon="✅" colorClass="border-emerald-200 dark:border-emerald-900/50" titleColorClass="text-emerald-700 dark:text-emerald-500" apps={approvedApps} statusType="approved" renderAppCard={renderAppCard} />
            <ReviewSection title="В работе" icon="🏗" colorClass="border-blue-200 dark:border-blue-900/50" titleColorClass="text-blue-700 dark:text-blue-500" apps={publishedApps} statusType="published" renderAppCard={renderAppCard} />

            {reviewApps.length === 0 && (
                <p className="text-center p-6 bg-white dark:bg-gray-800 rounded-xl text-gray-500 dark:text-gray-400 text-sm italic border border-gray-200 dark:border-gray-700 shadow-sm">Активных заявок пока нет.</p>
            )}

            {/* МОДАЛЬНОЕ ОКНО ПУБЛИКАЦИИ */}
            {isPublishModalOpen && (
                <div className="fixed inset-0 z-[120] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden">
                            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                                <h3 className="text-xl font-bold dark:text-white">Опубликовать заявки</h3>
                                <button onClick={() => setPublishModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl leading-none transition">&times;</button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">Фильтр по дате:</label>
                                    <div className="flex space-x-2">
                                        <button onClick={() => setPublishDateFilter('')} className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${!publishDateFilter ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>Все даты</button>
                                        <input type="date" value={publishDateFilter} onChange={e => setPublishDateFilter(e.target.value)} className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none" />
                                    </div>
                                </div>

                                <div className="max-h-64 overflow-y-auto space-y-2 border dark:border-gray-700 p-2 rounded-xl bg-gray-50 dark:bg-gray-900/30">
                                    {filteredForPublish.map(app => (
                                        <div key={app.id} onClick={() => togglePublishSelect(app.id)} className={`p-3 rounded-lg border cursor-pointer flex items-center transition ${selectedToPublish.includes(app.id) ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-900/30' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                                            <input type="checkbox" checked={selectedToPublish.includes(app.id)} readOnly className="w-5 h-5 mr-3 text-emerald-600 rounded focus:ring-emerald-500" />
                                            <div className="flex-1">
                                                <p className="font-bold text-sm dark:text-white">{app.object_address}</p>
                                                <p className="text-xs text-gray-500">{app.date_target} | {app.team_name || 'Только техника'}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredForPublish.length === 0 && <p className="text-center text-sm text-gray-500 py-4 italic">Нет заявок по этому фильтру</p>}
                                </div>

                                <div className="flex space-x-3 pt-4 border-t dark:border-gray-700">
                                    <button onClick={() => setPublishModalOpen(false)} className="w-1/3 bg-gray-100 dark:bg-gray-700 py-3 rounded-xl font-bold text-gray-700 dark:text-gray-300">Отмена</button>
                                    <button onClick={handleExecutePublish} className="w-2/3 bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-md hover:bg-emerald-600">Опубликовать ({selectedToPublish.length})</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* МОДАЛЬНОЕ ОКНО ЗАЯВКИ */}
            {selectedApp && (
                <div className="fixed inset-0 z-[110] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden">
                            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                                <h3 className="text-xl font-bold dark:text-white">Наряд №{selectedApp.id}</h3>
                                <button onClick={() => setSelectedApp(null)} className="text-gray-400 hover:text-red-500 text-3xl leading-none transition">&times;</button>
                            </div>

                            <div className="p-6 space-y-6 text-sm">
                                <div className="space-y-4">
                                    <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">📅 Дата выезда</label><p className="font-bold text-gray-800 dark:text-gray-100 text-lg">{selectedApp.date_target}</p></div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">📍 Адрес объекта</label>
                                        <p className="font-medium text-gray-800 dark:text-gray-100">{selectedApp.object_address}</p>

                                        <div className="mt-4 flex items-center p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600">
                                            <span className="text-2xl mr-3">👷‍♂️</span>
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide">Прораб (Создатель заявки)</p>
                                                {selectedApp.foreman_id ? (
                                                    <button type="button" onClick={() => { setSelectedApp(null); openProfile(selectedApp.foreman_id); }} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline text-left">
                                                        {selectedApp.foreman_name}
                                                    </button>
                                                ) : (
                                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{selectedApp.foreman_name}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <hr className="dark:border-gray-700" />
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">👥 Состав на выезд</label>

                                        <div className="flex flex-wrap gap-2">
                                            {selectedApp.members_data && selectedApp.members_data.length > 0 ? (
                                                selectedApp.members_data.map(m => (
                                                    <button
                                                        type="button"
                                                        key={m.id}
                                                        onClick={() => { setSelectedApp(null); openProfile(m.tg_user_id, 'member', m.id); }}
                                                        className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold border border-gray-200 dark:border-gray-600 rounded-lg text-sm transition flex items-center shadow-sm"
                                                    >
                                                        👤 {m.fio}
                                                    </button>
                                                ))
                                            ) : (
                                                <p className="text-gray-500 font-medium">Только техника</p>
                                            )}
                                        </div>
                                        {selectedApp.is_team_freed === 1 && <p className="text-emerald-500 text-xs font-bold mt-2">Бригада свободна ✅</p>}
                                    </div>
                                </div>
                                <hr className="dark:border-gray-700" />
                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">🚜 Требуемая техника</label>
                                    {selectedApp.equipment_data && JSON.parse(selectedApp.equipment_data).length > 0 ? (
                                        <div className="space-y-2">
                                            {JSON.parse(selectedApp.equipment_data).map(eq => (
                                                <div key={eq.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-200 dark:border-gray-600">
                                                    <button type="button" onClick={() => { setSelectedApp(null); openProfile(0, 'equip', eq.id); }} className={`font-bold hover:underline ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
                                                        🚜 {eq.name.split('(')[0].trim()} {eq.is_freed ? '✅' : ''}
                                                    </button>
                                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded-md border dark:border-gray-600">⏰ {eq.time_start}:00 - {eq.time_end}:00</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (<p className="text-gray-500 italic">Не требуется</p>)}
                                </div>
                                <hr className="dark:border-gray-700" />
                                <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">💬 Комментарий</label><p className="font-medium text-gray-800 dark:text-gray-100">{selectedApp.comment || 'Нет'}</p></div>

                                <div className="flex space-x-3 pt-4 border-t dark:border-gray-700">
                                    {selectedApp.status === 'waiting' && role === 'moderator' && (
                                        <>
                                            <button onClick={() => handleReviewAction('rejected')} className="w-1/2 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 py-3 rounded-xl font-bold hover:bg-red-200 transition">❌ Отклонить</button>
                                            <button onClick={() => handleReviewAction('approved')} className="w-1/2 bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-md hover:bg-emerald-600 transition">✅ Одобрить</button>
                                        </>
                                    )}
                                    {selectedApp.status === 'approved' && role === 'moderator' && (
                                        <button onClick={() => handleReviewAction('rejected')} className="w-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 py-3 rounded-xl font-bold hover:bg-red-200 transition">🔙 Отозвать заявку</button>
                                    )}
                                    {selectedApp.status === 'published' && role === 'moderator' && (
                                        <button onClick={() => handleReviewAction('completed')} className="w-full bg-gray-800 text-white dark:bg-gray-600 py-3 rounded-xl font-bold hover:bg-gray-900 transition shadow-md">🏁 Отменить / Завершить наряд</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
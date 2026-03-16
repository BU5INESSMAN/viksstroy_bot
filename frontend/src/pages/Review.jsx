import { useEffect, useState } from 'react';
import axios from 'axios';

const getTodayStr = () => {
    try {
        return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Barnaul'}).format(new Date());
    } catch(e) {
        return new Date().toISOString().split('T')[0];
    }
};

export default function Review() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
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

    // В одобренных показываются одобренные + те, что опубликованы, но дата еще не наступила
    const approvedApps = reviewApps.filter(a => a.status === 'approved' || (a.status === 'published' && a.date_target > todayYYYYMMDD));

    // В работе - те, что опубликованы и дата которых сегодня или в прошлом
    const publishedApps = reviewApps.filter(a => a.status === 'published' && a.date_target <= todayYYYYMMDD);

    const filteredForPublish = publishDateFilter
        ? approvedApps.filter(a => a.date_target === publishDateFilter && a.status === 'approved')
        : approvedApps.filter(a => a.status === 'approved');

    const renderAppCard = (app, statusType) => {
        let equipText = 'Не требуется';
        if (app.equipment_data) {
            try {
                const eqList = JSON.parse(app.equipment_data);
                if (eqList && eqList.length > 0) equipText = eqList.map(e => e.name).join(', ');
            } catch(e){}
        }

        return (
            <div key={app.id} onClick={() => setSelectedApp(app)} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between gap-4 transition-colors cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 group">
                <div className="text-sm space-y-1.5">
                    <p><span className="text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest block mb-0.5">Наряд №{app.id} • {app.date_target}</span> <b className="dark:text-white text-base group-hover:text-blue-600 dark:group-hover:text-blue-400">{app.object_address}</b></p>
                    <p><span className="text-gray-500 dark:text-gray-400">Бригада:</span> <b className="dark:text-white">{app.team_name || 'Только техника'}</b> (Прораб: {app.foreman_name})</p>
                    <p><span className="text-gray-500 dark:text-gray-400">Техника:</span> <span className="dark:text-white font-medium truncate">{equipText}</span></p>
                </div>
                <div className="flex flex-col items-end justify-center min-w-[120px] pt-3 md:pt-0">
                    {statusType === 'waiting' && <span className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-yellow-200 dark:border-yellow-700/50">На модерации</span>}
                    {statusType === 'approved' && app.status === 'approved' && <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-700/50">Одобрено</span>}
                    {statusType === 'approved' && app.status === 'published' && <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-700/50">Ожидает начала</span>}
                    {statusType === 'published' && <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700/50">В работе</span>}
                </div>
            </div>
        );
    };

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📋</span> Управление заявками</h2>
                {filteredForPublish.length > 0 && (
                    <button onClick={openPublishModal} className="bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-emerald-600 animate-pulse transition">
                        📤 Опубликовать ({filteredForPublish.length})
                    </button>
                )}
            </div>

            {waitingApps.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-yellow-200 dark:border-yellow-900/50">
                    <h3 className="font-bold text-yellow-700 dark:text-yellow-500 mb-4">⏳ Требуют проверки</h3>
                    <div className="space-y-3">{waitingApps.map(a => renderAppCard(a, 'waiting'))}</div>
                </div>
            )}

            {approvedApps.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-emerald-200 dark:border-emerald-900/50">
                    <h3 className="font-bold text-emerald-700 dark:text-emerald-500 mb-4">✅ Одобрены (ожидают начала)</h3>
                    <div className="space-y-3">{approvedApps.map(a => renderAppCard(a, 'approved'))}</div>
                </div>
            )}

            {publishedApps.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-blue-200 dark:border-blue-900/50">
                    <h3 className="font-bold text-blue-700 dark:text-blue-500 mb-4">🏗 В работе</h3>
                    <div className="space-y-3">{publishedApps.map(a => renderAppCard(a, 'published'))}</div>
                </div>
            )}

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
                                    <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">📍 Адрес объекта</label><p className="font-medium text-gray-800 dark:text-gray-100">{selectedApp.object_address}</p></div>
                                </div>
                                <hr className="dark:border-gray-700" />
                                <div className="space-y-3">
                                    <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">👥 Бригада</label><p className="font-medium text-gray-800 dark:text-gray-100">{selectedApp.team_name || 'Только техника'} <span className="text-gray-500 text-xs ml-2">(Прораб: {selectedApp.foreman_name})</span></p></div>
                                </div>
                                <hr className="dark:border-gray-700" />
                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">🚜 Требуемая техника</label>
                                    {selectedApp.equipment_data && JSON.parse(selectedApp.equipment_data).length > 0 ? (
                                        <div className="space-y-2">
                                            {JSON.parse(selectedApp.equipment_data).map(eq => (
                                                <div key={eq.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-200 dark:border-gray-600">
                                                    <span className="font-bold text-blue-600 dark:text-blue-400">{eq.name}</span>
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
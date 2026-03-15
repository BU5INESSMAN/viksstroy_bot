import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Review() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const [reviewApps, setReviewApps] = useState([]);

    const [selectedApp, setSelectedApp] = useState(null);

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

    const handlePublishAppsClick = () => {
        if(!window.confirm('Опубликовать все одобренные наряды в Telegram?')) return;
        const fd = new FormData(); fd.append('tg_id', tgId);
        axios.post('/api/applications/publish', fd).then(res => {
            alert(`Опубликовано нарядов: ${res.data.published}`);
            fetchData();
        }).catch(() => alert("Ошибка публикации"));
    };

    const waitingApps = reviewApps.filter(a => a.status === 'waiting');
    const approvedApps = reviewApps.filter(a => a.status === 'approved');
    const publishedApps = reviewApps.filter(a => a.status === 'published');

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
                    {statusType === 'approved' && <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-700/50">Одобрено</span>}
                    {statusType === 'published' && <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700/50">В работе</span>}
                </div>
            </div>
        );
    };

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📋</span> Управление заявками</h2>
                {approvedApps.length > 0 && (
                    <button onClick={handlePublishAppsClick} className="bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-emerald-600 animate-pulse transition">
                        📤 Опубликовать ({approvedApps.length})
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
                    <h3 className="font-bold text-emerald-700 dark:text-emerald-500 mb-4">✅ Одобрены (ожидают публикации)</h3>
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
                                        <button onClick={() => handleReviewAction('completed')} className="w-full bg-gray-800 text-white dark:bg-gray-600 py-3 rounded-xl font-bold hover:bg-gray-900 transition shadow-md">🏁 Завершить наряд</button>
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
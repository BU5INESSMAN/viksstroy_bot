import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Review() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const [reviewApps, setReviewApps] = useState([]);

    const fetchData = () => {
        axios.get('/api/applications/review').then(res => setReviewApps(res.data || [])).catch(() => {});
    };

    useEffect(() => { fetchData(); }, []);

    const handleReviewApp = async (appId, status) => {
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

            await axios.post(`/api/applications/${appId}/review`, fd);
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

    const renderAppCard = (app, statusType) => (
        <div key={app.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between gap-4 transition-colors">
            <div className="text-sm space-y-1.5">
                <p><span className="text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest block mb-0.5">Наряд №{app.id} • {app.date_target}</span> <b className="dark:text-white text-base">{app.object_address}</b></p>
                <p><span className="text-gray-500 dark:text-gray-400">Бригада:</span> <b className="dark:text-white">{app.team_name || 'Только техника'}</b> (Прораб: {app.foreman_name})</p>
                <p><span className="text-gray-500 dark:text-gray-400">Техника:</span> <span className="dark:text-white font-medium">{app.formatted_equip}</span></p>
                {app.comment && <p className="mt-2"><span className="text-gray-500 dark:text-gray-400">Комментарий:</span> <span className="italic dark:text-gray-300">{app.comment}</span></p>}
            </div>
            <div className="flex flex-col items-end justify-between min-w-[150px] border-t dark:border-gray-600 md:border-t-0 pt-3 md:pt-0">

                {statusType === 'waiting' && <span className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-lg mb-3 border border-yellow-200 dark:border-yellow-700/50">На модерации</span>}
                {statusType === 'approved' && <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-lg mb-3 border border-emerald-200 dark:border-emerald-700/50">Одобрено</span>}
                {statusType === 'published' && <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold px-3 py-1.5 rounded-lg mb-3 border border-blue-200 dark:border-blue-700/50">В работе</span>}

                {role === 'moderator' && statusType === 'waiting' && (
                    <div className="flex w-full space-x-2 mt-auto">
                        <button onClick={() => handleReviewApp(app.id, 'rejected')} className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 py-2 rounded-lg font-bold transition border border-red-200 dark:border-red-800">❌</button>
                        <button onClick={() => handleReviewApp(app.id, 'approved')} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-bold shadow-md transition">✅ Одобрить</button>
                    </div>
                )}

                {role === 'moderator' && statusType === 'approved' && (
                    <div className="flex w-full mt-auto">
                        <button onClick={() => handleReviewApp(app.id, 'rejected')} className="w-full bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-400 py-2 rounded-lg font-bold transition border border-red-200 dark:border-red-800">🔙 Отозвать</button>
                    </div>
                )}

                {role === 'moderator' && statusType === 'published' && (
                    <div className="flex w-full mt-auto">
                        <button onClick={() => handleReviewApp(app.id, 'completed')} className="w-full bg-gray-800 hover:bg-gray-900 text-white dark:bg-gray-600 dark:hover:bg-gray-500 py-2 rounded-lg font-bold shadow-md transition">🏁 Завершить наряд</button>
                    </div>
                )}
            </div>
        </div>
    );

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
        </main>
    );
}
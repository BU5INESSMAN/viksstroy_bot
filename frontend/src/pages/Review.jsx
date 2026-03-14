import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Review() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const [reviewApps, setReviewApps] = useState([]);

    const fetchData = () => { axios.get('/api/applications/review').then(res => setReviewApps(res.data || [])).catch(() => {}); };
    useEffect(() => { fetchData(); }, []);

    const handleReviewApp = async (appId, status) => {
        let reason = '';
        if (status === 'rejected') {
            reason = window.prompt('Укажите причину отклонения заявки (увидит прораб):');
            if (reason === null) return;
        } else {
            if (!window.confirm('Одобрить / завершить заявку?')) return;
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

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                    <h2 className="text-lg font-bold flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📋</span> Заявки на рассмотрении</h2>
                    {reviewApps.filter(a => a.status === 'waiting').length > 0 && (<span className="mt-2 sm:mt-0 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-400 text-xs px-3 py-1.5 rounded-full font-bold border border-yellow-200 dark:border-yellow-700/50">Ожидают: {reviewApps.filter(a => a.status === 'waiting').length}</span>)}
                </div>
                <div className="space-y-4">
                    {reviewApps.length === 0 ? (
                        <p className="text-center p-6 bg-gray-50 dark:bg-gray-900/30 rounded-xl text-gray-500 dark:text-gray-400 text-sm italic border border-dashed border-gray-200 dark:border-gray-700">Очередь заявок пуста.</p>
                    ) : (
                        reviewApps.map(app => (
                            <div key={app.id} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 flex flex-col md:flex-row justify-between gap-4 transition-colors">
                                <div className="text-sm space-y-1.5">
                                    <p><span className="text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest block mb-0.5">Дата и Объект:</span> <b className="dark:text-white text-base">{app.date_target} — {app.object_address}</b></p>
                                    <p><span className="text-gray-500 dark:text-gray-400">Бригада:</span> <b className="dark:text-white">{app.team_name || 'Только техника'}</b> (Прораб: {app.foreman_name})</p>
                                    <p><span className="text-gray-500 dark:text-gray-400">Техника:</span> <span className="dark:text-white font-medium">{app.formatted_equip}</span></p>
                                    {app.comment && <p className="mt-2"><span className="text-gray-500 dark:text-gray-400">Комментарий:</span> <span className="italic dark:text-gray-300">{app.comment}</span></p>}
                                </div>
                                <div className="flex flex-col items-end justify-between min-w-[140px] border-t dark:border-gray-600 md:border-t-0 pt-3 md:pt-0">
                                    {app.status === 'waiting' ? (<span className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-lg mb-3 shadow-sm border border-yellow-200 dark:border-yellow-700/50">Ожидает проверки</span>) : (<span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-bold px-3 py-1.5 rounded-lg mb-3 shadow-sm border border-green-200 dark:border-green-700/50">Одобрено</span>)}
                                    {role === 'moderator' && app.status === 'waiting' && (
                                        <div className="flex w-full space-x-2 mt-auto"><button onClick={() => handleReviewApp(app.id, 'rejected')} className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-400 py-2 rounded-lg font-bold transition border border-red-200 dark:border-red-800">❌</button><button onClick={() => handleReviewApp(app.id, 'approved')} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-bold shadow-md transition">✅ Одобрить</button></div>
                                    )}
                                    {role === 'moderator' && app.status === 'approved' && (
                                        <div className="flex w-full mt-auto"><button onClick={() => handleReviewApp(app.id, 'completed')} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg font-bold shadow-md transition">🏁 Завершить наряд</button></div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </main>
    );
}
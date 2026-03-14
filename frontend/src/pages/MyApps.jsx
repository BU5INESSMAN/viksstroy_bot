import { useEffect, useState } from 'react';
import axios from 'axios';

export default function MyApps() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = () => {
        axios.get(`/api/applications/my?tg_id=${tgId}`).then(res => {
            setApps(res.data || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    };

    useEffect(() => { fetchData(); }, [tgId]);

    const handleFreeEquipment = async () => {
        if (!window.confirm("Завершить работу на объекте и освободить технику?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post('/api/equipment/set_free', fd);
            alert("Техника успешно переведена в статус 'Свободна'!");
        } catch (e) { alert("Ошибка при освобождении техники."); }
    };

    if (loading) return <div className="text-center mt-20">Загрузка...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-bold flex items-center text-gray-800 dark:text-gray-100 mb-6">
                    <span className="text-2xl mr-2">📋</span> Мои объекты (Заявки)
                </h2>

                <div className="space-y-4">
                    {apps.length === 0 ? (
                        <p className="text-center p-6 bg-gray-50 dark:bg-gray-900/30 rounded-xl text-gray-500 dark:text-gray-400 text-sm italic border border-dashed border-gray-200 dark:border-gray-700">Нет активных заявок.</p>
                    ) : (
                        apps.map(app => (
                            <div key={app.id} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 flex flex-col md:flex-row justify-between gap-4">
                                <div className="text-sm space-y-1.5">
                                    <p><span className="text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest block mb-0.5">Дата и Объект:</span> <b className="dark:text-white text-base">{app.date_target} — {app.object_address}</b></p>
                                    <p><span className="text-gray-500 dark:text-gray-400">Бригада:</span> <b className="dark:text-white">{app.team_name || 'Без бригады'}</b> (Прораб: {app.foreman_name})</p>
                                    <p><span className="text-gray-500 dark:text-gray-400">Техника:</span> <span className="dark:text-white font-medium">{app.formatted_equip}</span></p>
                                </div>
                                {role === 'driver' && (
                                    <div className="flex flex-col justify-end min-w-[160px]">
                                        <button onClick={handleFreeEquipment} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-bold shadow-md transition">✅ Завершить работу</button>
                                        <p className="text-[10px] text-gray-500 text-center mt-2">Освобождает технику</p>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </main>
    );
}
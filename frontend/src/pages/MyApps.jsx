import { useEffect, useState } from 'react';
import axios from 'axios';

export default function MyApps() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);

    const [filterPeriod, setFilterPeriod] = useState('all'); // all, week, month, year, custom
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const fetchData = () => {
        axios.get(`/api/applications/my?tg_id=${tgId}`).then(res => {
            setApps(res.data || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    };

    useEffect(() => { fetchData(); }, [tgId]);

    const getFilteredApps = () => {
        if (!apps) return [];
        let filtered = [...apps];
        const now = new Date();

        filtered = filtered.filter(a => {
            const appDate = new Date(a.date_target);
            if (filterPeriod === 'week') {
                const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
                return appDate >= weekAgo;
            }
            if (filterPeriod === 'month') {
                const monthAgo = new Date(); monthAgo.setMonth(now.getMonth() - 1);
                return appDate >= monthAgo;
            }
            if (filterPeriod === 'year') {
                const yearAgo = new Date(); yearAgo.setFullYear(now.getFullYear() - 1);
                return appDate >= yearAgo;
            }
            if (filterPeriod === 'custom') {
                if (customStart && appDate < new Date(customStart)) return false;
                if (customEnd && appDate > new Date(customEnd)) return false;
                return true;
            }
            return true;
        });
        return filtered;
    };

    const filteredApps = getFilteredApps();

    if (loading) return <div className="text-center mt-20">Загрузка...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-bold flex items-center text-gray-800 dark:text-gray-100 mb-6">
                    <span className="text-2xl mr-2">🗂</span> История моих работ
                </h2>

                {/* ФИЛЬТРЫ */}
                <div className="mb-6 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setFilterPeriod('all')} className={`px-4 py-2 text-sm font-bold rounded-lg border transition ${filterPeriod === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>За все время</button>
                        <button onClick={() => setFilterPeriod('week')} className={`px-4 py-2 text-sm font-bold rounded-lg border transition ${filterPeriod === 'week' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>За неделю</button>
                        <button onClick={() => setFilterPeriod('month')} className={`px-4 py-2 text-sm font-bold rounded-lg border transition ${filterPeriod === 'month' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>За месяц</button>
                        <button onClick={() => setFilterPeriod('year')} className={`px-4 py-2 text-sm font-bold rounded-lg border transition ${filterPeriod === 'year' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>За год</button>
                        <button onClick={() => setFilterPeriod('custom')} className={`px-4 py-2 text-sm font-bold rounded-lg border transition ${filterPeriod === 'custom' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>Свой период</button>
                    </div>

                    {filterPeriod === 'custom' && (
                        <div className="flex items-center space-x-3 bg-gray-50 dark:bg-gray-900/30 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 outline-none text-sm" />
                            <span className="text-gray-500 font-bold">—</span>
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 outline-none text-sm" />
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {filteredApps.length === 0 ? (
                        <p className="text-center p-6 bg-gray-50 dark:bg-gray-900/30 rounded-xl text-gray-500 dark:text-gray-400 text-sm italic border border-dashed border-gray-200 dark:border-gray-700">В этом периоде нет завершенных заявок.</p>
                    ) : (
                        filteredApps.map(app => (
                            <div key={app.id} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 flex flex-col md:flex-row justify-between gap-4 relative overflow-hidden">
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-gray-300 dark:bg-gray-600"></div>
                                <div className="text-sm space-y-1.5">
                                    <p><span className="text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest block mb-0.5">Дата и Объект:</span> <b className="dark:text-white text-base">{app.date_target} — {app.object_address}</b></p>
                                    <p><span className="text-gray-500 dark:text-gray-400">Бригада:</span> <b className="dark:text-white">{app.team_name || 'Без бригады'}</b></p>
                                    <p><span className="text-gray-500 dark:text-gray-400">Техника:</span> <span className="dark:text-white font-medium">{app.formatted_equip}</span></p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </main>
    );
}
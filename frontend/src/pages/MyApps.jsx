import { useEffect, useState } from 'react';
import axios from 'axios';
import { FolderGit2, Calendar as CalendarIcon, MapPin, Users, Truck, Search, Filter } from 'lucide-react';
import { MyAppsSkeleton } from '../components/ui/PageSkeletons';

export default function MyApps() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);

    const [filterPeriod, setFilterPeriod] = useState('all');
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

    if (loading) return <MyAppsSkeleton />;

    return (
        <main className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="transition-colors duration-200">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100 mb-6 pt-6">
                    <FolderGit2 className="w-7 h-7 text-blue-500 mr-2" /> История моих работ
                </h2>

                {/* ФИЛЬТРЫ */}
                <div className="mb-8 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                        <Filter className="w-4 h-4" /> Период:
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                        {[
                            { id: 'all', label: 'За все время' },
                            { id: 'week', label: 'За неделю' },
                            { id: 'month', label: 'За месяц' },
                            { id: 'year', label: 'За год' },
                            { id: 'custom', label: 'Свой период' }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilterPeriod(f.id)}
                                className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 shadow-sm ${filterPeriod === f.id ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {filterPeriod === 'custom' && (
                        <div className="flex flex-col sm:flex-row items-center gap-3 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-800/30 w-full sm:w-fit mt-4">
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full sm:w-auto p-3 border border-gray-200 rounded-xl dark:bg-gray-800 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium dark:text-white shadow-sm transition-colors" />
                            <span className="text-gray-400 font-bold hidden sm:block">—</span>
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full sm:w-auto p-3 border border-gray-200 rounded-xl dark:bg-gray-800 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium dark:text-white shadow-sm transition-colors" />
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {filteredApps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-900/30 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-400">
                            <Search className="w-12 h-12 mb-3 opacity-30" />
                            <p className="text-sm font-medium italic text-gray-500 dark:text-gray-400">В этом периоде нет завершенных заявок.</p>
                        </div>
                    ) : (
                        filteredApps.map(app => (
                            <div key={app.id} className="p-5 bg-gray-50/80 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600 flex flex-col md:flex-row justify-between gap-4 relative overflow-hidden hover:shadow-md transition-shadow group">
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-400 dark:bg-blue-500"></div>
                                <div className="text-sm space-y-2.5 pl-2">
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-widest font-bold mb-1">
                                        <CalendarIcon className="w-3.5 h-3.5" /> {app.date_target}
                                    </div>
                                    <p className="flex items-start gap-1.5 font-bold dark:text-white text-base leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                                        <span>{app.object_address}</span>
                                    </p>

                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600/50">
                                        <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                                            <Users className="w-4 h-4 text-indigo-400" />
                                            <b className="dark:text-white font-medium">{app.team_name || 'Без бригады'}</b>
                                        </p>
                                        <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                                            <Truck className="w-4 h-4 text-emerald-500" />
                                            <span className="dark:text-white font-medium">{app.formatted_equip}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </main>
    );
}
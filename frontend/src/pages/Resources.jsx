import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Users, Truck, UserCircle2, Search, X } from 'lucide-react';
import Teams from './Teams';
import Equipment from './Equipment';
import Drivers from './Drivers';

export default function Resources() {
    const role = localStorage.getItem('user_role') || 'Гость';
    const isBrigadier = role === 'brigadier';
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(isBrigadier ? 'teams' : (searchParams.get('tab') || 'teams'));
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
    const targetTeamId = Number(searchParams.get('team_id') || 0);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (!isBrigadier && tab && ['teams', 'equipment', 'drivers'].includes(tab)) {
            setActiveTab(tab);
        } else if (isBrigadier && tab !== 'teams') {
            setActiveTab('teams');
        }
    }, [searchParams, isBrigadier, setSearchParams]);

    return (
        <main className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pt-6 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    {isBrigadier
                        ? <><Users className="w-7 h-7 text-blue-500 mr-2" /> Моя бригада</>
                        : <><Briefcase className="w-7 h-7 text-blue-500 mr-2" /> Ресурсы</>}
                </h2>
            </div>

            {!isBrigadier && <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('teams')}
                    className={`flex-1 min-w-[108px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-colors duration-200 ${
                        activeTab === 'teams'
                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <Users className="w-4 h-4" /> Бригады
                </button>
                <button
                    onClick={() => setActiveTab('equipment')}
                    className={`flex-1 min-w-[108px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-colors duration-200 ${
                        activeTab === 'equipment'
                        ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <Truck className="w-4 h-4" /> Автопарк
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`flex-1 min-w-[108px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-colors duration-200 ${
                        activeTab === 'drivers'
                        ? 'bg-white dark:bg-gray-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <UserCircle2 className="w-4 h-4" /> Водители
                </button>
            </div>}

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={activeTab === 'teams'
                        ? 'Поиск по бригаде, участнику, должности…'
                        : activeTab === 'equipment'
                            ? 'Поиск по названию, госномеру, категории, водителю…'
                            : 'Поиск по ФИО, категории, статусу, привязке MAX…'}
                    className="w-full min-h-12 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-12 pr-12 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Очистить поиск">
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                )}
            </div>

            <div className="animate-in fade-in duration-300">
                {activeTab === 'teams' && <Teams searchQuery={searchQuery} openTeamId={targetTeamId} />}
                {activeTab === 'equipment' && <Equipment searchQuery={searchQuery} />}
                {activeTab === 'drivers' && <Drivers searchQuery={searchQuery} />}
            </div>
        </main>
    );
}

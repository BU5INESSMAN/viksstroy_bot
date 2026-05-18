import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Users, Truck, UserCircle2 } from 'lucide-react';
import Teams from './Teams';
import Equipment from './Equipment';
import Drivers from './Drivers';

export default function Resources() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'teams');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['teams', 'equipment', 'drivers'].includes(tab)) {
            setActiveTab(tab);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams]);

    return (
        <main className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pt-6 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <Briefcase className="w-7 h-7 text-blue-500 mr-2" /> Ресурсы
                </h2>
            </div>

            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('teams')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors duration-200 ${
                        activeTab === 'teams'
                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <Users className="w-4 h-4" /> Бригады
                </button>
                <button
                    onClick={() => setActiveTab('equipment')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors duration-200 ${
                        activeTab === 'equipment'
                        ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <Truck className="w-4 h-4" /> Автопарк
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors duration-200 ${
                        activeTab === 'drivers'
                        ? 'bg-white dark:bg-gray-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <UserCircle2 className="w-4 h-4" /> Водители
                </button>
            </div>

            <div className="animate-in fade-in duration-300">
                {activeTab === 'teams' && <Teams />}
                {activeTab === 'equipment' && <Equipment />}
                {activeTab === 'drivers' && <Drivers />}
            </div>
        </main>
    );
}

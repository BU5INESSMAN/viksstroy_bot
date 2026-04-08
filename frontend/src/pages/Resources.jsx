import { useState } from 'react';
import { Users, Truck } from 'lucide-react';
import Teams from './Teams';
import Equipment from './Equipment';

export default function Resources() {
    // Вкладка по умолчанию - Бригады
    const [activeTab, setActiveTab] = useState('teams');

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">

            {/* ВЕРХНИЕ ВКЛАДКИ ПЕРЕКЛЮЧЕНИЯ */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-2 border border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row gap-2 sticky top-2 z-30">
                <button
                    onClick={() => setActiveTab('teams')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-3.5 rounded-2xl font-bold transition-all duration-200 ${
                        activeTab === 'teams' 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                    <Users className="w-5 h-5" /> Бригады
                </button>
                <button
                    onClick={() => setActiveTab('equipment')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-3.5 rounded-2xl font-bold transition-all duration-200 ${
                        activeTab === 'equipment' 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                    <Truck className="w-5 h-5" /> Автопарк
                </button>
            </div>

            {/* КОНТЕНТ ВЫБРАННОЙ ВКЛАДКИ */}
            <div className="animate-in fade-in duration-300">
                {activeTab === 'teams' ? <Teams /> : <Equipment />}
            </div>

        </main>
    );
}
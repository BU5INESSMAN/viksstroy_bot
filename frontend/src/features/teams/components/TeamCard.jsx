import { Users, HardHat, Settings, Trash2 } from 'lucide-react';

export default function TeamCard({ t, canDeleteTeam, openManageModal, handleDeleteTeam }) {
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all group">
            <div className="mb-6">
                <h3 className="font-bold text-xl mb-1 text-gray-800 dark:text-white flex items-center gap-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    <HardHat className="w-5 h-5 text-indigo-400" /> {t.name}
                </h3>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5 ml-7">
                    <Users className="w-3.5 h-3.5" /> Участников: {t.member_count}
                </p>
            </div>
            <div className="flex gap-3">
                <button onClick={() => openManageModal(t.id)} className="flex-1 bg-gray-50 hover:bg-indigo-50 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-indigo-900/30 text-gray-700 dark:text-gray-300 hover:text-indigo-700 dark:hover:text-indigo-400 py-3 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5 active:scale-95">
                    <Settings className="w-4 h-4" /> Управление
                </button>
                {canDeleteTeam && (
                    <button onClick={() => handleDeleteTeam(t.id)} className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 py-3 px-4 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center justify-center active:scale-95">
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

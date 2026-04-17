import { Users, HardHat, Settings, Trash2, BarChart3, Star } from 'lucide-react';
import { TEAM_ICONS, getIconComponent, DEFAULT_TEAM_ICON } from '../../../utils/iconConfig';

function pluralMembers(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'участник';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'участника';
    return 'участников';
}

export default function TeamCard({ t, canDeleteTeam, openManageModal, handleDeleteTeam, onStats }) {
    const count = t.member_count || 0;
    const TeamIcon = getIconComponent(t.icon, TEAM_ICONS)
        || getIconComponent(DEFAULT_TEAM_ICON, TEAM_ICONS);

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all group">
            <div className="mb-5">
                <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    <TeamIcon className="w-5 h-5 text-indigo-400 flex-shrink-0" /> {t.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 ml-7 flex items-center gap-1.5">
                    {t.brigadier_name ? (
                        <><Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" /> {t.brigadier_name}</>
                    ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">Бригадир не назначен</span>
                    )}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-7 flex items-center gap-1.5 font-medium">
                    <Users className="w-3.5 h-3.5" /> {count} {pluralMembers(count)}
                </p>
            </div>
            <div className="flex gap-2">
                {onStats && (
                    <button onClick={() => onStats(t)} title="Статистика" className="flex-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 dark:border-blue-800/50 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5 active:scale-95">
                        <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden lg:inline truncate">Статистика</span>
                    </button>
                )}
                <button onClick={() => openManageModal(t.id)} title="Управление" className="flex-1 bg-gray-50 hover:bg-indigo-50 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-indigo-900/30 text-gray-700 dark:text-gray-300 hover:text-indigo-700 dark:hover:text-indigo-400 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5 active:scale-95">
                    <Settings className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden lg:inline truncate">Управление</span>
                </button>
                {canDeleteTeam && (
                    <button onClick={() => handleDeleteTeam(t.id)} className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 py-2.5 px-3.5 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center active:scale-95">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

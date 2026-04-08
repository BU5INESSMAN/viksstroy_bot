import { Users, User } from 'lucide-react';

export default function MyTeamCard({ myTeam }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 relative h-fit overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 rounded-l-3xl"></div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 dark:text-white">
                <Users className="text-indigo-500" /> Бригада: {myTeam.name}
            </h2>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                {myTeam.members.map(m => (
                    <div key={m.id} className="flex justify-between items-center p-3.5 bg-gray-50/80 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600/50 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50">
                        <div className="flex items-center gap-3">
                            <div className="bg-white dark:bg-gray-600 p-2 rounded-full shadow-sm">
                                <User className="w-4 h-4 text-gray-400" />
                            </div>
                            <div>
                                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm block leading-tight">{m.fio}</span>
                                {m.is_foreman && <span className="inline-block mt-1 text-[9px] font-extrabold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-md shadow-sm tracking-wider uppercase">Бригадир</span>}
                            </div>
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider bg-gray-200/50 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
                            {m.position}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

import { HardHat, X } from 'lucide-react';

export default function CreateTeamModal({ isTeamModalOpen, setTeamModalOpen, newTeamName, setNewTeamName, handleCreateTeam }) {
    if (!isTeamModalOpen) return null;

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative border border-gray-100 dark:border-gray-700">
                <button onClick={() => setTeamModalOpen(false)} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5">
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2">
                    <HardHat className="w-6 h-6 text-indigo-500" /> Новая бригада
                </h3>
                <form onSubmit={handleCreateTeam} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Название</label>
                        <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} required placeholder="Например: Монтажники-1" className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white font-medium transition-colors shadow-inner" />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98]">Создать бригаду</button>
                </form>
            </div>
        </div>
    );
}

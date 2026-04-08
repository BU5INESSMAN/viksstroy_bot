import {
    Calendar, MapPin, Users, Truck, HardHat, Flag,
    ClipboardList, CheckCircle
} from 'lucide-react';

export default function ActiveApplicationsCard({ activeApps, role, tgId, openProfile, openFreeModal }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 relative h-fit overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 rounded-l-3xl"></div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 dark:text-white">
                <ClipboardList className="text-blue-500" /> Текущие наряды
            </h2>
            {activeApps.length > 0 ? (
                <div className="space-y-4">
                    {activeApps.map(a => {
                        let activeEquipList = [];
                        if (a.equipment_data) { try { activeEquipList = JSON.parse(a.equipment_data) || []; } catch(e){} }

                        const teamIds = a.team_id && a.team_id !== '0' ? String(a.team_id).split(',').map(Number) : [];
                        const freedTeamIds = a.freed_team_ids ? String(a.freed_team_ids).split(',').map(Number) : [];

                        return (
                            <div key={a.id} className="p-5 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-800/30 text-sm space-y-3 text-gray-800 dark:text-gray-200 shadow-sm transition-all hover:shadow-md">
                                <div className="flex items-center gap-2 font-medium">
                                    <Calendar className="w-4 h-4 text-blue-500" /> {a.date_target}
                                </div>
                                <div className="flex items-start gap-2">
                                    <MapPin className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <span className="font-bold">{a.object_address}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <HardHat className="w-4 h-4 text-gray-400" />
                                    {a.foreman_id ? (
                                        <button onClick={() => openProfile(a.foreman_id)} className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-left">{a.foreman_name || 'Неизвестно'}</button>
                                    ) : <span>{a.foreman_name || 'Неизвестно'}</span>}
                                </div>

                                <div className="flex items-start gap-2 bg-white/60 dark:bg-gray-800/50 p-3 rounded-xl">
                                    <Truck className="w-4 h-4 text-indigo-400 mt-0.5" />
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        {activeEquipList.length > 0 ? activeEquipList.map((e, idx) => (
                                            <span key={idx} className={e.is_freed ? 'line-through text-gray-400' : 'font-medium'}>
                                                {e.name} ({e.time_start}:00-{e.time_end}:00){idx < activeEquipList.length - 1 ? ',' : ''}
                                            </span>
                                        )) : <span className="text-gray-500">Техника не требуется</span>}
                                    </div>
                                </div>

                                {/* БРИГАДЫ И КНОПКИ ОСВОБОЖДЕНИЯ ДЛЯ ПРОРАБА */}
                                <div className="flex flex-col gap-2 bg-white/60 dark:bg-gray-800/50 p-3 rounded-xl">
                                    {teamIds.length > 0 ? (
                                        teamIds.map(tId => {
                                            const tMembers = a.members_data?.filter(m => m.team_id === tId) || [];
                                            const tName = tMembers.length > 0 ? tMembers[0].team_name : `Бригада #${tId}`;
                                            const isFreed = freedTeamIds.includes(tId) || a.is_team_freed === 1;

                                            return (
                                                <div key={tId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0 pb-2 last:pb-0">
                                                    <div className="flex items-start gap-2">
                                                        <Users className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isFreed ? 'text-gray-400' : 'text-indigo-400'}`} />
                                                        <span className={`font-medium ${isFreed ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                                                            {tName}
                                                        </span>
                                                        {isFreed && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Свободна</span>}
                                                    </div>

                                                    {!isFreed && ['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && (
                                                        <button onClick={() => openFreeModal('specific_team', { app: a, teamId: tId })} className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 px-3 py-1.5 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center gap-1 w-full sm:w-auto active:scale-95 shadow-sm">
                                                            <CheckCircle className="w-3 h-3" /> Освободить
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="flex items-center gap-2 text-gray-500">
                                            <Users className="w-4 h-4" />
                                            <span className="font-medium italic">Только техника</span>
                                        </div>
                                    )}
                                </div>

                                {/* ГЛОБАЛЬНЫЕ КНОПКИ ДЛЯ ВОДИТЕЛЯ И ПРОРАБА */}
                                {role === 'driver' && !a.my_equip_is_freed && (
                                    <button onClick={() => openFreeModal('equipment', a)} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                                        <CheckCircle className="w-5 h-5" /> Свободен
                                    </button>
                                )}
                                {role === 'driver' && a.my_equip_is_freed && (
                                    <div className="mt-4 w-full flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 py-3.5 font-bold bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                                        <CheckCircle className="w-5 h-5" /> Вы свободны
                                    </div>
                                )}

                                {/* Если бригад несколько, и не все свободны, оставляем глобальную кнопку для удобства */}
                                {['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && a.is_team_freed !== 1 && teamIds.length > 1 && (
                                    <button onClick={() => openFreeModal('team', a)} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                                        <CheckCircle className="w-5 h-5" /> Освободить ВСЕ бригады
                                    </button>
                                )}
                                {['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && a.is_team_freed === 1 && teamIds.length > 0 && (
                                    <div className="mt-4 w-full flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 py-3.5 font-bold bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                                        <CheckCircle className="w-5 h-5" /> Все бригады свободны
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/30 rounded-2xl p-6 text-center">
                    <Flag className="w-8 h-8 text-blue-400 mx-auto mb-2 opacity-50" />
                    <p className="text-blue-700 dark:text-blue-300 font-medium">Предстоящих нарядов пока нет.</p>
                </div>
            )}
        </div>
    );
}

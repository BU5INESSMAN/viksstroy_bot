import {
    Users, Clock, CheckCircle, XCircle, User, Check, Truck
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeamSelector({
    teams,
    teamIds,
    onToggleTeam,
    teamMembers,
    selectedMembers,
    onToggleMember,
    checkTeamStatus,
    isSubmitting,
    // view-only props (CreateAppModal only)
    isViewOnly,
    appForm,
    data,
    role,
    openProfile,
    onCloseModal,
    openFreeModal,
}) {
    if (isViewOnly) {
        return (
            <div className="flex flex-col gap-4">
                {teamIds && teamIds.length > 0 ? (
                    teamIds.map(teamId => {
                        const tMembers = appForm.members_data?.filter(m => m.team_id === teamId) || [];
                        const tName = tMembers.length > 0 ? tMembers[0].team_name : (data?.teams?.find(t => t.id === teamId)?.name || 'Бригада');
                        const isThisFreed = appForm.freed_team_ids?.includes(teamId) || appForm.is_team_freed === 1;

                        return (
                            <div key={teamId} className="p-4 bg-gray-50/80 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600/50 rounded-2xl shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className={`font-bold flex items-center gap-2 ${isThisFreed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                                        <div className={`p-1.5 rounded-lg ${isThisFreed ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500'}`}>
                                            <Users className="w-4 h-4" />
                                        </div>
                                        {tName}
                                    </h4>
                                    {isThisFreed && <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-md flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Свободна</span>}
                                </div>

                                {tMembers.length > 0 ? (
                                    <div className="flex flex-wrap gap-2.5">
                                        {tMembers.map(m => (
                                            <button
                                                type="button"
                                                key={m.id}
                                                disabled={isSubmitting}
                                                onClick={() => { onCloseModal(); openProfile(m.tg_user_id, 'member', m.id); }}
                                                className="px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold border border-gray-200 dark:border-gray-700 rounded-xl text-xs transition-all flex items-center gap-2 shadow-sm active:scale-95 hover:shadow-md"
                                            >
                                                <User className="w-3.5 h-3.5 text-gray-400" /> {m.fio}
                                            </button>
                                        ))}
                                    </div>
                                ) : <p className="text-xs text-gray-500 italic bg-white dark:bg-gray-800 p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">Нет выбранных рабочих</p>}

                                {!isThisFreed && ['foreman', 'boss', 'superadmin', 'moderator'].includes(role) && (appForm.status === 'published' || appForm.status === 'in_progress') && (
                                    <button type="button" disabled={isSubmitting} onClick={() => openFreeModal('specific_team', { app: appForm, teamId })} className="mt-5 w-full text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 py-3.5 rounded-xl transition-all border border-emerald-200 dark:border-emerald-800/50 flex justify-center items-center gap-2 shadow-sm active:scale-[0.98]">
                                        <CheckCircle className="w-4 h-4" /> Освободить эту бригаду
                                    </button>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center">
                        <Truck className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                        <p className="font-medium text-gray-600 dark:text-gray-300">Только техника (люди не требуются)</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-wrap gap-2.5">
                <button type="button" disabled={isSubmitting} onClick={() => onToggleTeam(null)} className={`px-4 py-2.5 text-sm disabled:opacity-50 font-bold rounded-xl border transition-all active:scale-95 flex items-center gap-2 ${teamIds.length === 0 ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                    <XCircle className="w-4 h-4" /> Без бригады
                </button>
                {teams?.map(t => {
                    const st = checkTeamStatus(t.id);
                    const isSelected = teamIds.includes(t.id);
                    let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700';
                    let icon = <Users className="w-4 h-4 text-gray-400" />;

                    if (st.state === 'busy') {
                        btnStyles = 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-500 cursor-not-allowed opacity-75';
                        icon = <Clock className="w-4 h-4" />;
                    } else if (isSelected) {
                        btnStyles = 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-500';
                        icon = <CheckCircle className="w-4 h-4" />;
                    }

                    return (
                        <button key={t.id} type="button" disabled={isSubmitting} onClick={() => { if (st.state !== 'free') return toast.error(st.message); onToggleTeam(t.id); }} className={`px-4 py-2.5 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 ${btnStyles}`}>
                            {icon} {t.name}
                        </button>
                    );
                })}
            </div>

            {teamMembers?.length > 0 && (
                <div className="mt-5 p-5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 shadow-inner">
                    <label className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-4 uppercase tracking-wider">
                        <User className="w-4 h-4" /> Выберите людей:
                    </label>
                    {/* Group members by team */}
                    {teamIds.map(tid => {
                        const membersOfTeam = teamMembers.filter(m => m.team_id === tid);
                        if (membersOfTeam.length === 0) return null;
                        const teamName = membersOfTeam[0]?.team_name || teams?.find(t => t.id === tid)?.name || 'Бригада';
                        return (
                            <div key={tid} className="mb-4 last:mb-0">
                                <h4 className="text-[10px] font-extrabold text-indigo-500/70 dark:text-indigo-400/60 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Users className="w-3 h-3" /> {teamName}
                                </h4>
                                <div className="flex flex-wrap gap-2.5">
                                    {membersOfTeam.map(m => {
                                        const isSelected = selectedMembers?.includes(m.id);
                                        const isUnavailable = m.status === 'vacation' || m.status === 'sick';
                                        const statusLabel = m.status === 'vacation' ? 'Отп' : m.status === 'sick' ? 'Бол' : '';
                                        return (
                                            <button key={m.id} type="button" disabled={isSubmitting || isUnavailable} onClick={() => onToggleMember(m.id)}
                                                title={isUnavailable ? `${m.status === 'vacation' ? 'Отпуск' : 'Больничный'}${m.status_until ? ' до ' + m.status_until : ''}` : ''}
                                                className={`px-3.5 py-2 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 hover:shadow-md ${isUnavailable ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50 text-gray-400 border-gray-200 dark:border-gray-700' : isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                {isUnavailable
                                                    ? <div className="w-4 h-4 border-2 border-current rounded-full opacity-30"></div>
                                                    : isSelected ? <Check className="w-4 h-4" /> : <div className="w-4 h-4 border-2 border-current rounded-full opacity-30"></div>}
                                                {m.fio}
                                                {m.is_foreman && <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 font-bold">Бр</span>}
                                                {isUnavailable && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${m.status === 'vacation' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-500'}`}>
                                                        {statusLabel}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}

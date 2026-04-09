import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, Clock, CheckCircle,
    User, HardHat, X, Check, XCircle
} from 'lucide-react';

export default function CreateAppModal({
    appForm, setAppForm, isSubmitting, setGlobalCreateAppOpen,
    handleCreateApp, handleDeleteApp, handleFormChange, handleApplyDefaults,
    smartDates, objectsList, data, role,
    toggleTeamSelection, toggleAppMember, checkTeamStatus, checkEquipStatus,
    toggleEquipmentSelection, updateEquipmentTime,
    activeEqCategory, setActiveEqCategory, teamMembers, openProfile, openFreeModal
}) {
    return (
        <div className="fixed inset-0 z-[110] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                {/* ТУТ ИСПРАВЛЕНА ШИРИНА С max-w-lg НА max-w-3xl */}
                <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl relative transition-colors overflow-hidden">

                    {/* Экран загрузки поверх модалки */}
                    {isSubmitting && (
                        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="font-bold text-blue-600 dark:text-blue-400">Сохранение...</p>
                        </div>
                    )}

                    <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-white">
                            <ClipboardList className="w-6 h-6 text-blue-500 mr-2.5" />
                            {appForm.isKanbanView ? 'Просмотр наряда' : (appForm.id ? (appForm.isViewOnly ? 'Детали наряда' : 'Редактирование наряда') : 'Новый наряд')}
                        </h2>
                        <button onClick={() => setGlobalCreateAppOpen(false)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700 transition-colors active:scale-95 shadow-sm">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleCreateApp} className="flex flex-col max-h-[80vh]">
                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">

                            {/* Дата */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5"><Calendar className="w-4 h-4 text-blue-500" /> Дата работ</label>
                                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
                                    {smartDates.map(sd => (
                                        <button type="button" key={sd.value} disabled={appForm.isViewOnly} onClick={() => handleFormChange('date_target', sd.value)} className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold border transition-all active:scale-95 ${appForm.date_target === sd.value ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-200 dark:ring-blue-900' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                            {sd.label}
                                        </button>
                                    ))}
                                </div>
                                <input type="date" value={appForm.date_target} onChange={(e) => handleFormChange('date_target', e.target.value)} disabled={appForm.isViewOnly} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-blue-500 block w-full p-3.5 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none shadow-inner transition-colors disabled:opacity-60" />
                            </div>

                            {/* Объект */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5"><MapPin className="w-4 h-4 text-red-500" /> Объект</label>
                                <select value={appForm.object_id} onChange={(e) => handleFormChange('object_id', e.target.value)} disabled={appForm.isViewOnly} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-red-500 block w-full p-3.5 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none shadow-inner transition-colors disabled:opacity-60 appearance-none">
                                    <option value="">Выберите объект...</option>
                                    {objectsList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>

                            {/* Прораб */}
                            {['superadmin', 'boss', 'moderator'].includes(role) && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5"><User className="w-4 h-4 text-yellow-500" /> Прораб</label>
                                    <select value={appForm.foreman_id} onChange={(e) => handleFormChange('foreman_id', e.target.value)} disabled={appForm.isViewOnly} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-yellow-500 block w-full p-3.5 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none shadow-inner transition-colors disabled:opacity-60 appearance-none">
                                        <option value="">Выберите прораба...</option>
                                        {data.stats.users?.filter(u => u.role === 'foreman' || u.role === 'brigadier').map(u => <option key={u.user_id} value={u.user_id}>{u.fio}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* РАБОЧИЕ И БРИГАДЫ */}
                            {appForm.object_id && teamMembers.length > 0 && (
                                <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-5 bg-white dark:bg-gray-800 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 rounded-l-2xl"></div>
                                    <div className="flex justify-between items-center mb-4 pl-2">
                                        <label className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" /> Рабочие</label>
                                        <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 py-1 px-2.5 rounded-lg text-xs font-bold border border-indigo-100 dark:border-indigo-800/50">
                                            Выбрано: {appForm.workers.length}
                                        </span>
                                    </div>

                                    {!appForm.isViewOnly && objectsList.find(o => o.id === Number(appForm.object_id))?.default_team_ids && (
                                        <button type="button" onClick={() => handleApplyDefaults('teams')} className="w-full mb-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 py-2 rounded-xl text-xs font-bold border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                                            Выбрать бригады по умолчанию
                                        </button>
                                    )}

                                    <div className="space-y-4">
                                        {data.teams.filter(t => teamMembers.some(m => t.members.find(tm => tm.id === m.id))).map(team => {
                                            const status = checkTeamStatus(team.id);
                                            return (
                                                <div key={team.id} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
                                                    <div className={`flex justify-between items-center p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors ${status === 'all' ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`} onClick={() => { if (!appForm.isViewOnly) toggleTeamSelection(team.id); }}>
                                                        <span className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${status === 'all' ? 'bg-indigo-500 border-indigo-500' : status === 'partial' ? 'bg-indigo-200 border-indigo-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                                                {status === 'all' && <Check className="w-3 h-3 text-white" />}
                                                                {status === 'partial' && <div className="w-2 h-2 bg-indigo-500 rounded-sm" />}
                                                            </div>
                                                            {team.name}
                                                        </span>
                                                        <span className="text-xs text-gray-500 font-medium">{team.members.length} чел.</span>
                                                    </div>
                                                    <div className="divide-y divide-gray-50 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                                        {team.members.map(member => (
                                                            <div key={member.id} className={`flex items-center p-3 cursor-pointer transition-colors ${appForm.workers.includes(member.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`} onClick={() => { if (!appForm.isViewOnly) toggleAppMember(member.id); }}>
                                                                <div className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center mr-3 transition-colors ${appForm.workers.includes(member.id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                                                    {appForm.workers.includes(member.id) && <Check className="w-3 h-3 text-white" />}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{member.fio}</span>
                                                                    <span className="text-[10px] text-gray-400 font-medium">{member.position}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ТЕХНИКА */}
                            <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-5 bg-white dark:bg-gray-800 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 rounded-l-2xl"></div>
                                <div className="flex justify-between items-center mb-4 pl-2">
                                    <label className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Truck className="w-5 h-5 text-emerald-500" /> Техника</label>
                                    <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 py-1 px-2.5 rounded-lg text-xs font-bold border border-emerald-100 dark:border-emerald-800/50">
                                        Выбрано: {appForm.equipment.length}
                                    </span>
                                </div>

                                {!appForm.isViewOnly && objectsList.find(o => o.id === Number(appForm.object_id))?.default_equip_ids && (
                                    <button type="button" onClick={() => handleApplyDefaults('equipment')} className="w-full mb-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 py-2 rounded-xl text-xs font-bold border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                                        Выбрать технику по умолчанию
                                    </button>
                                )}

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {data.equip_categories?.map(cat => {
                                        const catEqs = data.equipment.filter(e => e.category === cat);
                                        if (catEqs.length === 0) return null;
                                        const status = checkEquipStatus(cat);
                                        return (
                                            <button key={cat} type="button" onClick={() => setActiveEqCategory(activeEqCategory === cat ? null : cat)} className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors ${activeEqCategory === cat ? 'bg-emerald-600 text-white border-emerald-600' : status !== 'none' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800/50 dark:text-emerald-400' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`}>
                                                {cat} <span className="ml-1 opacity-60">({catEqs.length})</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {activeEqCategory && (
                                    <div className="space-y-2 mb-4 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                                        {data.equipment.filter(e => e.category === activeEqCategory).map(eq => {
                                            const isSelected = appForm.equipment.find(e => e.id === eq.id);
                                            return (
                                                <div key={eq.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${isSelected ? 'bg-white border-emerald-500 shadow-sm dark:bg-gray-800 dark:border-emerald-500' : 'bg-white border-gray-200 hover:border-emerald-300 dark:bg-gray-800 dark:border-gray-600 dark:hover:border-emerald-700'}`} onClick={() => { if (!appForm.isViewOnly) toggleEquipmentSelection(eq.id); }}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                                        </div>
                                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{eq.name}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {appForm.equipment.length > 0 && (
                                    <div className="space-y-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Время подачи техники:</h4>
                                        {appForm.equipment.map(eq => (
                                            <div key={eq.id} className="flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-900/10 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                                                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 truncate pr-2 flex items-center gap-2">
                                                    {eq.is_freed && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                                                    <span className={eq.is_freed ? 'line-through opacity-50' : ''}>{eq.name.split('(')[0].trim()}</span>
                                                </span>
                                                <input type="time" disabled={appForm.isViewOnly || eq.is_freed} value={eq.time} onChange={(e) => updateEquipmentTime(eq.id, e.target.value)} onClick={(e) => e.stopPropagation()} className="bg-white border border-emerald-200 text-emerald-900 text-xs font-bold rounded-lg focus:ring-2 focus:ring-emerald-500 block w-24 p-2 text-center dark:bg-gray-800 dark:border-emerald-700 dark:text-emerald-100 outline-none disabled:opacity-60" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ПЛАН РАБОТ */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5"><MessageSquare className="w-4 h-4 text-purple-500" /> План работ (Опционально)</label>
                                <textarea disabled={appForm.isViewOnly} rows="3" value={appForm.plan_text} onChange={(e) => handleFormChange('plan_text', e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-medium rounded-xl focus:ring-2 focus:ring-purple-500 block w-full p-4 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none shadow-inner transition-colors disabled:opacity-60 resize-none" placeholder="Укажите задачи на смену..."></textarea>
                            </div>
                        </div>

                        {/* КНОПКИ УПРАВЛЕНИЯ (ЗАБЛОКИРОВАНЫ В KANBAN) */}
                        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 flex flex-wrap sm:flex-nowrap gap-3">
                            {appForm.isKanbanView ? (
                                <button type="button" onClick={() => setGlobalCreateAppOpen(false)} className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-4 px-6 rounded-xl font-bold shadow-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-all active:scale-[0.98]">
                                    Закрыть просмотр
                                </button>
                            ) : (
                                <>
                                    {appForm.id && ['superadmin', 'boss'].includes(role) && (
                                        <button type="button" disabled={isSubmitting} onClick={() => handleDeleteApp(appForm.id)} className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 py-4 px-4 rounded-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center">
                                            {isSubmitting ? '⏳' : <XCircle className="w-5 h-5" />}
                                        </button>
                                    )}

                                    {appForm.isViewOnly && appForm.status === 'waiting' && ['foreman', 'moderator', 'boss', 'superadmin'].includes(role) && (
                                        <button type="button" disabled={isSubmitting} onClick={() => setAppForm(prev => ({...prev, isViewOnly: false}))} className="bg-yellow-500 text-white py-4 px-6 rounded-xl font-bold disabled:opacity-50 shadow-md hover:shadow-lg hover:bg-yellow-600 transition-all active:scale-[0.98] flex-1 flex justify-center items-center gap-2">
                                            Редактировать
                                        </button>
                                    )}

                                    {!appForm.isViewOnly && (
                                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white py-4 px-6 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex-[2] flex justify-center items-center gap-2">
                                            {isSubmitting ? '⏳ Обработка...' : (appForm.id ? 'Сохранить изменения' : 'Отправить наряд')}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
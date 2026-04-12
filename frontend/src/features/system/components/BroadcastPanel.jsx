import { Send, MessageSquare, X, Megaphone } from 'lucide-react';
import { GlassCard, SectionHeader, ROLE_ORDER, ROLE_NAMES, ROLE_COLORS } from './UIHelpers';

export default function BroadcastPanel({
    users,
    broadcastText,
    setBroadcastText,
    broadcastLoading,
    sendBroadcastGroup,
    dmModalOpen,
    setDmModalOpen,
    dmMode,
    setDmMode,
    dmSelectedRoles,
    setDmSelectedRoles,
    dmSelectedUsers,
    setDmSelectedUsers,
    sendBroadcastDM,
}) {
    return (
        <>
            {/* ====== BROADCAST (Рассылка) ====== */}
            <GlassCard className="p-6 sm:p-8">
                <SectionHeader icon={Megaphone} iconColor="text-pink-500 bg-pink-500" title="Рассылка"
                    subtitle="Отправьте сообщение в групповой чат или персональные сообщения." />

                <textarea
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    placeholder="Введите текст рассылки..."
                    rows={4}
                    className="w-full bg-gray-50/80 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-xl p-4 text-sm text-gray-900 dark:text-white font-medium placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-pink-500 outline-none resize-none mb-4"
                />

                <div className="flex gap-3">
                    <button onClick={sendBroadcastGroup} disabled={broadcastLoading || !broadcastText.trim()}
                        className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm py-3 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md">
                        <Send className="w-4 h-4" /> Отправить в группу
                    </button>
                    <button onClick={() => setDmModalOpen(true)} disabled={!broadcastText.trim()}
                        className="flex-1 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200 font-bold rounded-xl text-sm py-3 border border-gray-200 dark:border-gray-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm">
                        <MessageSquare className="w-4 h-4" /> Отправить в ЛС
                    </button>
                </div>
            </GlassCard>

            {/* ====== DM BROADCAST MODAL ====== */}
            {dmModalOpen && (
                <div className="fixed inset-0 w-screen h-[100dvh] z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDmModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-pink-500" /> Рассылка в ЛС
                            </h3>
                            <button onClick={() => setDmModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Mode tabs */}
                        <div className="flex border-b border-gray-100 dark:border-gray-700">
                            <button onClick={() => setDmMode('roles')}
                                className={`flex-1 py-3 text-sm font-bold transition ${dmMode === 'roles' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                                По ролям
                            </button>
                            <button onClick={() => setDmMode('users')}
                                className={`flex-1 py-3 text-sm font-bold transition ${dmMode === 'users' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                                По пользователям
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto max-h-[50vh]">
                            {dmMode === 'roles' ? (
                                <div className="space-y-2">
                                    {ROLE_ORDER.map(r => (
                                        <label key={r} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition">
                                            <input type="checkbox" checked={dmSelectedRoles.includes(r)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setDmSelectedRoles(p => [...p, r]);
                                                    else setDmSelectedRoles(p => p.filter(x => x !== r));
                                                }}
                                                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                                            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border ${ROLE_COLORS[r]}`}>
                                                {ROLE_NAMES[r]}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {ROLE_ORDER.map(r => {
                                        const roleUsers = users.filter(u => u.role === r && u.role !== 'linked');
                                        if (!roleUsers.length) return null;
                                        return (
                                            <div key={r}>
                                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{ROLE_NAMES[r]}</p>
                                                <div className="space-y-1">
                                                    {roleUsers.map(u => (
                                                        <label key={u.user_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition">
                                                            <input type="checkbox" checked={dmSelectedUsers.includes(u.user_id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setDmSelectedUsers(p => [...p, u.user_id]);
                                                                    else setDmSelectedUsers(p => p.filter(x => x !== u.user_id));
                                                                }}
                                                                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{u.fio}</span>
                                                            <span className="text-[10px] text-gray-400 ml-auto font-mono">{u.user_id > 0 ? 'TG' : 'MAX'}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-5 border-t border-gray-100 dark:border-gray-700">
                            <button onClick={sendBroadcastDM} disabled={broadcastLoading || (dmMode === 'roles' ? !dmSelectedRoles.length : !dmSelectedUsers.length)}
                                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm py-3 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md">
                                <Send className="w-4 h-4" /> Отправить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

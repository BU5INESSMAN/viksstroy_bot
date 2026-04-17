import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    Users, Link, UserPlus, User, UserMinus, Star, Trash2, X, Palette
} from 'lucide-react';
import MemberStatusModal from './MemberStatusModal';
import IconPicker from '../../../components/ui/IconPicker';
import { TEAM_ICONS, getIconComponent, DEFAULT_TEAM_ICON } from '../../../utils/iconConfig';

const STATUS_BADGES = {
    vacation: { label: 'Отпуск', className: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700' },
    sick: { label: 'Больничный', className: 'bg-red-50 dark:bg-red-900/20 text-red-500 border-red-200 dark:border-red-700' },
};

const formatShortDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch { return dateStr; }
};

export default function ManageTeamModal({ isManageModalOpen, setManageModalOpen, manageTeamData, canManage, generateInvite, newMember, setNewMember, handleAddMember, toggleForeman, handleUnlinkMember, deleteMember, openProfile, tgId, onRefresh }) {
    const [statusMember, setStatusMember] = useState(null);
    const [iconKey, setIconKey] = useState(manageTeamData?.icon || null);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);

    useEffect(() => { setIconKey(manageTeamData?.icon || null); }, [manageTeamData?.id]);

    if (!isManageModalOpen || !manageTeamData) return null;

    const CurrentTeamIcon = getIconComponent(iconKey, TEAM_ICONS)
        || getIconComponent(DEFAULT_TEAM_ICON, TEAM_ICONS);

    const saveIcon = async (key) => {
        const prev = iconKey;
        setIconKey(key);
        try {
            await axios.patch(`/api/teams/${manageTeamData.id}`, { icon: key });
            toast.success('Иконка обновлена');
            onRefresh?.();
        } catch (e) {
            setIconKey(prev);
            toast.error(e?.response?.data?.detail || 'Ошибка сохранения');
        }
    };

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden border border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-xl font-bold dark:text-white flex items-center gap-2 min-w-0">
                            <CurrentTeamIcon className="w-6 h-6 text-indigo-500 flex-shrink-0" stroke={2} />
                            <span className="truncate">Бригада: {manageTeamData.name}</span>
                        </h3>
                        <button onClick={() => setManageModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700 flex-shrink-0">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        {canManage && (
                            <div className="rounded-2xl border border-gray-100 dark:border-gray-700">
                                <button
                                    type="button"
                                    onClick={() => setIconPickerOpen((o) => !o)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors rounded-2xl"
                                >
                                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                        <Palette className="w-4 h-4" />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Иконка бригады</div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                            {iconKey ? (TEAM_ICONS[iconKey]?.label || iconKey) : 'Не выбрана'}
                                        </div>
                                    </span>
                                    <span className="text-xs font-bold text-indigo-500">{iconPickerOpen ? 'Скрыть' : 'Выбрать'}</span>
                                </button>
                                {iconPickerOpen && (
                                    <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                                        <IconPicker
                                            value={iconKey}
                                            onChange={saveIcon}
                                            icons={TEAM_ICONS}
                                            columns={5}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-gray-400" /> Состав ({manageTeamData.members.length})
                            </h4>
                            {manageTeamData.members.length === 0 ? (
                                <div className="bg-gray-50 dark:bg-gray-700/30 p-6 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center text-sm text-gray-500 dark:text-gray-400 italic">
                                    Бригада пока пуста
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                    {manageTeamData.members.map(m => (
                                        <div key={m.id} className="flex flex-col sm:flex-row sm:items-center p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm gap-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`p-2 rounded-full flex-shrink-0 ${m.is_foreman ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                                    {m.is_foreman ? <Star className="w-5 h-5 fill-current" /> : <User className="w-5 h-5" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-gray-800 dark:text-gray-100 text-base leading-tight truncate">{m.fio}</p>
                                                        {m.status && m.status !== 'available' && STATUS_BADGES[m.status] && (
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_BADGES[m.status].className}`}>
                                                                {STATUS_BADGES[m.status].label}{m.status_until ? ` до ${formatShortDate(m.status_until)}` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mt-0.5">{m.position}</p>
                                                </div>
                                            </div>

                                            {canManage && (
                                                <div className="flex flex-wrap gap-2 sm:ml-auto sm:flex-shrink-0">
                                                    <button type="button" onClick={() => { setManageModalOpen(false); openProfile(m.tg_user_id, 'member', m.id); }} className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95">
                                                        <User className="w-3.5 h-3.5" /> Профиль
                                                    </button>

                                                    {m.is_linked && (
                                                        <button onClick={() => handleUnlinkMember(m.id)} className="bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95">
                                                            <UserMinus className="w-3.5 h-3.5" /> Отвязать
                                                        </button>
                                                    )}

                                                    <button onClick={() => setStatusMember(m)} className={`${m.status === 'vacation' ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400' : m.status === 'sick' ? 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'} px-3.5 py-2 rounded-xl text-xs font-bold hover:opacity-80 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95`}>
                                                        {m.status === 'vacation' ? 'Отпуск' : m.status === 'sick' ? 'Больничный' : 'Статус'}
                                                    </button>
                                                    <button onClick={() => toggleForeman(m.id, m.is_foreman ? 0 : 1)} className={`${m.is_foreman ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'} px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm active:scale-95`}>
                                                        <Star className={`w-3.5 h-3.5 ${m.is_foreman ? 'text-gray-500' : 'fill-current'}`} /> {m.is_foreman ? 'Снять роль' : 'Бригадир'}
                                                    </button>
                                                    <button onClick={() => deleteMember(m.id)} className="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {canManage && (
                            <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-inner">
                                <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                                    <UserPlus className="w-4 h-4 text-gray-400" /> Добавить вручную
                                </h4>
                                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3">
                                    <input type="text" value={newMember.fio} onChange={e => setNewMember({...newMember, fio: e.target.value})} placeholder="ФИО" required className="flex-[2] p-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500 transition-colors" />
                                    <input type="text" value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} placeholder="Должность" required className="flex-1 p-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500 transition-colors" />
                                    <button type="submit" className="bg-gray-800 dark:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-gray-900 dark:hover:bg-gray-500 transition-all shadow-sm text-sm active:scale-95 flex items-center justify-center">Добавить</button>
                                </form>
                            </div>
                        )}

                        {canManage && (
                            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 shadow-inner">
                                <h4 className="font-bold text-indigo-800 dark:text-indigo-300 mb-2 flex items-center gap-2">
                                    <Link className="w-5 h-5" /> Пригласить рабочих
                                </h4>
                                <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mb-4 font-medium">Сгенерируйте ссылку, чтобы рабочие сами добавились в бригаду.</p>
                                <button onClick={generateInvite} className="bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 font-bold py-3 px-5 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-700/50 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-2 w-full sm:w-auto">
                                    <UserPlus className="w-4 h-4" /> Сгенерировать ссылку
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {canManage && (
                <MemberStatusModal
                    isOpen={!!statusMember}
                    onClose={() => setStatusMember(null)}
                    member={statusMember}
                    tgId={tgId}
                    onSaved={onRefresh}
                />
            )}
        </div>
    );
}

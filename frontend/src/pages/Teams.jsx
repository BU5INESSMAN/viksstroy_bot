import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
    Users, Plus, HardHat, Settings, Trash2, Link,
    UserPlus, User, UserMinus, Star, Send, Globe,
    MessageCircle, Copy, X
} from 'lucide-react';

export default function Teams() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const { openProfile } = useOutletContext();

    const [teams, setTeams] = useState([]);

    const [isTeamModalOpen, setTeamModalOpen] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [isManageModalOpen, setManageModalOpen] = useState(false);
    const [manageTeamData, setManageTeamData] = useState(null);
    const [newMember, setNewMember] = useState({ fio: '', position: 'Рабочий', is_foreman: false });
    const [inviteInfo, setInviteInfo] = useState(null);
    const [copiedLink, setCopiedLink] = useState('');

    const fetchData = () => { axios.get('/api/dashboard').then(res => setTeams(res.data.teams || [])).catch(()=>{}); };
    useEffect(() => { fetchData(); }, []);

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', newTeamName);
            fd.append('tg_id', tgId);
            await axios.post('/api/teams/create', fd);
            setTeamModalOpen(false);
            setNewTeamName('');
            fetchData();
        } catch (err) { alert("Ошибка создания бригады"); }
    };

    const handleDeleteTeam = async (id) => {
        if (!window.confirm("Удалить бригаду и отвязать всех участников?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post(`/api/teams/${id}/delete`, fd);
            fetchData();
        } catch(e) { alert("Ошибка удаления"); }
    };

    const openManageModal = async (teamId) => {
        try {
            const res = await axios.get(`/api/teams/${teamId}/details`);
            setManageTeamData(res.data);
            setManageModalOpen(true);
        } catch (e) { alert("Ошибка загрузки бригады"); }
    };

    const handleAddMember = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('fio', newMember.fio);
            fd.append('position', newMember.position);
            fd.append('is_foreman', newMember.is_foreman ? 1 : 0);
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/${manageTeamData.id}/members/add`, fd);
            setNewMember({ fio: '', position: 'Рабочий', is_foreman: false });
            openManageModal(manageTeamData.id);
        } catch (e) { alert("Ошибка добавления участника"); }
    };

    const toggleForeman = async (memberId, is_foreman) => {
        try {
            const fd = new FormData();
            fd.append('is_foreman', is_foreman);
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/toggle_foreman`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { alert("Ошибка обновления роли"); }
    };

    const handleUnlinkMember = async (memberId) => {
        if (!window.confirm("Отвязать Telegram/MAX аккаунт от этого рабочего?")) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/unlink`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { alert("Ошибка при отвязке аккаунта"); }
    };

    const deleteMember = async (memberId) => {
        if (!window.confirm("Удалить участника из бригады?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/delete`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { alert("Ошибка удаления участника"); }
    };

    const generateInvite = async () => {
        try {
            const res = await axios.post(`/api/teams/${manageTeamData.id}/generate_invite`);
            setInviteInfo(res.data);
            setCopiedLink('');
        } catch (e) { alert("Ошибка генерации ссылки"); }
    };

    const copyToClipboard = (text, linkType) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedLink(linkType);
            setTimeout(() => setCopiedLink(''), 2000);
        });
    };

    const copyInviteMessage = () => {
        const code = inviteInfo.invite_code || inviteInfo.join_password;
        const message = `👋 Привет! Присоединяйся к нашей бригаде в системе «ВИКС Расписание».\n\n📱 Прямая ссылка:\n${inviteInfo.invite_link}\n\n✈️ Ссылка для Telegram бота:\n${inviteInfo.tg_bot_link}\n\n💬 Для мессенджера MAX:\nОтправьте боту Расписания команду:\n/join ${code}`;
        copyToClipboard(message, 'all');
        alert('Полное сообщение скопировано в буфер обмена!');
    };

    const canEdit = ['moderator', 'boss', 'superadmin'].includes(role);

    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <Users className="w-7 h-7 text-indigo-500 mr-2.5" /> Бригады
                </h2>
                {canEdit && (
                    <button onClick={() => setTeamModalOpen(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Создать
                    </button>
                )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
                {teams.map(t => (
                    <div key={t.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all group">
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
                            {canEdit && (
                                <button onClick={() => handleDeleteTeam(t.id)} className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 py-3 px-4 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center justify-center active:scale-95">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {teams.length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-400 italic">Бригад пока нет.</div>
                )}
            </div>

            {/* МОДАЛКА СОЗДАНИЯ БРИГАДЫ */}
            {isTeamModalOpen && (
                <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
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
            )}

            {/* МОДАЛКА УПРАВЛЕНИЯ */}
            {isManageModalOpen && manageTeamData && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden border border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                                <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                                    <Users className="w-6 h-6 text-indigo-500" /> Бригада: {manageTeamData.name}
                                </h3>
                                <button onClick={() => setManageModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* ИНВАЙТ */}
                                {canEdit && (
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

                                {/* ДОБАВИТЬ ВРУЧНУЮ */}
                                {canEdit && (
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

                                {/* СПИСОК */}
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
                                                <div key={m.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm gap-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-full ${m.is_foreman ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                                            {m.is_foreman ? <Star className="w-5 h-5 fill-current" /> : <User className="w-5 h-5" />}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800 dark:text-gray-100 text-base leading-tight">{m.fio}</p>
                                                            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mt-0.5">{m.position}</p>
                                                        </div>
                                                    </div>

                                                    {canEdit && (
                                                        <div className="flex flex-wrap gap-2">
                                                            <button type="button" onClick={() => { setManageModalOpen(false); openProfile(m.tg_user_id, 'member', m.id); }} className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95">
                                                                <User className="w-3.5 h-3.5" /> Профиль
                                                            </button>

                                                            {m.is_linked && (
                                                                <button onClick={() => handleUnlinkMember(m.id)} className="bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95">
                                                                    <UserMinus className="w-3.5 h-3.5" /> Отвязать
                                                                </button>
                                                            )}

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
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ОКНО СО ССЫЛКАМИ */}
            {inviteInfo && (
                <div className="fixed inset-0 z-[130] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative border border-gray-100 dark:border-gray-700">
                        <button onClick={() => setInviteInfo(null)} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5">
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-2xl font-bold mb-2 dark:text-white flex items-center gap-2">
                            <Link className="w-6 h-6 text-indigo-500" /> Приглашение
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium leading-relaxed">Скопируйте и отправьте ссылки рабочим, чтобы они смогли присоединиться к бригаде.</p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <Send className="w-4 h-4" /> Для Telegram:
                                </label>
                                <button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm text-blue-600 dark:text-blue-400 active:scale-[0.98]">
                                    {copiedLink === 'tg' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <Globe className="w-4 h-4" /> Прямая Web-ссылка:
                                </label>
                                <button onClick={() => copyToClipboard(inviteInfo.invite_link, 'web')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm text-blue-600 dark:text-blue-400 active:scale-[0.98]">
                                    {copiedLink === 'web' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <MessageCircle className="w-4 h-4" /> Для мессенджера MAX:
                                </label>
                                <div className="w-full text-center px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-medium shadow-sm flex items-center justify-center transition-colors">
                                    <code
                                        className="text-blue-600 dark:text-blue-400 font-bold text-lg cursor-pointer hover:opacity-70 active:scale-95"
                                        onClick={() => copyToClipboard(`/join ${inviteInfo.invite_code || inviteInfo.join_password}`, 'max')}
                                    >
                                        {copiedLink === 'max' ? '✅ Скопировано!' : `/join ${inviteInfo.invite_code || inviteInfo.join_password}`}
                                    </code>
                                </div>
                            </div>
                        </div>

                        <button onClick={copyInviteMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] mb-3 flex justify-center items-center gap-2">
                            <Copy className="w-5 h-5" />
                            Скопировать всё сообщение
                        </button>

                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-[0.98]">Готово</button>
                    </div>
                </div>
            )}
        </main>
    );
}
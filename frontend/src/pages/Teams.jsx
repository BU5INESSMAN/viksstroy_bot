import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';

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
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-20">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">👥</span> Бригады</h2>
                {canEdit && <button onClick={() => setTeamModalOpen(true)} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold shadow hover:bg-blue-700 transition">+ Создать</button>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {teams.map(t => (
                    <div key={t.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-md transition">
                        <div>
                            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-white">🏗 {t.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Участников: {t.member_count}</p>
                        </div>
                        <div className="flex space-x-2">
                            <button onClick={() => openManageModal(t.id)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-bold transition">Управление</button>
                            {canEdit && <button onClick={() => handleDeleteTeam(t.id)} className="bg-red-50 hover:bg-red-100 text-red-600 py-2.5 px-4 rounded-xl text-sm font-bold transition">🗑</button>}
                        </div>
                    </div>
                ))}
            </div>

            {/* МОДАЛКА СОЗДАНИЯ БРИГАДЫ */}
            {isTeamModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative">
                        <button onClick={() => setTeamModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 text-2xl leading-none">&times;</button>
                        <h3 className="text-2xl font-bold mb-6 dark:text-white">Новая бригада</h3>
                        <form onSubmit={handleCreateTeam} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Название</label>
                                <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} required placeholder="Например: Монтажники-1" className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-medium" />
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-blue-700 transition-transform active:scale-95 mt-2">Создать</button>
                        </form>
                    </div>
                </div>
            )}

            {/* МОДАЛКА УПРАВЛЕНИЯ */}
            {isManageModalOpen && manageTeamData && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm">
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
                            <div className="flex justify-between items-center px-6 py-5 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                                <h3 className="text-xl font-bold dark:text-white">Бригада: {manageTeamData.name}</h3>
                                <button onClick={() => setManageModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl leading-none transition">&times;</button>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* ИНВАЙТ */}
                                {canEdit && (
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/50">
                                        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center"><span className="text-xl mr-2">🔗</span> Пригласить рабочих</h4>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">Сгенерируйте ссылку, чтобы рабочие сами добавились в бригаду.</p>
                                        <button onClick={generateInvite} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md transition-transform active:scale-95 text-sm">
                                            Сгенерировать ссылку
                                        </button>
                                    </div>
                                )}

                                {/* ДОБАВИТЬ ВРУЧНУЮ */}
                                {canEdit && (
                                    <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-200 dark:border-gray-600">
                                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-4">Добавить вручную</h4>
                                        <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3">
                                            <input type="text" value={newMember.fio} onChange={e => setNewMember({...newMember, fio: e.target.value})} placeholder="ФИО" required className="flex-[2] p-2.5 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl outline-none text-sm dark:text-white" />
                                            <input type="text" value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} placeholder="Должность" required className="flex-1 p-2.5 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl outline-none text-sm dark:text-white" />
                                            <button type="submit" className="bg-gray-800 dark:bg-gray-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-gray-900 transition shadow text-sm">Добавить</button>
                                        </form>
                                    </div>
                                )}

                                {/* СПИСОК */}
                                <div>
                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-3 border-b dark:border-gray-700 pb-2">Состав ({manageTeamData.members.length})</h4>
                                    {manageTeamData.members.length === 0 ? (
                                        <p className="text-sm text-gray-500 italic py-4 text-center">Бригада пуста</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {manageTeamData.members.map(m => (
                                                <div key={m.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 gap-3">
                                                    <div>
                                                        <p className="font-bold text-gray-800 dark:text-gray-100 text-base">{m.fio} {m.is_foreman ? '⭐' : ''}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{m.position}</p>
                                                    </div>

                                                    {canEdit && (
                                                        <div className="flex flex-wrap gap-2">
                                                            <button type="button" onClick={() => { setManageModalOpen(false); openProfile(m.tg_user_id, 'member', m.id); }} className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-200 transition whitespace-nowrap">
                                                                👤 Профиль
                                                            </button>
                                                            <button onClick={() => toggleForeman(m.id, m.is_foreman ? 0 : 1)} className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-200 transition whitespace-nowrap">
                                                                {m.is_foreman ? 'Снять ⭐' : 'Сделать бригадиром'}
                                                            </button>
                                                            <button onClick={() => deleteMember(m.id)} className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-200 transition whitespace-nowrap">
                                                                Удалить
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
                <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl w-full max-w-sm shadow-2xl relative">
                        <button onClick={() => setInviteInfo(null)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 text-2xl leading-none">&times;</button>
                        <h3 className="text-2xl font-bold mb-2 dark:text-white">Приглашение</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Скопируйте и отправьте ссылки рабочим.</p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">✈️ Для Telegram:</label>
                                <button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition shadow-sm text-blue-600 dark:text-blue-400">
                                    {copiedLink === 'tg' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">🌐 Прямая Web-ссылка:</label>
                                <button onClick={() => copyToClipboard(inviteInfo.invite_link, 'web')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition shadow-sm text-blue-600 dark:text-blue-400">
                                    {copiedLink === 'web' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">💬 Для мессенджера MAX:</label>
                                <div className="w-full text-center px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium shadow-sm flex items-center justify-center">
                                    <code
                                        className="text-blue-600 dark:text-blue-400 font-bold text-lg cursor-pointer"
                                        onClick={() => copyToClipboard(`/join ${inviteInfo.invite_code || inviteInfo.join_password}`, 'max')}
                                    >
                                        {copiedLink === 'max' ? '✅ Скопировано!' : `/join ${inviteInfo.invite_code || inviteInfo.join_password}`}
                                    </code>
                                </div>
                            </div>
                        </div>

                        <button onClick={copyInviteMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 mb-3 flex justify-center items-center space-x-2">
                            <span>📄</span>
                            <span>Скопировать всё сообщение</span>
                        </button>

                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 dark:bg-gray-700 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-gray-900 transition-colors">Готово</button>
                    </div>
                </div>
            )}
        </main>
    );
}
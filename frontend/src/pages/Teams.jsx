import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Teams() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const [teams, setTeams] = useState([]);

    const [isTeamModalOpen, setTeamModalOpen] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [isManageModalOpen, setManageModalOpen] = useState(false);
    const [manageTeamData, setManageTeamData] = useState(null);
    const [newMember, setNewMember] = useState({ fio: '', position: 'Рабочий', is_foreman: false });
    const [inviteInfo, setInviteInfo] = useState(null);

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
        } catch (e) { alert("Ошибка создания"); }
    };

    const openManageModal = async (teamId) => {
        try {
            const res = await axios.get(`/api/teams/${teamId}/details`);
            setManageTeamData(res.data);
            setManageModalOpen(true);
        } catch (e) { alert("Ошибка загрузки"); }
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
        } catch (e) { alert("Ошибка"); }
    };

    const handleToggleForeman = async (memberId, currentStatus) => {
        try {
            const fd = new FormData();
            fd.append('is_foreman', currentStatus ? 0 : 1);
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/toggle_foreman`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { alert("Ошибка"); }
    };

    const handleDeleteMember = async (memberId) => {
        if(!window.confirm("Удалить?")) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/delete`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { alert("Ошибка"); }
    };

    const handleDeleteTeam = async (teamId) => {
        if(!window.confirm("Удалить бригаду и всех участников?")) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/${teamId}/delete`, fd);
            setManageModalOpen(false);
            fetchData();
        } catch (e) { alert("Ошибка"); }
    };

    const generateInviteLink = async (teamId) => {
        try {
            const res = await axios.post(`/api/teams/${teamId}/generate_invite`);
            setInviteInfo(res.data);
            setManageModalOpen(false);
        } catch (e) {
            alert("Ошибка генерации инвайта");
        }
    };

    // НОВАЯ ФУНКЦИЯ КОПИРОВАНИЯ СООБЩЕНИЯ В БУФЕР
    const copyInviteMessage = () => {
        if (!inviteInfo) return;
        const text = `🏗 Приглашение в бригаду «${manageTeamData?.name || 'ВИКС'}»!

Для подключения к платформе перейдите по одной из ссылок:
✈️ Telegram: ${inviteInfo.tg_bot_link}
📱 MAX: ${inviteInfo.max_bot_link}
🌐 Web: ${inviteInfo.invite_link}

🔑 Код доступа: ${inviteInfo.join_password}`;

        navigator.clipboard.writeText(text);
        alert("Сообщение скопировано в буфер обмена!");
    };

    const canEdit = ['superadmin', 'boss', 'moderator'].includes(role);

    return (
        <div className="p-4 max-w-lg mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold dark:text-white">Бригады</h1>
                {canEdit && <button onClick={() => setTeamModalOpen(true)} className="bg-blue-600 text-white w-10 h-10 rounded-full font-bold text-xl shadow hover:bg-blue-700">+</button>}
            </div>

            <div className="space-y-3">
                {teams.length === 0 ? (
                    <p className="text-gray-500 text-center">Нет активных бригад</p>
                ) : teams.map(t => (
                    <div key={t.id} onClick={() => openManageModal(t.id)} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer active:scale-95 transition-transform flex justify-between items-center">
                        <span className="font-bold text-gray-800 dark:text-gray-100">{t.name}</span>
                        <span className="text-xl">⚙️</span>
                    </div>
                ))}
            </div>

            {isTeamModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
                        <h2 className="text-xl font-bold mb-4 dark:text-white">Новая бригада</h2>
                        <form onSubmit={handleCreateTeam}>
                            <input type="text" placeholder="Название бригады" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} required className="w-full px-4 py-3 mb-4 border dark:border-gray-600 rounded-xl outline-none dark:bg-gray-700 dark:text-white"/>
                            <div className="flex space-x-3">
                                <button type="button" onClick={() => setTeamModalOpen(false)} className="w-1/2 py-3 bg-gray-200 dark:bg-gray-700 rounded-xl font-bold">Отмена</button>
                                <button type="submit" className="w-1/2 py-3 bg-blue-600 text-white rounded-xl font-bold">Создать</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isManageModalOpen && manageTeamData && (
                <div className="fixed inset-0 z-[100] bg-black/50 flex justify-center items-start pt-10 px-4 overflow-y-auto pb-20">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
                        <button onClick={() => setManageModalOpen(false)} className="absolute top-4 right-4 text-gray-500 text-2xl leading-none">&times;</button>
                        <h2 className="text-2xl font-bold mb-1 pr-6 dark:text-white">{manageTeamData.name}</h2>

                        <div className="mt-4 space-y-2">
                            {manageTeamData.members.length === 0 ? <p className="text-sm text-gray-500">Нет участников</p> :
                            manageTeamData.members.map(m => (
                                <div key={m.id} className={`flex items-center justify-between p-3 rounded-xl border ${m.is_foreman ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 dark:bg-gray-750'}`}>
                                    <div className="flex-1 min-w-0 pr-2">
                                        <p className="font-bold text-sm text-gray-900 dark:text-white truncate flex items-center">
                                            {m.fio} {m.is_linked ? <span className="ml-2 w-2 h-2 rounded-full bg-green-500" title="Аккаунт привязан"></span> : null}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{m.position} {m.is_foreman ? '(Прораб)' : ''}</p>
                                    </div>
                                    {canEdit && (
                                        <div className="flex items-center space-x-1 shrink-0">
                                            <button onClick={() => handleToggleForeman(m.id, m.is_foreman)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition ${m.is_foreman ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`} title="Сделать прорабом">👷</button>
                                            <button onClick={() => handleDeleteMember(m.id)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 text-sm">✖</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {canEdit && (
                            <form onSubmit={handleAddMember} className="mt-6 border-t dark:border-gray-700 pt-4">
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Добавить участника</h3>
                                <div className="space-y-3">
                                    <input type="text" placeholder="ФИО" value={newMember.fio} onChange={e => setNewMember({...newMember, fio: e.target.value})} required className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white outline-none"/>
                                    <input type="text" placeholder="Специальность (напр: Сварщик)" value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} required className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white outline-none"/>
                                    <button type="submit" className="w-full py-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold rounded-lg text-sm">Добавить в список</button>
                                </div>
                            </form>
                        )}

                        <div className="mt-6 pt-4 border-t dark:border-gray-700 space-y-3">
                            {canEdit && <button onClick={() => generateInviteLink(manageTeamData.id)} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition flex justify-center items-center">🔗 Пригласить в бригаду</button>}
                            {canEdit && <button onClick={() => handleDeleteTeam(manageTeamData.id)} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 font-bold rounded-xl hover:bg-red-100 transition">Удалить бригаду</button>}
                        </div>
                    </div>
                </div>
            )}

            {inviteInfo && (
                <div className="fixed inset-0 z-[200] bg-black/60 flex justify-center items-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="text-center mb-4">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-3xl">🔗</span></div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Приглашение</h2>
                            <p className="text-sm text-gray-500 mt-1">Пароль для вступления:</p>
                            <p className="text-4xl font-mono font-black text-blue-600 dark:text-blue-400 mt-2 tracking-widest">{inviteInfo.join_password}</p>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 text-center">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Telegram Бот</p>
                                <p className="text-sm text-gray-800 dark:text-gray-200 break-all">{inviteInfo.tg_bot_link}</p>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 text-center">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">MAX Бот</p>
                                <p className="text-sm text-gray-800 dark:text-gray-200 break-all">{inviteInfo.max_bot_link}</p>
                            </div>
                        </div>

                        {/* КНОПКА СКОПИРОВАТЬ СООБЩЕНИЕ */}
                        <button onClick={copyInviteMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 mb-3 flex justify-center items-center space-x-2">
                            <span>📄</span>
                            <span>Скопировать сообщение</span>
                        </button>

                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold py-3.5 rounded-xl transition-all">Закрыть</button>
                    </div>
                </div>
            )}
        </div>
    );
}
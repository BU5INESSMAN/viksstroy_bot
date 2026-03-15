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
        } catch (err) { alert("Ошибка"); } 
    };
    
    const openManageModal = async (teamId) => { try { const res = await axios.get(`/api/teams/${teamId}/details`); setManageTeamData(res.data); setManageModalOpen(true); } catch (err) { alert("Ошибка"); } };
    const handleGenerateInvite = async (teamId) => { try { const res = await axios.post(`/api/teams/${teamId}/generate_invite`); setInviteInfo(res.data); } catch (err) { alert("Ошибка!"); } };
    const handleAddMember = async (e) => { e.preventDefault(); try { const fd = new FormData(); fd.append('fio', newMember.fio); fd.append('position', newMember.position); fd.append('is_foreman', newMember.is_foreman ? 1 : 0); fd.append('tg_id', tgId); await axios.post(`/api/teams/${manageTeamData.id}/members/add`, fd); setNewMember({ fio: '', position: 'Рабочий', is_foreman: false }); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } };
    const handleToggleForeman = async (memberId, currentStatus) => { try { const fd = new FormData(); fd.append('is_foreman', currentStatus ? 0 : 1); fd.append('tg_id', tgId); await axios.post(`/api/teams/members/${memberId}/toggle_foreman`, fd); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } };
    const handleDeleteMember = async (memberId) => { if(!window.confirm('Удалить участника?')) return; try { const fd = new FormData(); fd.append('tg_id', tgId); await axios.post(`/api/teams/members/${memberId}/delete`, fd); const res = await axios.get(`/api/teams/${manageTeamData.id}/details`); setManageTeamData(res.data); fetchData(); } catch (err) { alert("Ошибка"); } };
    const copyToClipboard = (text, type) => { navigator.clipboard.writeText(text); setCopiedLink(type); setTimeout(() => setCopiedLink(''), 2000); };

    const handleDeleteEntireTeam = async () => {
        if (!window.confirm(`ВНИМАНИЕ! Вы уверены, что хотите полностью удалить бригаду «${manageTeamData.name}»? Это действие нельзя отменить.`)) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/${manageTeamData.id}/delete`, fd);
            alert("Бригада успешно удалена.");
            setManageModalOpen(false);
            fetchData();
        } catch (err) { alert("Ошибка при удалении бригады"); }
    };

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
              <h2 className="text-lg font-bold mb-4 flex items-center">👥 Управление бригадами</h2>
              {teams.length > 0 ? (
                  <ul className="space-y-3">
                  {teams.map(t => (
                      <li key={t.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors">
                          <span className="font-medium text-gray-800 dark:text-gray-200">🏗 {t.name}</span>
                          <div className="flex space-x-2 w-full sm:w-auto mt-2 sm:mt-0">
                              <button onClick={() => handleGenerateInvite(t.id)} className="flex-1 sm:flex-none text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded hover:bg-green-200 dark:hover:bg-green-900/60 text-sm font-medium transition">🔗 Ссылка</button>
                              <button onClick={() => openManageModal(t.id)} className="flex-1 sm:flex-none text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 text-sm font-medium transition">Управлять</button>
                          </div>
                      </li>
                  ))}
                  </ul>
              ) : (<p className="text-gray-500 dark:text-gray-400 text-sm">Список пуст.</p>)}
              <button onClick={() => setTeamModalOpen(true)} className="mt-5 w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 font-medium transition-colors">+ Создать новую бригаду</button>
            </div>

            {/* ОКНО СОЗДАНИЯ НОВОЙ БРИГАДЫ */}
            {isTeamModalOpen && (
                <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-2xl w-full max-w-sm relative transition-colors">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold dark:text-white">Новая бригада</h3>
                            <button onClick={() => setTeamModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl leading-none transition">&times;</button>
                        </div>
                        <form onSubmit={handleCreateTeam}>
                            <input type="text" required value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Название бригады" className="w-full px-4 py-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl mb-4 outline-none dark:text-white focus:ring-2 focus:ring-blue-500" />
                            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition">Создать</button>
                        </form>
                    </div>
                </div>
            )}

            {isManageModalOpen && manageTeamData && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm">
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-lg relative transition-colors">
                            
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold dark:text-white">Бригада «{manageTeamData?.name}»</h3>
                                <div className="flex items-center space-x-3">
                                    {['moderator', 'boss', 'superadmin'].includes(role) && (
                                        <button onClick={handleDeleteEntireTeam} className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-xs font-bold transition border border-red-200 dark:border-red-800">🗑 Удалить бригаду</button>
                                    )}
                                    <button onClick={() => setManageModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl leading-none transition">&times;</button>
                                </div>
                            </div>
                            
                            <div className="mb-6"><h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3">Состав ({manageTeamData?.members?.length || 0} чел.)</h4><div className="max-h-64 overflow-y-auto space-y-2 border dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900/50">{manageTeamData?.members?.map(m => (<div key={m.id} className={`flex justify-between items-center p-3 rounded-lg border shadow-sm text-sm transition-colors ${m.is_foreman ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700/50' : 'bg-white dark:bg-gray-700 dark:border-gray-600'}`}><div><p className="font-bold text-gray-800 dark:text-gray-200">{m.fio}{m.is_foreman && <span className="ml-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 text-[10px] uppercase font-extrabold px-2 py-0.5 rounded shadow-sm">⭐️ Бригадир</span>}</p><p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1.5">{m.position} {m.is_linked ? <span className="text-green-600 font-bold ml-1">✓ Привязан</span> : ''}</p></div><div className="flex flex-col space-y-1"><button onClick={() => handleToggleForeman(m.id, m.is_foreman)} className={`font-bold px-2 py-1 rounded-md text-xs transition ${m.is_foreman ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300' : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200'}`}>{m.is_foreman ? 'Снять статус' : '⭐️ Назначить'}</button><button onClick={() => handleDeleteMember(m.id)} className="text-red-500 dark:text-red-400 font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 transition">Удалить</button></div></div>))}</div></div><form onSubmit={handleAddMember} className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800"><h4 className="font-bold text-blue-800 dark:text-blue-400 mb-3 text-sm uppercase tracking-wide">Добавить участника</h4><div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-3"><input type="text" required value={newMember.fio} onChange={e => setNewMember({...newMember, fio: e.target.value})} placeholder="ФИО" className="w-full sm:w-2/3 px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-sm outline-none shadow-sm" /><input type="text" required value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} placeholder="Должность" className="w-full sm:w-1/3 px-3 py-2 border dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-sm outline-none shadow-sm" /></div><div className="flex items-center mb-4"><input type="checkbox" id="is_foreman_cb" checked={newMember.is_foreman} onChange={e => setNewMember({...newMember, is_foreman: e.target.checked})} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" /><label htmlFor="is_foreman_cb" className="ml-2 text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer">⭐️ Назначить бригадиром</label></div><button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md">Добавить в состав</button></form></div></div></div>
            )}
            
            {inviteInfo && (
                <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-2xl w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4 text-center dark:text-white">Приглашение</h3>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">🤖 Бот (Для Telegram):</label>
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
                        </div>
                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 dark:bg-gray-700 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-gray-900 transition">Готово</button>
                    </div>
                </div>
            )}
        </main>
    );
}

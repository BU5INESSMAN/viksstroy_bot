import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import TeamCard from '../features/teams/components/TeamCard';
import CreateTeamModal from '../features/teams/components/CreateTeamModal';
import ManageTeamModal from '../features/teams/components/ManageTeamModal';
import TeamInviteModal from '../features/teams/components/TeamInviteModal';

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
        } catch (err) { toast.error("Ошибка создания бригады"); }
    };

    const handleDeleteTeam = async (id) => {
        if (!window.confirm("Удалить бригаду и отвязать всех участников?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post(`/api/teams/${id}/delete`, fd);
            fetchData();
        } catch(e) { toast.error("Ошибка удаления"); }
    };

    const openManageModal = async (teamId) => {
        try {
            const res = await axios.get(`/api/teams/${teamId}/details`);
            setManageTeamData(res.data);
            setManageModalOpen(true);
        } catch (e) { toast.error("Ошибка загрузки бригады"); }
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
        } catch (e) { toast.error("Ошибка добавления участника"); }
    };

    const toggleForeman = async (memberId, is_foreman) => {
        try {
            const fd = new FormData();
            fd.append('is_foreman', is_foreman);
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/toggle_foreman`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { toast.error("Ошибка обновления роли"); }
    };

    const handleUnlinkMember = async (memberId) => {
        if (!window.confirm("Отвязать Telegram/MAX аккаунт от этого рабочего?")) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/unlink`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { toast.error("Ошибка при отвязке аккаунта"); }
    };

    const deleteMember = async (memberId) => {
        if (!window.confirm("Удалить участника из бригады?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post(`/api/teams/members/${memberId}/delete`, fd);
            openManageModal(manageTeamData.id);
        } catch (e) { toast.error("Ошибка удаления участника"); }
    };

    const generateInvite = async () => {
        try {
            const res = await axios.post(`/api/teams/${manageTeamData.id}/generate_invite`);
            setInviteInfo(res.data);
            setCopiedLink('');
        } catch (e) { toast.error("Ошибка генерации ссылки"); }
    };

    const canManage = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canDeleteTeam = ['moderator', 'boss', 'superadmin'].includes(role);

    return (
        <div className="space-y-6">

            {/* Кнопка создания теперь выровнена по правому краю */}
            {canManage && (
                <div className="flex justify-end mb-2">
                    <button onClick={() => setTeamModalOpen(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Создать бригаду
                    </button>
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
                {teams.map(t => (
                    <TeamCard key={t.id} t={t} canDeleteTeam={canDeleteTeam} openManageModal={openManageModal} handleDeleteTeam={handleDeleteTeam} />
                ))}
                {teams.length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-400 italic">Бригад пока нет.</div>
                )}
            </div>

            {/* МОДАЛКИ ОСТАЮТСЯ БЕЗ ИЗМЕНЕНИЙ */}
            <CreateTeamModal isTeamModalOpen={isTeamModalOpen} setTeamModalOpen={setTeamModalOpen} newTeamName={newTeamName} setNewTeamName={setNewTeamName} handleCreateTeam={handleCreateTeam} />

            <ManageTeamModal isManageModalOpen={isManageModalOpen} setManageModalOpen={setManageModalOpen} manageTeamData={manageTeamData} canManage={canManage} generateInvite={generateInvite} newMember={newMember} setNewMember={setNewMember} handleAddMember={handleAddMember} toggleForeman={toggleForeman} handleUnlinkMember={handleUnlinkMember} deleteMember={deleteMember} openProfile={openProfile} />

            <TeamInviteModal inviteInfo={inviteInfo} setInviteInfo={setInviteInfo} copiedLink={copiedLink} setCopiedLink={setCopiedLink} />
        </div>
    );
}

import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { ClipboardList, Clock, CheckCircle, HardHat, Flag } from 'lucide-react';
import { getSmartDates, getTodayStr } from '../utils/dateUtils';
import KanbanCol from '../features/applications/components/KanbanCol';
import ActiveApplicationsCard from '../features/applications/components/ActiveApplicationsCard';
import MyTeamCard from '../features/applications/components/MyTeamCard';
import CreateAppModal from '../features/applications/components/CreateAppModal';
import ConfirmFreeModal from '../features/applications/components/ConfirmFreeModal';

export default function Home() {
    const smartDates = getSmartDates();
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const { isGlobalCreateAppOpen, setGlobalCreateAppOpen, openProfile } = useOutletContext();

    const [data, setData] = useState({ stats: {}, teams: [], equipment: [], equip_categories: [], kanban_apps: [], recent_addresses: [] });
    const [activeApps, setActiveApps] = useState([]);
    const [objectsList, setObjectsList] = useState([]);
    const [myTeam, setMyTeam] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);
    const [activeEqCategory, setActiveEqCategory] = useState(null);

    const [appForm, setAppForm] = useState({
        id: null, date_target: smartDates[1].value, object_id: '',
        foreman_id: role === 'foreman' ? Number(tgId) : '',
        workers: [], equipment: [], status: 'waiting', plan_text: '', isViewOnly: false, isKanbanView: false
    });

    const [freeModal, setFreeModal] = useState({ isOpen: false, type: '', app: null, teamId: null, inputValue: '' });

    const [kanbanStates, setKanbanStates] = useState({ waiting: true, approved: true, published: true, completed: false });

    const toggleKanbanCol = (col) => setKanbanStates(prev => ({ ...prev, [col]: !prev[col] }));

    const fetchData = async () => {
        setLoading(true);
        try {
            const [dashRes, objRes] = await Promise.all([
                axios.get(`/api/dashboard?tg_id=${tgId}`),
                axios.get('/api/objects')
            ]);
            setData(dashRes.data);
            setObjectsList(objRes.data.filter(o => o.is_archived === 0));

            if (['worker', 'foreman', 'brigadier'].includes(role)) {
                const teamRes = await axios.get(`/api/teams/my?tg_id=${tgId}`);
                if (teamRes.data) setMyTeam(teamRes.data);
            }

            const today = getTodayStr();
            const active = dashRes.data.kanban_apps.filter(a => a.status === 'published' && a.date_target === today);

            if (role === 'foreman' || role === 'brigadier') {
                setActiveApps(active.filter(a => a.foreman_id === Number(tgId)));
            } else if (role === 'worker') {
                setActiveApps(active.filter(a => {
                    if (!a.workers) return false;
                    const wList = String(a.workers).split(',').map(Number);
                    if (myTeam) {
                        const myMemberId = myTeam.members.find(m => m.tg_user_id === Number(tgId))?.id;
                        return wList.includes(myMemberId);
                    }
                    return false;
                }));
            } else if (role === 'driver') {
                setActiveApps(active.filter(a => {
                    if (!a.equipment_data) return false;
                    try {
                        const eqList = JSON.parse(a.equipment_data);
                        return eqList.some(eq => Number(eq.driver_tg_id) === Number(tgId) && !eq.is_freed);
                    } catch (e) { return false; }
                }));
            } else {
                setActiveApps(active);
            }
        } catch (error) {
            console.error("Ошибка при загрузке данных:", error);
        }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [tgId, role]);

    useEffect(() => {
        if (!isGlobalCreateAppOpen) {
            setAppForm({
                id: null, date_target: smartDates[1].value, object_id: '',
                foreman_id: role === 'foreman' ? Number(tgId) : '',
                workers: [], equipment: [], status: 'waiting', plan_text: '', isViewOnly: false, isKanbanView: false
            });
            setTeamMembers([]);
            setActiveEqCategory(null);
        } else {
            if (!appForm.id && appForm.object_id) loadTeamForObject(appForm.object_id);
        }
    }, [isGlobalCreateAppOpen]);

    const loadTeamForObject = async (objId) => {
        if (!objId) { setTeamMembers([]); return; }
        try {
            const res = await axios.get(`/api/applications/team-for-object/${objId}`);
            setTeamMembers(res.data);
        } catch (error) { console.error(error); }
    };

    const handleFormChange = (field, value) => {
        setAppForm(prev => ({ ...prev, [field]: value }));
        if (field === 'object_id') loadTeamForObject(value);
    };

    const toggleAppMember = (memberId) => {
        setAppForm(prev => ({
            ...prev,
            workers: prev.workers.includes(memberId) ? prev.workers.filter(id => id !== memberId) : [...prev.workers, memberId]
        }));
    };

    const toggleEquipmentSelection = (eqId) => {
        setAppForm(prev => {
            const exists = prev.equipment.find(e => e.id === eqId);
            if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== eqId) };
            const eqItem = data.equipment.find(e => e.id === eqId);
            return { ...prev, equipment: [...prev, { id: eqId, name: eqItem.name, time: '08:00', is_freed: false }] };
        });
    };

    const updateEquipmentTime = (eqId, time) => {
        setAppForm(prev => ({
            ...prev,
            equipment: prev.equipment.map(e => e.id === eqId ? { ...e, time } : e)
        }));
    };

    const toggleTeamSelection = (teamId) => {
        const team = data.teams.find(t => t.id === teamId);
        if (!team) return;
        const memberIds = team.members.map(m => m.id);
        setAppForm(prev => {
            const allSelected = memberIds.every(id => prev.workers.includes(id));
            if (allSelected) return { ...prev, workers: prev.workers.filter(id => !memberIds.includes(id)) };
            const newWorkers = new Set([...prev.workers, ...memberIds]);
            return { ...prev, workers: Array.from(newWorkers) };
        });
    };

    const checkTeamStatus = (teamId) => {
        const team = data.teams.find(t => t.id === teamId);
        if (!team || team.members.length === 0) return false;
        const memberIds = team.members.map(m => m.id);
        const selectedCount = memberIds.filter(id => appForm.workers.includes(id)).length;
        if (selectedCount === 0) return 'none';
        if (selectedCount === memberIds.length) return 'all';
        return 'partial';
    };

    const checkEquipStatus = (cat) => {
        const catEqs = data.equipment.filter(e => e.category === cat).map(e => e.id);
        if (catEqs.length === 0) return false;
        const selectedCount = appForm.equipment.filter(e => catEqs.includes(e.id)).length;
        if (selectedCount === 0) return 'none';
        if (selectedCount === catEqs.length) return 'all';
        return 'partial';
    };

    const handleApplyDefaults = (type) => {
        const obj = objectsList.find(o => o.id === Number(appForm.object_id));
        if (!obj) return;
        if (type === 'teams' && obj.default_team_ids) {
            const tIds = String(obj.default_team_ids).split(',').map(Number);
            let toAdd = [];
            tIds.forEach(tid => {
                const team = data.teams.find(t => t.id === tid);
                if (team) toAdd.push(...team.members.map(m => m.id));
            });
            setAppForm(prev => ({ ...prev, workers: Array.from(new Set([...prev.workers, ...toAdd])) }));
        }
        if (type === 'equipment' && obj.default_equip_ids) {
            const eIds = String(obj.default_equip_ids).split(',').map(Number);
            let newEq = [...appForm.equipment];
            eIds.forEach(eid => {
                if (!newEq.find(e => e.id === eid)) {
                    const eqItem = data.equipment.find(e => e.id === eid);
                    if (eqItem) newEq.push({ id: eid, name: eqItem.name, time: '08:00', is_freed: false });
                }
            });
            setAppForm(prev => ({ ...prev, equipment: newEq }));
        }
    };

    const handleCreateApp = async (e) => {
        e.preventDefault();
        if (!appForm.date_target || !appForm.object_id || !appForm.foreman_id) {
            alert("Заполните обязательные поля (Дата, Объект, Прораб)."); return;
        }
        if (appForm.workers.length === 0 && appForm.equipment.length === 0) {
            alert("Выберите хотя бы одного рабочего или единицу техники."); return;
        }
        setIsSubmitting(true);
        try {
            const payload = {
                date_target: appForm.date_target,
                object_id: appForm.object_id,
                foreman_id: appForm.foreman_id,
                workers: appForm.workers,
                equipment: appForm.equipment,
                plan_text: appForm.plan_text || '',
                tg_id: tgId
            };
            if (appForm.id) {
                await axios.put(`/api/applications/${appForm.id}`, payload);
            } else {
                await axios.post('/api/applications', payload);
            }
            setGlobalCreateAppOpen(false);
            fetchData();
        } catch (error) {
            alert(error.response?.data?.detail || "Ошибка при сохранении заявки.");
        }
        setIsSubmitting(false);
    };

    const handleDeleteApp = async (id) => {
        if (!window.confirm("Вы уверены, что хотите удалить эту заявку?")) return;
        setIsSubmitting(true);
        try {
            await axios.delete(`/api/applications/${id}?tg_id=${tgId}`);
            setGlobalCreateAppOpen(false);
            fetchData();
        } catch (error) { alert("Ошибка удаления"); }
        setIsSubmitting(false);
    };

    const handleKanbanAppClick = (app) => {
        let parsedEquipment = [];
        if (app.equipment_data) {
            try {
                parsedEquipment = typeof app.equipment_data === 'string' ? JSON.parse(app.equipment_data) : app.equipment_data;
            } catch (e) {
                console.error("Ошибка парсинга техники", e);
            }
        }

        setAppForm({
            id: app.id,
            date_target: app.date_target,
            object_id: app.object_id,
            foreman_id: app.foreman_id,
            workers: app.workers ? String(app.workers).split(',').map(Number) : [],
            equipment: parsedEquipment,
            status: app.status,
            isViewOnly: true,
            isKanbanView: true,
            plan_text: app.plan_text || ''
        });
        setGlobalCreateAppOpen(true);
    };

    const openFreeModal = (type, app, teamId = null) => {
        setFreeModal({ isOpen: true, type, app, teamId, inputValue: '' });
    };

    const executeFree = async () => {
        if (freeModal.inputValue.trim().toLowerCase() !== 'свободен') {
            alert('Для подтверждения напишите слово "СВОБОДЕН"'); return;
        }
        setIsSubmitting(true);
        try {
            if (freeModal.type === 'equipment') {
                await axios.post(`/api/applications/${freeModal.app.id}/free-equipment`, { tg_id: tgId });
            } else if (freeModal.type === 'team') {
                await axios.post(`/api/applications/${freeModal.app.id}/free-team`, { tg_id: tgId, team_id: freeModal.teamId });
            } else if (freeModal.type === 'all_teams') {
                await axios.post(`/api/applications/${freeModal.app.id}/free-all-teams`, { tg_id: tgId });
            }
            setFreeModal({ isOpen: false, type: '', app: null, teamId: null, inputValue: '' });
            fetchData();
        } catch (error) { alert("Ошибка при освобождении."); }
        setIsSubmitting(false);
    };

    const kanbanData = {
        waiting: data.kanban_apps.filter(a => a.status === 'waiting'),
        approved: data.kanban_apps.filter(a => a.status === 'approved'),
        published: data.kanban_apps.filter(a => a.status === 'published'),
        completed: data.kanban_apps.filter(a => a.status === 'completed')
    };

    if (loading && !data.stats.total_users) return <div className="mt-32 text-center text-gray-400 font-bold animate-pulse">Загрузка...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">

            {/* АКТИВНЫЕ ЗАЯВКИ СЕГОДНЯ (ДЛЯ РАБОЧИХ/ПРОРАБОВ/ВОДИТЕЛЕЙ) */}
            {activeApps.length > 0 && (
                <ActiveApplicationsCard
                    activeApps={activeApps}
                    role={role}
                    tgId={tgId}
                    openProfile={openProfile}
                    openFreeModal={openFreeModal}
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

                {/* ЛЕВАЯ КОЛОНКА (КАНБАН) */}
                <div className="md:col-span-8 lg:col-span-9 space-y-6">
                    <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-white px-2">
                        <ClipboardList className="w-6 h-6 text-blue-500 mr-2" /> Доска нарядов
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                        <KanbanCol title="Ожидание" icon={Clock} colorClass="bg-gray-50 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300" apps={kanbanData.waiting} isOpen={kanbanStates.waiting} toggleOpen={() => toggleKanbanCol('waiting')} onAppClick={handleKanbanAppClick} />
                        <KanbanCol title="Одобрено" icon={CheckCircle} colorClass="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-500" apps={kanbanData.approved} isOpen={kanbanStates.approved} toggleOpen={() => toggleKanbanCol('approved')} onAppClick={handleKanbanAppClick} />
                        <KanbanCol title="В работе" icon={HardHat} colorClass="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400" apps={kanbanData.published} isOpen={kanbanStates.published} toggleOpen={() => toggleKanbanCol('published')} onAppClick={handleKanbanAppClick} />
                        <KanbanCol title="Завершено" icon={Flag} colorClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" apps={kanbanData.completed} isOpen={kanbanStates.completed} toggleOpen={() => toggleKanbanCol('completed')} onAppClick={handleKanbanAppClick} />
                    </div>
                </div>

                {/* ПРАВАЯ КОЛОНКА (МОЯ БРИГАДА) */}
                <div className="md:col-span-4 lg:col-span-3 space-y-6">
                    {['worker', 'foreman', 'brigadier'].includes(role) && myTeam ? (
                        <MyTeamCard myTeam={myTeam} />
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col items-center justify-center text-center h-48">
                            <Flag className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-bold">Вы не состоите в бригаде</p>
                        </div>
                    )}
                </div>
            </div>

            {freeModal.isOpen && (
                <ConfirmFreeModal
                    freeModal={freeModal}
                    setFreeModal={setFreeModal}
                    isSubmitting={isSubmitting}
                    executeFree={executeFree}
                />
            )}

            {isGlobalCreateAppOpen && (
                <CreateAppModal
                    appForm={appForm}
                    setAppForm={setAppForm}
                    isSubmitting={isSubmitting}
                    setGlobalCreateAppOpen={setGlobalCreateAppOpen}
                    handleCreateApp={handleCreateApp}
                    handleDeleteApp={handleDeleteApp}
                    handleFormChange={handleFormChange}
                    handleApplyDefaults={handleApplyDefaults}
                    smartDates={smartDates}
                    objectsList={objectsList}
                    data={data}
                    role={role}
                    toggleTeamSelection={toggleTeamSelection}
                    toggleAppMember={toggleAppMember}
                    checkTeamStatus={checkTeamStatus}
                    checkEquipStatus={checkEquipStatus}
                    toggleEquipmentSelection={toggleEquipmentSelection}
                    updateEquipmentTime={updateEquipmentTime}
                    activeEqCategory={activeEqCategory}
                    setActiveEqCategory={setActiveEqCategory}
                    teamMembers={teamMembers}
                    openProfile={openProfile}
                    openFreeModal={openFreeModal}
                />
            )}
        </main>
    );
}
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ClipboardList, Clock, CheckCircle, HardHat, Flag, Archive, AlertTriangle, Send } from 'lucide-react';
import { getSmartDates, getTodayStr } from '../utils/dateUtils';
import KanbanCol from '../features/applications/components/KanbanCol';
import ActiveApplicationsCard from '../features/applications/components/ActiveApplicationsCard';
import MyTeamCard from '../features/applications/components/MyTeamCard';
import CreateAppModal from '../features/applications/components/CreateAppModal';
import EditAppModal from '../features/applications/components/EditAppModal';
import ConfirmFreeModal from '../features/applications/components/ConfirmFreeModal';
import ViewAppModal from '../features/applications/components/ViewAppModal';
import ArchiveModal from '../features/applications/components/ArchiveModal';
import useConfirm from '../hooks/useConfirm';

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
    const [isArchiveOpen, setArchiveOpen] = useState(false);
    const [debtors, setDebtors] = useState([]);

    const { confirm, ConfirmUI } = useConfirm();

    const [appForm, setAppForm] = useState({
        id: null, status: '', date_target: smartDates[1].val, object_id: '', object_address: '', team_ids: [], team_name: '', members: [], members_data: [], equipment: [], comment: '', isViewOnly: false, foreman_id: null, foreman_name: '', is_team_freed: 0, freed_team_ids: []
    });

    const [openKanban, setOpenKanban] = useState({ waiting: true, approved: false, in_progress: false, completed: false });
    const [freeModal, setFreeModal] = useState({ isOpen: false, type: '', app: null, teamId: null, inputValue: '' });
    const [viewApp, setViewApp] = useState(null);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editApp, setEditApp] = useState(null);

    const fetchData = () => {
        axios.get(`/api/dashboard?tg_id=${tgId}`).then(res => setData(res.data)).catch(() => {});
        axios.get(`/api/applications/active?tg_id=${tgId}`).then(res => { setActiveApps(res.data || []); setLoading(false); }).catch(() => { setActiveApps([]); setLoading(false); });
        if (['moderator', 'boss', 'superadmin'].includes(role)) {
            axios.get(`/api/system/debtors?tg_id=${tgId}`).then(res => setDebtors(res.data || [])).catch(() => {});
        }

        if (['worker', 'foreman', 'boss', 'superadmin'].includes(role)) {
            axios.get(`/api/users/${tgId}/profile`).then(res => {
                if (res.data?.profile?.team_id) {
                    axios.get(`/api/teams/${res.data.profile.team_id}/details`).then(tRes => setMyTeam(tRes.data));
                }
            }).catch(()=>{});
        }
    };

    useEffect(() => { fetchData(); }, [tgId, role]);

    useEffect(() => {
        if (isGlobalCreateAppOpen) {
            axios.get(`/api/objects/active?tg_id=${tgId}`).then(res => setObjectsList(res.data)).catch(()=>{});
            setAppForm({ id: null, status: '', date_target: smartDates[1].val, object_id: '', object_address: '', team_ids: [], team_name: '', members: [], members_data: [], equipment: [], comment: '', isViewOnly: false, foreman_id: null, foreman_name: '', is_team_freed: 0, freed_team_ids: [] });
            setActiveEqCategory(null);
            setTeamMembers([]);
            setIsSubmitting(false);
        }
    }, [isGlobalCreateAppOpen]);

    useEffect(() => {
        if (appForm.team_ids && appForm.team_ids.length > 0) {
            Promise.all(appForm.team_ids.map(id => axios.get(`/api/teams/${id}/details`)))
                .then(responses => {
                    const allMembers = responses.flatMap(res => res.data?.members || []);
                    const uniqueMembers = Array.from(new Map(allMembers.map(m => [m.id, m])).values());
                    setTeamMembers(uniqueMembers);
                    if(!appForm.isViewOnly && !appForm.id) {
                        setAppForm(prev => ({ ...prev, members: uniqueMembers.map(m => m.id) }));
                    }
                }).catch(() => setTeamMembers([]));
        } else {
            setTeamMembers([]);
        }
    }, [appForm.team_ids.join(',')]);

    const handleFormChange = (field, value) => { if(!appForm.isViewOnly) setAppForm(prev => ({ ...prev, [field]: value })); };

    const handleApplyDefaults = async (type) => {
        const selectedObj = objectsList.find(o => o.id === parseInt(appForm.object_id));
        if (!selectedObj) return;

        const targetTeams = type === 'teams' ? selectedObj.default_team_ids : "";
        const targetEquips = type === 'equip' ? selectedObj.default_equip_ids : "";

        if (!targetTeams && !targetEquips) {
            toast.error("Для этого объекта не назначены ресурсы по умолчанию.");
            return;
        }

        try {
            const fd = new FormData();
            fd.append('date_target', appForm.date_target);
            fd.append('object_id', selectedObj.id);
            fd.append('team_ids', type === 'teams' ? targetTeams : appForm.team_ids.join(','));

            const equipDataForCheck = type === 'equip'
                ? JSON.stringify(targetEquips.split(',').map(id => ({id: parseInt(id)})))
                : JSON.stringify(appForm.equipment);
            fd.append('equip_data', equipDataForCheck);

            const res = await axios.post('/api/applications/check_availability', fd);

            if (res.data.status === 'occupied') {
                toast.error(`Ошибка занятости: ${res.data.message}`);
            } else {
                if (type === 'teams') {
                    const ids = targetTeams.split(',').map(Number);
                    setAppForm(prev => ({...prev, team_ids: ids}));
                }
                if (type === 'equip') {
                    const ids = targetEquips.split(',').map(Number);
                    const newEq = data.equipment.filter(e => ids.includes(e.id)).map(e => ({ id: e.id, name: e.driver ? `${e.name} (${e.driver})` : e.name, time_start: '08', time_end: '17' }));
                    setAppForm(prev => ({...prev, equipment: newEq}));
                }
                toast.success("Ресурсы успешно подставлены!");
            }
        } catch (e) {
            toast.error("Ошибка связи с сервером при проверке занятости.");
        }
    };

    const toggleTeamSelection = (id) => {
        if(appForm.isViewOnly) return;
        setAppForm(prev => {
            const newIds = prev.team_ids.includes(id) ? prev.team_ids.filter(x => x !== id) : [...prev.team_ids, id];
            return { ...prev, team_ids: newIds };
        });
    };

    const toggleAppMember = (id) => { if(!appForm.isViewOnly) setAppForm(prev => ({ ...prev, members: prev.members?.includes(id) ? prev.members.filter(m => m !== id) : [...(prev.members || []), id] })); };

    const checkTeamStatus = (team_id) => {
        if (data.kanban_apps) {
            const appsOnDate = data.kanban_apps.filter(a => a.date_target === appForm.date_target && !['rejected', 'cancelled', 'completed'].includes(a.status));
            for (const a of appsOnDate) {
                const tIds = a.team_id ? String(a.team_id).split(',').map(Number) : [];
                if (tIds.includes(team_id) && appForm.id !== a.id) return { state: 'busy', message: `Эта бригада уже занята в этот день на объекте:\n📍 ${a.object_address}` };
            }
        }
        return { state: 'free' };
    };

    const checkEquipStatus = (equip) => {
        if (equip.status === 'repair') return { state: 'repair', message: 'Техника в ремонте.' };
        if (data.kanban_apps) {
            const appsOnDate = data.kanban_apps.filter(a => a.date_target === appForm.date_target && !['rejected', 'cancelled', 'completed'].includes(a.status));
            for (const a of appsOnDate) {
                try {
                    const eqList = JSON.parse(a.equipment_data || '[]');
                    if (eqList.some(eqq => eqq.id === equip.id) && appForm.id !== a.id) return { state: 'busy', message: `Занята на объекте:\n📍 ${a.object_address}` };
                } catch(e) {}
            }
        }
        return { state: 'free' };
    };

    const toggleEquipmentSelection = (equip) => {
        if(appForm.isViewOnly) return;
        setAppForm(prev => {
            const exists = prev.equipment.find(e => e.id === equip.id);
            if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== equip.id) };
            const displayName = equip.driver ? `${equip.name} (${equip.driver})` : equip.name;
            return { ...prev, equipment: [...prev.equipment, { id: equip.id, name: displayName, time_start: '08', time_end: '17' }] };
        });
    };
    const updateEquipmentTime = (id, field, value) => { if(!appForm.isViewOnly) setAppForm(prev => ({ ...prev, equipment: prev.equipment.map(e => e.id === id ? { ...e, [field]: value } : e) })); };

    const handleObjectSelect = async (objectId) => {
        const selObj = objectsList.find(o => o.id === parseInt(objectId));
        setAppForm(prev => ({...prev, object_id: objectId, object_address: selObj ? `${selObj.name} (${selObj.address})` : ''}));
        // Update last used objects
        if (objectId) {
            try {
                const fd = new FormData();
                fd.append('object_id', objectId);
                await axios.post(`/api/users/${tgId}/last_objects`, fd);
            } catch(e) {}
        }
    };

    const handleCreateApp = async (e) => {
        e.preventDefault();
        if(appForm.isViewOnly) { setGlobalCreateAppOpen(false); return; }
        if (!appForm.object_id) return toast.error("Выберите объект!");
        if (appForm.team_ids.length === 0 && appForm.equipment.length === 0) return toast.error("Выберите бригаду или технику!");
        if (appForm.team_ids.length === 0) {
            const ok = await confirm("Создать заявку ТОЛЬКО на технику (без людей)?", { title: "Подтверждение", variant: "warning", confirmText: "Да, создать" });
            if (!ok) return;
        }
        if (appForm.team_ids.length > 0 && appForm.members.length === 0) return toast.error("Выберите хотя бы одного рабочего из бригады!");

        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('date_target', appForm.date_target);
            fd.append('object_id', appForm.object_id);
            fd.append('object_address', appForm.object_address);
            fd.append('team_id', appForm.team_ids.join(',') || '0');
            fd.append('comment', appForm.comment);
            fd.append('selected_members', appForm.members.join(','));
            fd.append('equipment_data', JSON.stringify(appForm.equipment));

            if (appForm.id) {
                await axios.post(`/api/applications/${appForm.id}/update`, fd);
                toast.success("Заявка успешно обновлена!");
            } else {
                await axios.post('/api/applications/create', fd);
                toast.success("Успешно отправлено на модерацию!");
            }
            setGlobalCreateAppOpen(false); fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка сохранения");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteApp = async () => {
        const ok = await confirm("ВНИМАНИЕ! Вы уверены, что хотите полностью УДАЛИТЬ эту заявку из системы? Это действие необратимо!", { title: "Удаление заявки", variant: "danger", confirmText: "Удалить" });
        if (!ok) return;
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/applications/${appForm.id}/delete`, fd);
            toast.success("Заявка успешно удалена!");
            setGlobalCreateAppOpen(false);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка при удалении заявки.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleArchiveApp = async (appId) => {
        const ok = await confirm("Отправить эту заявку в архив?", { title: "Архивация", variant: "info", confirmText: "В архив" });
        if (!ok) return;
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/applications/${appId}/archive`, fd);
            toast.success("Заявка отправлена в архив");
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка архивации");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePublishTomorrow = async () => {
        const ok = await confirm("Опубликовать расстановку на завтра? Все заявки в статусе «На модерации» на завтра будут одобрены, уведомления отправлены.", { title: "Публикация на завтра", variant: "info", confirmText: "Опубликовать" });
        if (!ok) return;
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post('/api/system/publish_tomorrow', fd);
            toast.success("Расстановка на завтра опубликована!");
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка публикации");
        } finally {
            setIsSubmitting(false);
        }
    };

    const openAppModalFromKanban = (app) => {
        setViewApp(app);
    };

    const handleEditFromView = (app) => {
        setViewApp(null);
        setEditApp(app);
        axios.get(`/api/objects/active?tg_id=${tgId}`).then(res => setObjectsList(res.data)).catch(()=>{});
        setEditModalOpen(true);
    };

    const openFreeModal = (type, dataPayload) => {
        if (type === 'specific_team') {
            setFreeModal({ isOpen: true, type, app: dataPayload.app, teamId: dataPayload.teamId, inputValue: '' });
        } else {
            setFreeModal({ isOpen: true, type, app: dataPayload, teamId: null, inputValue: '' });
        }
    };

    const executeFree = async () => {
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            if (freeModal.type === 'equipment') {
                await axios.post(`/api/applications/${freeModal.app.id}/free_equipment`, fd);
                toast.success("Вы переведены в статус 'Свободен'.");
            } else if (freeModal.type === 'team') {
                await axios.post(`/api/applications/${freeModal.app.id}/free_team`, fd);
                toast.success("Все бригады переведены в статус 'Свободны'.");
            } else if (freeModal.type === 'specific_team') {
                fd.append('team_id', freeModal.teamId);
                await axios.post(`/api/applications/${freeModal.app.id}/free_team`, fd);
                toast.success("Выбранная бригада переведена в статус 'Свободна'.");
            }
            setFreeModal({ isOpen: false, type: '', app: null, teamId: null, inputValue: '' });
            fetchData();
            if (isGlobalCreateAppOpen) setGlobalCreateAppOpen(false);
        } catch(e) {
            toast.error(e.response?.data?.detail || "Ошибка при освобождении.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const todayYYYYMMDD = getTodayStr();
    const appsMap = { waiting: [], approved: [], in_progress: [], completed: [] };

    if (data.kanban_apps) {
        data.kanban_apps.forEach(a => {
            if (a.status === 'waiting') appsMap.waiting.push(a);
            else if (a.status === 'completed') appsMap.completed.push(a);
            else if (a.status === 'approved') appsMap.approved.push(a);
            else if (a.status === 'in_progress' || a.status === 'published') appsMap.in_progress.push(a);
        });
    }

    const todayApps = activeApps.filter(a => a.date_target <= todayYYYYMMDD);
    const upcomingApps = activeApps.filter(a => a.date_target > todayYYYYMMDD);

    const isWorkerOrDriver = ['worker', 'driver'].includes(role);
    const canArchive = ['moderator', 'boss', 'superadmin'].includes(role);

    if (loading) return (
        <div className="flex flex-col items-center justify-center mt-32 text-gray-400">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-medium animate-pulse">Загрузка данных...</p>
        </div>
    );

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pb-24">

            <div className="space-y-6">
                {['worker', 'driver', 'foreman'].includes(role) && (
                    <ActiveApplicationsCard
                        todayApps={todayApps}
                        upcomingApps={upcomingApps}
                        role={role}
                        tgId={tgId}
                        openProfile={openProfile}
                        openFreeModal={openFreeModal}
                    />
                )}

                {myTeam && <MyTeamCard myTeam={myTeam} />}
            </div>

            {/* Debtors Widget */}
            {!isWorkerOrDriver && debtors.length > 0 && (
                <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-red-800 dark:text-red-400 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Должники СМР
                    </h3>
                    <div className="space-y-2">
                        {debtors.map((d, i) => (
                            <div key={i} className="flex justify-between items-center text-sm bg-white/60 dark:bg-gray-800/40 rounded-xl px-3 py-2">
                                <span className="font-semibold text-red-700 dark:text-red-300">{d.foreman_name}</span>
                                <span className="text-red-500/80 dark:text-red-400/70 text-xs truncate ml-2 max-w-[50%] text-right">{d.object_address}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!isWorkerOrDriver && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center mt-4">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <ClipboardList className="text-blue-500 w-7 h-7" /> ЗАЯВКИ
                        </h2>
                        <div className="flex items-center gap-2">
                            {canArchive && (
                                <button onClick={handlePublishTomorrow} disabled={isSubmitting}
                                    className="flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-800 transition-all active:scale-95 shadow-sm disabled:opacity-50">
                                    <Send className="w-4 h-4" /> На завтра
                                </button>
                            )}
                            {canArchive && (
                                <button onClick={() => setArchiveOpen(true)} className="flex items-center gap-2 text-sm font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 px-4 py-2 rounded-xl border border-purple-200 dark:border-purple-800 transition-all active:scale-95 shadow-sm">
                                    <Archive className="w-4 h-4" /> Архив
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        <KanbanCol title="На модерации" icon={Clock} colorClass="bg-yellow-50/80 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/50" apps={appsMap.waiting} isOpen={openKanban.waiting} toggleOpen={() => setOpenKanban({...openKanban, waiting: !openKanban.waiting})} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="Одобрены" icon={CheckCircle} colorClass="bg-emerald-50/80 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50" apps={appsMap.approved} isOpen={openKanban.approved} toggleOpen={() => setOpenKanban({...openKanban, approved: !openKanban.approved})} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="В работе" icon={HardHat} colorClass="bg-blue-50/80 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-100 dark:border-blue-900/50" apps={appsMap.in_progress} isOpen={openKanban.in_progress} toggleOpen={() => setOpenKanban({...openKanban, in_progress: !openKanban.in_progress})} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="Завершены" icon={Flag} colorClass="bg-gray-100/80 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300 border-gray-200 dark:border-gray-700" apps={appsMap.completed} isOpen={openKanban.completed} toggleOpen={() => setOpenKanban({...openKanban, completed: !openKanban.completed})} onAppClick={openAppModalFromKanban} canArchive={canArchive} onArchive={handleArchiveApp} />
                    </div>
                </div>
            )}

            {freeModal.isOpen && (
                <ConfirmFreeModal
                    freeModal={freeModal}
                    setFreeModal={setFreeModal}
                    isSubmitting={isSubmitting}
                    executeFree={executeFree}
                />
            )}

            {viewApp && (
                <ViewAppModal
                    app={viewApp}
                    onClose={() => setViewApp(null)}
                    data={data}
                    onEdit={
                        (viewApp.status === 'waiting' && (
                            ['moderator', 'boss', 'superadmin'].includes(role) ||
                            (role === 'foreman' && String(viewApp.foreman_id) === String(tgId))
                        ))
                        ? handleEditFromView
                        : undefined
                    }
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
                    handleObjectSelect={handleObjectSelect}
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

            {isEditModalOpen && editApp && (
                <EditAppModal
                    app={editApp}
                    onClose={() => { setEditModalOpen(false); setEditApp(null); }}
                    onSaved={() => { setEditModalOpen(false); setEditApp(null); fetchData(); }}
                    data={data}
                    objectsList={objectsList}
                    smartDates={smartDates}
                    role={role}
                    tgId={tgId}
                    openProfile={openProfile}
                />
            )}

            <ArchiveModal isOpen={isArchiveOpen} onClose={() => setArchiveOpen(false)} />
            {ConfirmUI}
        </main>
    );
}

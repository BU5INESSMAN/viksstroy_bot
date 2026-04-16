import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardList, Clock, CheckCircle, HardHat, Flag, Archive, Send, Loader2 } from 'lucide-react';
import { getSmartDates, getTodayStr } from '../utils/dateUtils';
import KanbanCol from '../features/applications/components/KanbanCol';
import ActiveApplicationsCard from '../features/applications/components/ActiveApplicationsCard';
import MyTeamCard from '../features/applications/components/MyTeamCard';
import CreateAppModal from '../features/applications/components/CreateAppModal';
import DebtorsRestorePill from '../features/applications/components/DebtorsRestorePill';
import EditAppModal from '../features/applications/components/EditAppModal';
import ConfirmFreeModal from '../features/applications/components/ConfirmFreeModal';
import ViewAppModal from '../features/applications/components/ViewAppModal';
import ArchiveModal from '../features/applications/components/ArchiveModal';
import DebtorsWidget from '../features/applications/components/DebtorsWidget';
import CrossBrigadeWarningModal from '../features/applications/components/CrossBrigadeWarningModal';
import useAppForm from '../features/applications/hooks/useAppForm';
import useConfirm from '../hooks/useConfirm';
import { HomeSkeleton } from '../components/ui/PageSkeletons';

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
    const [debtors, setDebtors] = useState([]);
    const [publishingTomorrow, setPublishingTomorrow] = useState(false);
    const [isArchiveOpen, setArchiveOpen] = useState(false);
    // Server setting — persistent across devices, hides widget entirely
    const [hideDebtors, setHideDebtors] = useState(false);
    // Session dismissal — this tab only, restorable via pill
    const [debtorsHiddenSession, setDebtorsHiddenSession] = useState(() =>
        sessionStorage.getItem('debtors_widget_hidden') === 'true'
    );
    const hideDebtorsForSession = () => {
        sessionStorage.setItem('debtors_widget_hidden', 'true');
        setDebtorsHiddenSession(true);
    };
    const showDebtorsForSession = () => {
        sessionStorage.removeItem('debtors_widget_hidden');
        setDebtorsHiddenSession(false);
    };

    const [openKanban, setOpenKanban] = useState({ waiting: true, approved: false, in_progress: false, completed: false });
    const [freeModal, setFreeModal] = useState({ isOpen: false, type: '', app: null, teamId: null, inputValue: '' });
    const [viewApp, setViewApp] = useState(null);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editApp, setEditApp] = useState(null);

    const { confirm, ConfirmUI: PublishConfirmUI } = useConfirm();

    // Form state + all handlers are managed by the custom hook
    const {
        appForm, setAppForm,
        isSubmitting, setIsSubmitting,
        teamMembers, activeEqCategory, setActiveEqCategory,
        handleFormChange, handleObjectSelect, handleApplyDefaults,
        toggleTeamSelection, toggleAppMember,
        toggleEquipmentSelection, updateEquipmentTime,
        checkTeamStatus, checkEquipStatus,
        handleCreateApp, handleDeleteApp,
        crossBrigadeWarnings, showCrossBrigadeModal, setShowCrossBrigadeModal, confirmCrossBrigade,
        ConfirmUI: FormConfirmUI,
    } = useAppForm({
        tgId,
        data,
        objectsList,
        smartDates,
        setGlobalCreateAppOpen,
        fetchData,
        isGlobalCreateAppOpen,
    });

    function fetchData() {
        axios.get('/api/dashboard').then(res => setData(res.data)).catch(() => {});
        axios.get('/api/applications/active')
            .then(res => { setActiveApps(res.data || []); setLoading(false); })
            .catch(() => { setActiveApps([]); setLoading(false); });
        if (['moderator', 'boss', 'superadmin'].includes(role)) {
            axios.get('/api/system/debtors').then(res => setDebtors(res.data || [])).catch(() => {});
        }
        if (['worker', 'foreman', 'boss', 'superadmin'].includes(role)) {
            axios.get(`/api/users/${tgId}/profile`).then(res => {
                if (res.data?.profile?.team_id) {
                    axios.get(`/api/teams/${res.data.profile.team_id}/details`).then(tRes => setMyTeam(tRes.data));
                }
            }).catch(() => {});
        }
    }

    useEffect(() => { fetchData(); }, [tgId, role]);

    // User settings → hide_smr_debtors toggle
    useEffect(() => {
        axios.get('/api/users/me')
            .then((res) => setHideDebtors(!!res.data?.user?.settings?.hide_smr_debtors))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (isGlobalCreateAppOpen) {
            axios.get(`/api/objects/active?tg_id=${tgId}`).then(res => setObjectsList(res.data)).catch(() => {});
        }
    }, [isGlobalCreateAppOpen]);

    const publishTomorrow = async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        try {
            const warnRes = await axios.get(`/api/system/schedule_warnings?date=${tomorrowStr}`);
            const warnings = warnRes.data || [];
            if (warnings.length > 0) {
                const warningList = warnings.map(w => `  - ${w.object_address} (${w.foreman_name})`).join('\n');
                const ok = await confirm(
                    `На ${tomorrowStr} есть неодобренные заявки:\n${warningList}\n\nОтправить расстановку только по одобренным?`,
                    { title: 'Неодобренные заявки', variant: 'warning', confirmText: 'Да, отправить' }
                );
                if (!ok) return;
            } else {
                const ok = await confirm(`Отправить расстановку на ${tomorrowStr} в группу?`, {
                    title: 'Расстановка на завтра', variant: 'info', confirmText: 'Отправить',
                });
                if (!ok) return;
            }
        } catch {
            const ok = await confirm(`Отправить расстановку на ${tomorrowStr} в группу?`, {
                title: 'Расстановка на завтра', variant: 'info', confirmText: 'Отправить',
            });
            if (!ok) return;
        }

        setPublishingTomorrow(true);
        try {
            const t = new Date();
            t.setDate(t.getDate() + 1);
            const dateStr = t.toISOString().split('T')[0];
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('date', dateStr);
            await axios.post('/api/system/send_schedule_group', fd);
            toast.success('Расстановка на завтра отправляется...');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка отправки расстановки');
        } finally {
            setPublishingTomorrow(false);
        }
    };

    const handleArchiveApp = async (appId) => {
        const ok = await confirm('Отправить эту заявку в архив?', { title: 'Архивация', variant: 'info', confirmText: 'В архив' });
        if (!ok) return;
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/applications/${appId}/archive`, fd);
            toast.success('Заявка отправлена в архив');
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка архивации');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openAppModalFromKanban = (app) => setViewApp(app);

    const handleEditFromView = (app) => {
        setViewApp(null);
        setEditApp(app);
        axios.get(`/api/objects/active?tg_id=${tgId}`).then(res => setObjectsList(res.data)).catch(() => {});
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
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Ошибка при освобождении.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // -------------------------------------------------------------------------
    // Derived data
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    if (loading) return <HomeSkeleton />;

    return (
        <main className="px-4 sm:px-6 lg:px-8 space-y-8 pb-24">

            <div className="space-y-6" data-tour="active-apps-card">
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

            {!isWorkerOrDriver && !hideDebtors && debtors.length > 0 && (
                <div data-tour="debtors-widget">
                    <AnimatePresence mode="wait" initial={false}>
                        {debtorsHiddenSession ? (
                            <DebtorsRestorePill key="debtors-pill" onRestore={showDebtorsForSession} />
                        ) : (
                            <motion.div
                                key="debtors-widget"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                style={{ overflow: 'hidden' }}
                            >
                                <DebtorsWidget debtors={debtors} tgId={tgId} onHide={hideDebtorsForSession} />
                            </motion.div>
                        )}
                    </AnimatePresence>
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
                                <button
                                    onClick={publishTomorrow}
                                    disabled={publishingTomorrow}
                                    className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-3 py-2 sm:px-4 rounded-xl border border-blue-200 dark:border-blue-800 transition-all active:scale-95 shadow-sm disabled:opacity-50"
                                >
                                    {publishingTomorrow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} <span className="hidden sm:inline">На </span>завтра
                                </button>
                            )}
                            {canArchive && (
                                <button
                                    onClick={() => setArchiveOpen(true)}
                                    className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 px-3 py-2 sm:px-4 rounded-xl border border-purple-200 dark:border-purple-800 transition-all active:scale-95 shadow-sm"
                                >
                                    <Archive className="w-4 h-4" /> Архив
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" data-tour="kanban-board">
                        <KanbanCol title="На модерации" icon={Clock} colorClass="bg-yellow-50/80 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/50" apps={appsMap.waiting} isOpen={openKanban.waiting} toggleOpen={() => setOpenKanban({ ...openKanban, waiting: !openKanban.waiting })} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="Одобрены" icon={CheckCircle} colorClass="bg-emerald-50/80 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50" apps={appsMap.approved} isOpen={openKanban.approved} toggleOpen={() => setOpenKanban({ ...openKanban, approved: !openKanban.approved })} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="В работе" icon={HardHat} colorClass="bg-blue-50/80 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-100 dark:border-blue-900/50" apps={appsMap.in_progress} isOpen={openKanban.in_progress} toggleOpen={() => setOpenKanban({ ...openKanban, in_progress: !openKanban.in_progress })} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="Завершены" icon={Flag} colorClass="bg-gray-100/80 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300 border-gray-200 dark:border-gray-700" apps={appsMap.completed} isOpen={openKanban.completed} toggleOpen={() => setOpenKanban({ ...openKanban, completed: !openKanban.completed })} onAppClick={openAppModalFromKanban} canArchive={canArchive} onArchive={handleArchiveApp} />
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
                    onUpdate={() => { setViewApp(null); fetchData(); }}
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
                    tgId={tgId}
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

            <ArchiveModal isOpen={isArchiveOpen} onClose={() => setArchiveOpen(false)} onDataChanged={fetchData} />

            <CrossBrigadeWarningModal
                isOpen={showCrossBrigadeModal}
                onClose={() => setShowCrossBrigadeModal(false)}
                warnings={crossBrigadeWarnings}
                onConfirm={confirmCrossBrigade}
            />

            {/* Confirm dialog nodes from hook and page-level confirm */}
            {FormConfirmUI}
            {PublishConfirmUI}
        </main>
    );
}

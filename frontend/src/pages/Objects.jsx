import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    MapPin, Plus, Settings, Archive,
    Bell, BarChart3, FileText, Upload,
    MessageSquarePlus,
} from 'lucide-react';
import useConfirm from '../hooks/useConfirm';
import ObjectCreateModal from '../features/objects/components/ObjectCreateModal';
import ObjectEditModal from '../features/objects/components/ObjectEditModal';
import ObjectStatsModal from '../features/objects/components/ObjectStatsModal';
import ObjectRequestModal from '../features/objects/components/ObjectRequestModal';
import ObjectRequestsPanel from '../features/objects/components/ObjectRequestsPanel';

export default function Objects() {
    const role = localStorage.getItem('user_role') || 'Гость';
    const canManage = ['moderator', 'boss', 'superadmin', 'foreman'].includes(role);
    const canCreate = ['moderator', 'boss', 'superadmin'].includes(role);
    const canViewStats = ['moderator', 'boss', 'superadmin'].includes(role);
    const { confirm, ConfirmUI } = useConfirm();

    const [objects, setObjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);

    // Create modal
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);

    // Edit modal
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editObj, setEditObj] = useState(null);
    const [allTeams, setAllTeams] = useState([]);
    const [allEquips, setAllEquips] = useState([]);
    const [kpCatalog, setKpCatalog] = useState([]);
    const [objectKpPlan, setObjectKpPlan] = useState([]);
    const [targetVolumes, setTargetVolumes] = useState({});
    const [objectFiles, setObjectFiles] = useState([]);

    // Stats modal
    const [isStatsModalOpen, setStatsModalOpen] = useState(false);
    const [statsObj, setStatsObj] = useState(null);
    const [statsData, setStatsData] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);

    // Object requests
    const tgId = localStorage.getItem('tg_id') || '0';
    const isForeman = role === 'foreman';
    const isOffice = ['moderator', 'boss', 'superadmin'].includes(role);
    const [isRequestModalOpen, setRequestModalOpen] = useState(false);
    const [objectRequests, setObjectRequests] = useState([]);
    const [showRequests, setShowRequests] = useState(false);

    const fetchObjects = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/objects?archived=${showArchived ? 1 : 0}`);
            setObjects(res.data);
        } catch (e) {
            console.error('Ошибка загрузки объектов');
        }
        setLoading(false);
    };

    useEffect(() => { fetchObjects(); }, [showArchived]);

    useEffect(() => {
        if (isOffice) {
            axios.get('/api/object_requests?status=pending')
                .then(res => setObjectRequests(res.data || []))
                .catch(() => {});
        }
    }, []);

    // Request approval: open create modal with pre-filled data
    const [approveRequest, setApproveRequest] = useState(null);

    const handleApproveRequest = (req) => {
        setShowRequests(false);
        setApproveRequest(req);
    };

    const handleRejectRequest = async (reqId) => {
        try {
            await axios.post(`/api/object_requests/${reqId}/review`, {
                action: 'reject',
                tg_id: parseInt(tgId),
            });
            toast.success('Запрос отклонён');
            setObjectRequests(prev => prev.filter(r => r.id !== reqId));
        } catch (e) {
            toast.error('Ошибка обработки запроса');
        }
    };

    const handleRequestApproved = (reqId) => {
        setObjectRequests(prev => prev.filter(r => r.id !== reqId));
        setApproveRequest(null);
    };

    const handleUploadPdf = async (objId, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('tg_id', tgId);
        try {
            await axios.post(`/api/objects/${objId}/upload_pdf`, fd);
            toast.success('Смета загружена!');
            fetchObjects();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка загрузки');
        }
        e.target.value = '';
    };

    const handleArchiveToggle = async (objId, isCurrentlyArchived) => {
        const msg = isCurrentlyArchived
            ? 'Вернуть объект в работу?'
            : 'Отправить объект в архив? Он больше не будет доступен для новых заявок.';
        const ok = await confirm(msg, {
            title: isCurrentlyArchived ? 'Восстановление' : 'Архивация объекта',
            variant: isCurrentlyArchived ? 'info' : 'warning',
            confirmText: isCurrentlyArchived ? 'Восстановить' : 'В архив',
        });
        if (!ok) return;
        try {
            await axios.post(`/api/objects/${objId}/${isCurrentlyArchived ? 'restore' : 'archive'}`);
            fetchObjects();
        } catch (e) {
            toast.error('Ошибка смены статуса');
        }
    };

    const openEditModal = async (obj) => {
        setEditObj({
            ...obj,
            default_team_ids: obj.default_team_ids
                ? obj.default_team_ids.split(',').map(Number)
                : [],
            default_equip_ids: obj.default_equip_ids
                ? obj.default_equip_ids.split(',').map(Number)
                : [],
        });
        setEditModalOpen(true);

        try {
            const [dashRes, kpCatRes, objKpRes, filesRes] = await Promise.all([
                axios.get('/api/dashboard'),
                axios.get('/api/kp/catalog'),
                axios.get(`/api/objects/${obj.id}/kp`),
                axios.get(`/api/objects/${obj.id}/files`),
            ]);
            setAllTeams(dashRes.data.teams || []);
            setAllEquips(dashRes.data.equipment || []);
            setKpCatalog(kpCatRes.data || []);
            setObjectKpPlan(objKpRes.data.map(k => k.id) || []);
            const tvMap = {};
            objKpRes.data.forEach(k => { tvMap[k.id] = k.target_volume || 0; });
            setTargetVolumes(tvMap);
            setObjectFiles(filesRes.data || []);
        } catch (e) {}
    };

    const openStatsModal = async (obj) => {
        setStatsObj(obj);
        setStatsModalOpen(true);
        setStatsLoading(true);
        setStatsData(null);
        try {
            const res = await axios.get(`/api/objects/${obj.id}/stats`);
            setStatsData(res.data);
        } catch (e) {
            toast.error('Ошибка загрузки статистики');
        }
        setStatsLoading(false);
    };

    if (loading) {
        return (
            <div className="mt-32 text-center text-gray-400 font-bold animate-pulse">
                Загрузка объектов...
            </div>
        );
    }

    return (
        <main className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pt-6 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <MapPin className="w-7 h-7 text-blue-500 mr-2" /> Объекты
                </h2>
                <div className="flex gap-2 flex-wrap">
                    {canManage && (
                        <button
                            onClick={() => setShowArchived(!showArchived)}
                            className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2 ${showArchived ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                        >
                            <Archive className="w-4 h-4" /> {showArchived ? 'Активные' : 'Архив'}
                        </button>
                    )}
                    {isForeman && (
                        <button
                            onClick={() => setRequestModalOpen(true)}
                            className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95"
                        >
                            <MessageSquarePlus className="w-4 h-4" /> Запросить объект
                        </button>
                    )}
                    {isOffice && objectRequests.length > 0 && (
                        <button
                            onClick={() => setShowRequests(!showRequests)}
                            className="bg-amber-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-amber-600 transition-all flex items-center gap-2 active:scale-95"
                        >
                            <Bell className="w-4 h-4" /> Запросы ({objectRequests.length})
                        </button>
                    )}
                    {canCreate && (
                        <button
                            onClick={() => setCreateModalOpen(true)}
                            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Создать
                        </button>
                    )}
                </div>
            </div>

            {/* Objects grid */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {objects.map(obj => (
                    <div
                        key={obj.id}
                        className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-md transition-all"
                    >
                        <div className="mb-6">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-xl text-gray-800 dark:text-white leading-tight">
                                    {obj.name}
                                </h3>
                                {obj.is_archived === 1 && (
                                    <span className="bg-gray-100 text-gray-500 dark:bg-gray-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                                        Архив
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-start gap-1.5 mt-2">
                                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" /> {obj.address}
                            </p>
                        </div>

                        <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
                            {obj.pdf_file_path && (
                                <a
                                    href={obj.pdf_file_path}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-none px-4 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 py-2.5 rounded-xl font-bold transition-colors flex justify-center items-center"
                                    title="Смета PDF"
                                >
                                    <FileText className="w-4 h-4" />
                                </a>
                            )}
                            {isOffice && (
                                <label
                                    className="flex-none px-4 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-400 py-2.5 rounded-xl font-bold transition-colors flex justify-center items-center cursor-pointer"
                                    title="Загрузить смету"
                                >
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={e => handleUploadPdf(obj.id, e)}
                                    />
                                    <Upload className="w-4 h-4" />
                                </label>
                            )}
                            {canManage && (
                                <button
                                    onClick={() => openEditModal(obj)}
                                    className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 py-2.5 rounded-xl text-sm font-bold transition-colors flex justify-center items-center gap-1.5"
                                >
                                    <Settings className="w-4 h-4" /> Настройки
                                </button>
                            )}
                            {canViewStats && (
                                <button
                                    onClick={() => openStatsModal(obj)}
                                    className="flex-none px-4 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 py-2.5 rounded-xl font-bold transition-colors flex justify-center items-center"
                                    title="Статистика"
                                >
                                    <BarChart3 className="w-4 h-4" />
                                </button>
                            )}
                            {canManage && (
                                <button
                                    onClick={() => handleArchiveToggle(obj.id, obj.is_archived === 1)}
                                    className="flex-none px-4 bg-gray-50 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 py-2.5 rounded-xl font-bold transition-colors flex justify-center items-center"
                                >
                                    <Archive className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {objects.length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-400 italic">
                        Нет доступных объектов.
                    </div>
                )}
            </div>

            {/* CREATE MODAL */}
            {isCreateModalOpen && (
                <ObjectCreateModal
                    onClose={() => setCreateModalOpen(false)}
                    onCreated={fetchObjects}
                />
            )}

            {/* EDIT MODAL */}
            {isEditModalOpen && editObj && (
                <ObjectEditModal
                    editObj={editObj}
                    setEditObj={setEditObj}
                    onClose={() => setEditModalOpen(false)}
                    onSaved={fetchObjects}
                    allTeams={allTeams}
                    allEquips={allEquips}
                    kpCatalog={kpCatalog}
                    objectKpPlan={objectKpPlan}
                    setObjectKpPlan={setObjectKpPlan}
                    targetVolumes={targetVolumes}
                    setTargetVolumes={setTargetVolumes}
                    objectFiles={objectFiles}
                    setObjectFiles={setObjectFiles}
                    confirm={confirm}
                />
            )}

            {/* STATS MODAL */}
            {isStatsModalOpen && statsObj && (
                <ObjectStatsModal
                    statsObj={statsObj}
                    statsData={statsData}
                    statsLoading={statsLoading}
                    onClose={() => setStatsModalOpen(false)}
                />
            )}

            {/* REQUESTS PANEL (for moderators) */}
            {showRequests && objectRequests.length > 0 && (
                <ObjectRequestsPanel
                    objectRequests={objectRequests}
                    onApprove={handleApproveRequest}
                    onReject={handleRejectRequest}
                    onClose={() => setShowRequests(false)}
                />
            )}

            {/* APPROVAL CREATE MODAL (from request) */}
            {approveRequest && (
                <ObjectCreateModal
                    onClose={() => setApproveRequest(null)}
                    onCreated={fetchObjects}
                    requestData={approveRequest}
                    onRequestApproved={handleRequestApproved}
                />
            )}

            {/* REQUEST MODAL (foreman) */}
            {isRequestModalOpen && (
                <ObjectRequestModal
                    onClose={() => setRequestModalOpen(false)}
                    onSubmitted={() => setRequestModalOpen(false)}
                    tgId={tgId}
                />
            )}

            {ConfirmUI}
        </main>
    );
}

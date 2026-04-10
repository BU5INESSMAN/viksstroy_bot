import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    MapPin, Plus, Settings, Archive, CheckCircle,
    X, Search, Users, Truck, FileText, Check,
    Upload, Trash2, BarChart3, Calendar, ChevronDown, ChevronUp,
    FileUp, AlertCircle, Pencil, CheckCheck
} from 'lucide-react';
import useConfirm from '../hooks/useConfirm';

export default function Objects() {
    const role = localStorage.getItem('user_role') || 'Гость';
    const canManage = ['moderator', 'boss', 'superadmin', 'foreman'].includes(role);
    const canCreate = ['moderator', 'boss', 'superadmin'].includes(role);
    const { confirm, ConfirmUI } = useConfirm();
    const canViewStats = ['moderator', 'boss', 'superadmin'].includes(role);

    const [objects, setObjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);

    // Модалка создания
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [newObj, setNewObj] = useState({ name: '', address: '' });

    // PDF парсинг
    const [pdfParsing, setPdfParsing] = useState(false);
    const [pdfData, setPdfData] = useState(null); // { name, address, works, errors }
    const [pdfStep, setPdfStep] = useState('upload'); // 'upload' | 'verify'

    // Модалка редактирования
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editObj, setEditObj] = useState(null);
    const [activeTab, setActiveTab] = useState('info'); // info | resources | kp | files

    // Списки для модалки редактирования
    const [allTeams, setAllTeams] = useState([]);
    const [allEquips, setAllEquips] = useState([]);

    // Списки для КП
    const [kpCatalog, setKpCatalog] = useState([]);
    const [objectKpPlan, setObjectKpPlan] = useState([]);
    const [targetVolumes, setTargetVolumes] = useState({});
    const [kpSearch, setKpSearch] = useState('');

    // Файлы объекта
    const [objectFiles, setObjectFiles] = useState([]);
    const [uploading, setUploading] = useState(false);

    // Статистика
    const [isStatsModalOpen, setStatsModalOpen] = useState(false);
    const [statsObj, setStatsObj] = useState(null);
    const [statsData, setStatsData] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [expandedDates, setExpandedDates] = useState({});

    const fetchObjects = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/objects?archived=${showArchived ? 1 : 0}`);
            setObjects(res.data);
        } catch (e) {
            console.error("Ошибка загрузки объектов");
        }
        setLoading(false);
    };

    useEffect(() => { fetchObjects(); }, [showArchived]);

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', newObj.name);
            fd.append('address', newObj.address);
            await axios.post('/api/objects/create', fd);
            setCreateModalOpen(false);
            setNewObj({ name: '', address: '' });
            fetchObjects();
            toast.success("Объект успешно создан!");
        } catch (e) { toast.error("Ошибка создания"); }
    };

    const handlePdfUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPdfParsing(true);
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await axios.post('/api/objects/parse_pdf', fd);
            setPdfData(res.data);
            setNewObj({ name: res.data.name || '', address: res.data.address || '' });
            setPdfStep('verify');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка парсинга PDF');
        }
        setPdfParsing(false);
        e.target.value = '';
    };

    const handlePdfWorkChange = (index, field, value) => {
        setPdfData(prev => {
            const works = [...prev.works];
            works[index] = { ...works[index], [field]: field === 'volume' ? (parseFloat(value) || 0) : value };
            return { ...prev, works };
        });
    };

    const handlePdfRemoveWork = (index) => {
        setPdfData(prev => ({ ...prev, works: prev.works.filter((_, i) => i !== index) }));
    };

    const handlePdfConfirmAndCreate = async () => {
        if (!newObj.name || !newObj.address) {
            toast.error('Заполните название и адрес объекта');
            return;
        }
        try {
            // 1. Create the object
            const fd = new FormData();
            fd.append('name', newObj.name);
            fd.append('address', newObj.address);
            await axios.post('/api/objects/create', fd);

            // 2. Fetch objects to find the new one, then set KP target volumes
            const objRes = await axios.get('/api/objects?archived=0');
            const created = objRes.data.find(o => o.name === newObj.name && o.address === newObj.address);

            if (created && pdfData?.works?.length) {
                // Match parsed works to KP catalog by name
                const kpRes = await axios.get('/api/kp/catalog');
                const catalog = kpRes.data || [];
                const matchedIds = [];
                const tvMap = {};

                for (const w of pdfData.works) {
                    const match = catalog.find(k => k.name.toLowerCase().trim() === w.name.toLowerCase().trim());
                    if (match) {
                        matchedIds.push(match.id);
                        if (w.volume) tvMap[match.id] = w.volume;
                    }
                }

                if (matchedIds.length > 0) {
                    await axios.post(`/api/objects/${created.id}/kp/update`, {
                        kp_ids: matchedIds,
                        target_volumes: tvMap,
                    });
                }
            }

            setCreateModalOpen(false);
            setNewObj({ name: '', address: '' });
            setPdfData(null);
            setPdfStep('upload');
            fetchObjects();
            toast.success('Объект успешно создан!');
        } catch (err) {
            toast.error('Ошибка создания объекта');
        }
    };

    const resetCreateModal = () => {
        setCreateModalOpen(false);
        setNewObj({ name: '', address: '' });
        setPdfData(null);
        setPdfStep('upload');
    };

    const handleArchiveToggle = async (objId, isCurrentlyArchived) => {
        const msg = isCurrentlyArchived ? "Вернуть объект в работу?" : "Отправить объект в архив? Он больше не будет доступен для новых заявок.";
        const ok = await confirm(msg, { title: isCurrentlyArchived ? "Восстановление" : "Архивация объекта", variant: isCurrentlyArchived ? "info" : "warning", confirmText: isCurrentlyArchived ? "Восстановить" : "В архив" });
        if (!ok) return;
        try {
            await axios.post(`/api/objects/${objId}/${isCurrentlyArchived ? 'restore' : 'archive'}`);
            fetchObjects();
        } catch (e) { toast.error("Ошибка смены статуса"); }
    };

    const openEditModal = async (obj) => {
        setEditObj({
            ...obj,
            default_team_ids: obj.default_team_ids ? obj.default_team_ids.split(',').map(Number) : [],
            default_equip_ids: obj.default_equip_ids ? obj.default_equip_ids.split(',').map(Number) : []
        });
        setActiveTab('info');
        setEditModalOpen(true);

        try {
            const [dashRes, kpCatRes, objKpRes, filesRes] = await Promise.all([
                axios.get('/api/dashboard'),
                axios.get('/api/kp/catalog'),
                axios.get(`/api/objects/${obj.id}/kp`),
                axios.get(`/api/objects/${obj.id}/files`)
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

    const handleSaveInfo = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', editObj.name);
            fd.append('address', editObj.address);
            fd.append('default_teams', editObj.default_team_ids.join(','));
            fd.append('default_equip', editObj.default_equip_ids.join(','));
            await axios.post(`/api/objects/${editObj.id}/update`, fd);
            fetchObjects();
            toast.success("Настройки объекта сохранены!");
        } catch (e) { toast.error("Ошибка сохранения"); }
    };

    const handleSaveKPPlan = async () => {
        try {
            await axios.post(`/api/objects/${editObj.id}/kp/update`, { kp_ids: objectKpPlan, target_volumes: targetVolumes });
            toast.success("План СМР успешно обновлен!");
        } catch (e) { toast.error("Ошибка сохранения плана СМР"); }
    };

    const handleFileUpload = async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        setUploading(true);
        const fd = new FormData();
        for (let f of files) fd.append('files', f);
        try {
            await axios.post(`/api/objects/${editObj.id}/files/upload`, fd);
            const res = await axios.get(`/api/objects/${editObj.id}/files`);
            setObjectFiles(res.data || []);
        } catch (err) { toast.error("Ошибка загрузки файлов"); }
        setUploading(false);
        e.target.value = '';
    };

    const handleDeleteFile = async (fileId) => {
        const ok = await confirm("Удалить файл?", { title: "Удаление файла", confirmText: "Удалить" });
        if (!ok) return;
        try {
            await axios.delete(`/api/objects/files/${fileId}`);
            setObjectFiles(prev => prev.filter(f => f.id !== fileId));
        } catch (e) { toast.error("Ошибка удаления"); }
    };

    const openStatsModal = async (obj) => {
        setStatsObj(obj);
        setStatsModalOpen(true);
        setStatsLoading(true);
        setExpandedDates({});
        try {
            const res = await axios.get(`/api/objects/${obj.id}/stats`);
            setStatsData(res.data);
        } catch (e) { toast.error("Ошибка загрузки статистики"); }
        setStatsLoading(false);
    };

    const toggleResource = (type, id) => {
        setEditObj(prev => {
            const list = type === 'team' ? prev.default_team_ids : prev.default_equip_ids;
            const key = type === 'team' ? 'default_team_ids' : 'default_equip_ids';
            return { ...prev, [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] };
        });
    };

    const toggleKp = (id) => {
        setObjectKpPlan(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    if (loading) return <div className="mt-32 text-center text-gray-400 font-bold animate-pulse">Загрузка объектов...</div>;

    // Группировка КП по категориям для поиска
    const filteredKp = kpCatalog.filter(k => k.name.toLowerCase().includes(kpSearch.toLowerCase()) || k.category.toLowerCase().includes(kpSearch.toLowerCase()));
    const kpByCategory = filteredKp.reduce((acc, curr) => {
        acc[curr.category] = acc[curr.category] || [];
        acc[curr.category].push(curr);
        return acc;
    }, {});

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">

            <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 gap-4">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <MapPin className="w-8 h-8 text-blue-500 mr-3" /> Объекты
                </h2>
                {canManage && (
                    <div className="flex gap-2">
                        <button onClick={() => setShowArchived(!showArchived)} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2 ${showArchived ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                            <Archive className="w-4 h-4" /> {showArchived ? 'Показать активные' : 'Архив'}
                        </button>
                        {canCreate && (
                            <button onClick={() => setCreateModalOpen(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95">
                                <Plus className="w-4 h-4" /> Создать
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {objects.map(obj => (
                    <div key={obj.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-md transition-all">
                        <div className="mb-6">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-xl text-gray-800 dark:text-white leading-tight">{obj.name}</h3>
                                {obj.is_archived === 1 && <span className="bg-gray-100 text-gray-500 dark:bg-gray-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Архив</span>}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-start gap-1.5 mt-2">
                                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" /> {obj.address}
                            </p>
                        </div>

                        {canManage && (
                            <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
                                <button onClick={() => openEditModal(obj)} className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 py-2.5 rounded-xl text-sm font-bold transition-colors flex justify-center items-center gap-1.5">
                                    <Settings className="w-4 h-4" /> Редактировать
                                </button>
                                {canViewStats && (
                                    <button onClick={() => openStatsModal(obj)} className="flex-none px-4 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 py-2.5 rounded-xl font-bold transition-colors flex justify-center items-center" title="Статистика">
                                        <BarChart3 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={() => handleArchiveToggle(obj.id, obj.is_archived === 1)} className="flex-none px-4 bg-gray-50 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 py-2.5 rounded-xl font-bold transition-colors flex justify-center items-center">
                                    <Archive className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {objects.length === 0 && <div className="col-span-full text-center py-12 text-gray-400 italic">Нет доступных объектов.</div>}
            </div>

            {/* МОДАЛКА СОЗДАНИЯ */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative">
                        <button onClick={resetCreateModal} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 bg-gray-50 dark:bg-gray-700 rounded-full p-1.5"><X className="w-5 h-5" /></button>
                        <h3 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2"><MapPin className="text-blue-500" /> Новый объект</h3>

                        {/* PDF Upload Dropzone */}
                        {pdfStep === 'upload' && (
                            <>
                                <div className="mb-6 p-4 bg-violet-50/50 dark:bg-violet-900/10 rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-700">
                                    <label className={`block w-full text-center py-6 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl transition-colors ${pdfParsing ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
                                        <FileUp className="w-10 h-10 text-violet-400 mx-auto mb-2" />
                                        <span className="text-sm font-bold text-violet-600 dark:text-violet-400 block">
                                            {pdfParsing ? 'Анализ PDF...' : 'Загрузить СМР из PDF'}
                                        </span>
                                        <span className="text-xs text-gray-400 mt-1 block">Автоматически заполнит название, адрес и работы</span>
                                    </label>
                                </div>

                                <div className="relative flex items-center justify-center mb-6">
                                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700"></div></div>
                                    <span className="relative bg-white dark:bg-gray-800 px-3 text-xs text-gray-400 font-bold uppercase">или заполните вручную</span>
                                </div>

                                <form onSubmit={handleCreate} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Название</label>
                                        <input type="text" required value={newObj.name} onChange={e => setNewObj({...newObj, name: e.target.value})} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" placeholder="Например: ЖК Счастье" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Адрес</label>
                                        <input type="text" required value={newObj.address} onChange={e => setNewObj({...newObj, address: e.target.value})} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" placeholder="г. Москва, ул. Мира 10" />
                                    </div>
                                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all mt-4">Создать объект</button>
                                </form>
                            </>
                        )}

                        {/* PDF Verification Step */}
                        {pdfStep === 'verify' && pdfData && (
                            <div className="space-y-5">
                                {/* Errors / Warnings */}
                                {pdfData.errors?.length > 0 && (
                                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                                        {pdfData.errors.map((err, i) => (
                                            <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {err}
                                            </p>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 p-3 rounded-xl border border-violet-100 dark:border-violet-800/30">
                                    <CheckCheck className="w-5 h-5" /> Проверьте данные
                                </div>

                                {/* Editable name & address */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Название объекта</label>
                                    <input type="text" value={newObj.name} onChange={e => setNewObj({...newObj, name: e.target.value})} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 dark:text-white" placeholder="Название" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Адрес</label>
                                    <input type="text" value={newObj.address} onChange={e => setNewObj({...newObj, address: e.target.value})} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 dark:text-white" placeholder="Адрес" />
                                </div>

                                {/* Works table */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Работы СМР ({pdfData.works?.length || 0})</label>
                                    {pdfData.works?.length > 0 ? (
                                        <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                            <div className="grid grid-cols-[1fr_70px_70px_32px] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                                <span>Наименование</span>
                                                <span>Ед.изм</span>
                                                <span>Кол-во</span>
                                                <span></span>
                                            </div>
                                            <div className="divide-y divide-gray-50 dark:divide-gray-700 max-h-[40vh] overflow-y-auto">
                                                {pdfData.works.map((w, i) => (
                                                    <div key={i} className="grid grid-cols-[1fr_70px_70px_32px] gap-2 px-3 py-2 items-center">
                                                        <input
                                                            type="text"
                                                            value={w.name}
                                                            onChange={e => handlePdfWorkChange(i, 'name', e.target.value)}
                                                            className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={w.unit}
                                                            onChange={e => handlePdfWorkChange(i, 'unit', e.target.value)}
                                                            className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full text-center"
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={w.volume}
                                                            onChange={e => handlePdfWorkChange(i, 'volume', e.target.value)}
                                                            className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full text-right"
                                                        />
                                                        <button onClick={() => handlePdfRemoveWork(i)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-center text-gray-400 italic py-4 text-sm">Работы не найдены в PDF</p>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex gap-3 pt-2">
                                    <button onClick={() => { setPdfStep('upload'); setPdfData(null); }} className="flex-1 py-4 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                        Назад
                                    </button>
                                    <button onClick={handlePdfConfirmAndCreate} className="flex-1 bg-violet-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-violet-700 transition-all flex items-center justify-center gap-2">
                                        <CheckCheck className="w-5 h-5" /> Подтвердить и создать
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* МОДАЛКА РЕДАКТИРОВАНИЯ И КП */}
            {isEditModalOpen && editObj && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                            <h3 className="text-xl font-bold dark:text-white truncate">Настройки: {editObj.name}</h3>
                            <button onClick={() => setEditModalOpen(false)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1.5 border border-gray-100 dark:border-gray-700"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                            <button onClick={() => setActiveTab('info')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>Инфо</button>
                            <button onClick={() => setActiveTab('resources')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'resources' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>Ресурсы</button>
                            <button onClick={() => setActiveTab('kp')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'kp' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>План СМР</button>
                            <button onClick={() => setActiveTab('files')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'files' ? 'text-orange-600 border-b-2 border-orange-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>Файлы</button>
                        </div>

                        <div className="p-6">
                            {/* ТАБ 1: ИНФО */}
                            {activeTab === 'info' && (
                                <form onSubmit={handleSaveInfo} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Название</label>
                                        <input type="text" required value={editObj.name} onChange={e => setEditObj({...editObj, name: e.target.value})} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Адрес</label>
                                        <input type="text" required value={editObj.address} onChange={e => setEditObj({...editObj, address: e.target.value})} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                                    </div>
                                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all mt-4">Сохранить инфо</button>
                                </form>
                            )}

                            {/* ТАБ 2: РЕСУРСЫ ПО УМОЛЧАНИЮ */}
                            {activeTab === 'resources' && (
                                <form onSubmit={handleSaveInfo} className="space-y-6">
                                    <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                                        <label className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-3 uppercase tracking-wider"><Users className="w-4 h-4" /> Бригады по умолчанию:</label>
                                        <div className="flex flex-wrap gap-2">
                                            {allTeams.map(t => (
                                                <button key={t.id} type="button" onClick={() => toggleResource('team', t.id)} className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all flex items-center gap-1.5 ${editObj.default_team_ids.includes(t.id) ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                                                    {editObj.default_team_ids.includes(t.id) && <CheckCircle className="w-4 h-4" />} {t.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                                        <label className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wider"><Truck className="w-4 h-4" /> Техника по умолчанию:</label>
                                        <div className="flex flex-wrap gap-2">
                                            {allEquips.map(e => (
                                                <button key={e.id} type="button" onClick={() => toggleResource('equip', e.id)} className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all flex items-center gap-1.5 ${editObj.default_equip_ids.includes(e.id) ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                                                    {editObj.default_equip_ids.includes(e.id) && <CheckCircle className="w-4 h-4" />} {e.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all mt-4">Сохранить ресурсы</button>
                                </form>
                            )}

                            {/* ТАБ 3: ПЛАН КП */}
                            {activeTab === 'kp' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Выбрано работ: {objectKpPlan.length}</span>
                                        <button onClick={handleSaveKPPlan} className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2">
                                            Сохранить план
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-400 italic">Для выбранных работ можно задать плановый объем (поле справа).</p>

                                    <div className="relative">
                                        <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" />
                                        <input type="text" value={kpSearch} onChange={e => setKpSearch(e.target.value)} placeholder="Поиск по названию или категории..." className="w-full pl-10 pr-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white" />
                                    </div>

                                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                        {Object.keys(kpByCategory).map(category => (
                                            <div key={category} className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800">
                                                <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 border-b border-gray-100 dark:border-gray-700 font-bold text-xs uppercase tracking-wider text-gray-500">{category}</div>
                                                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                                    {kpByCategory[category].map(k => {
                                                        const isSelected = objectKpPlan.includes(k.id);
                                                        return (
                                                            <div key={k.id} className={`p-4 flex items-center gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                                                                <div onClick={() => toggleKp(k.id)} className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center cursor-pointer ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                                                </div>
                                                                <div className="flex-1 cursor-pointer" onClick={() => toggleKp(k.id)}>
                                                                    <p className={`text-sm font-bold leading-tight ${isSelected ? 'text-emerald-900 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200'}`}>{k.name}</p>
                                                                    <p className="text-xs text-gray-500 font-medium mt-1">ЗП: {k.salary} руб / {k.unit}</p>
                                                                </div>
                                                                {isSelected && (
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.1"
                                                                        placeholder="План. объем"
                                                                        value={targetVolumes[k.id] || ''}
                                                                        onClick={e => e.stopPropagation()}
                                                                        onChange={e => setTargetVolumes(prev => ({ ...prev, [k.id]: parseFloat(e.target.value) || 0 }))}
                                                                        className="w-24 px-2 py-1.5 text-xs border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white text-right"
                                                                    />
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                        {filteredKp.length === 0 && <p className="text-center text-gray-500 italic py-6">Ничего не найдено</p>}
                                    </div>
                                </div>
                            )}

                            {/* ТАБ 4: ФАЙЛЫ */}
                            {activeTab === 'files' && (
                                <div className="space-y-4">
                                    <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-800/30">
                                        <label className="flex items-center gap-2 text-xs font-bold text-orange-800 dark:text-orange-300 mb-3 uppercase tracking-wider"><Upload className="w-4 h-4" /> Загрузить PDF файлы</label>
                                        <label className={`block w-full text-center py-4 border-2 border-dashed border-orange-200 dark:border-orange-700 rounded-xl cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <input type="file" accept=".pdf" multiple onChange={handleFileUpload} className="hidden" />
                                            <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{uploading ? 'Загрузка...' : 'Нажмите для выбора файлов (.pdf)'}</span>
                                        </label>
                                    </div>

                                    {objectFiles.length > 0 ? (
                                        <div className="space-y-2">
                                            {objectFiles.map(f => (
                                                <div key={f.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl">
                                                    <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                                                    <a href={f.file_path} target="_blank" rel="noreferrer" className="flex-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline truncate">
                                                        {f.file_path.split('/').pop()}
                                                    </a>
                                                    <span className="text-xs text-gray-400">{f.uploaded_at?.slice(0, 10)}</span>
                                                    <button onClick={() => handleDeleteFile(f.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-center text-gray-400 italic py-6">Нет загруженных файлов</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* МОДАЛКА СТАТИСТИКИ */}
            {isStatsModalOpen && statsObj && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                            <h3 className="text-xl font-bold dark:text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-amber-500" /> Статистика: {statsObj.name}</h3>
                            <button onClick={() => setStatsModalOpen(false)} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1.5 border border-gray-100 dark:border-gray-700"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-6">
                            {statsLoading ? (
                                <div className="text-center py-12 text-gray-400 animate-pulse font-bold">Загрузка...</div>
                            ) : statsData ? (
                                <>
                                    {/* Дата создания */}
                                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 p-3 rounded-xl">
                                        <Calendar className="w-4 h-4" />
                                        <span>Дата создания объекта: <span className="font-bold text-gray-700 dark:text-gray-200">{statsData.created_at?.slice(0, 10) || '—'}</span></span>
                                    </div>

                                    {/* Прогресс: План vs Факт */}
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Общий прогресс</h4>
                                        {statsData.progress?.length > 0 ? (
                                            <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                                <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                                    <span>Работа</span>
                                                    <span className="text-right">Факт</span>
                                                    <span className="text-right">План</span>
                                                    <span className="text-right">%</span>
                                                </div>
                                                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                                    {statsData.progress.map((p, i) => {
                                                        const pct = p.target_volume > 0 ? Math.round((p.completed_volume / p.target_volume) * 100) : (p.completed_volume > 0 ? 100 : 0);
                                                        return (
                                                            <div key={i} className="grid grid-cols-[1fr_80px_80px_60px] gap-2 px-4 py-3 items-center">
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{p.name}</p>
                                                                    <p className="text-[10px] text-gray-400 mt-0.5">{p.category} / {p.unit}</p>
                                                                </div>
                                                                <span className="text-sm font-bold text-right text-gray-800 dark:text-gray-200">{p.completed_volume}</span>
                                                                <span className="text-sm text-right text-gray-500">{p.target_volume || '—'}</span>
                                                                <span className={`text-sm font-bold text-right ${pct >= 100 ? 'text-emerald-600' : pct > 50 ? 'text-amber-600' : 'text-gray-400'}`}>{p.target_volume > 0 ? `${pct}%` : '—'}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-center text-gray-400 italic py-4">Нет данных по плану СМР</p>
                                        )}
                                    </div>

                                    {/* Хронология */}
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Хронология выполнения</h4>
                                        {statsData.history?.length > 0 ? (() => {
                                            const byDate = {};
                                            statsData.history.forEach(h => {
                                                const key = `${h.date_target} — Заявка #${h.app_id}`;
                                                if (!byDate[key]) byDate[key] = [];
                                                byDate[key].push(h);
                                            });
                                            return (
                                                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                                                    {Object.entries(byDate).map(([dateKey, items]) => (
                                                        <div key={dateKey} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                                                            <button onClick={() => setExpandedDates(prev => ({ ...prev, [dateKey]: !prev[dateKey] }))} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors">
                                                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{dateKey}</span>
                                                                {expandedDates[dateKey] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                                            </button>
                                                            {expandedDates[dateKey] && (
                                                                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                                                    {items.map((h, i) => (
                                                                        <div key={i} className="flex justify-between px-4 py-2 text-sm">
                                                                            <span className="text-gray-700 dark:text-gray-300">{h.name} <span className="text-gray-400 text-xs">({h.unit})</span></span>
                                                                            <span className="font-bold text-gray-800 dark:text-gray-200">{h.volume}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })() : (
                                            <p className="text-center text-gray-400 italic py-4">Нет выполненных работ</p>
                                        )}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
            <ConfirmUI />
        </main>
    );
}
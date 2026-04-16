import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { formatEquipName } from '../../../utils/equipFormat';
import {
    X, Users, Truck, Search, Check, CheckCircle,
    Upload, Trash2, FileText, Image, File, FolderOpen,
} from 'lucide-react';
import FileViewerModal from '../../../components/FileViewerModal';

const FILE_TABS = [
    { key: 'all', label: 'Все' },
    { key: 'docs', label: 'Документы' },
    { key: 'images', label: 'Фото' },
    { key: 'sheets', label: 'Таблицы' },
];

const getFileType = (f) => {
    const ext = (f.original_name || f.file_path || '').split('.').pop().toLowerCase();
    if (['pdf', 'doc', 'docx'].includes(ext)) return 'docs';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'images';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheets';
    return 'docs';
};

const getFileIcon = (f) => {
    const ext = (f.original_name || f.file_path || '').split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return <FileText className="w-5 h-5 text-red-400 flex-shrink-0" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return <Image className="w-5 h-5 text-green-400 flex-shrink-0" />;
    if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileText className="w-5 h-5 text-emerald-400 flex-shrink-0" />;
    if (['doc', 'docx'].includes(ext)) return <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />;
    return <File className="w-5 h-5 text-gray-400 flex-shrink-0" />;
};

const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / 1048576).toFixed(1)} МБ`;
};

export default function ObjectEditModal({
    editObj, setEditObj, onClose, onSaved, allTeams, allEquips,
    kpCatalog, objectKpPlan, setObjectKpPlan, targetVolumes, setTargetVolumes,
    objectFiles, setObjectFiles, confirm, initialTab = 'info',
}) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [kpSearch, setKpSearch] = useState('');
    const [uploading, setUploading] = useState(false);
    const [viewingFile, setViewingFile] = useState(null);
    const [smrImporting, setSmrImporting] = useState(false);
    const [smrPreview, setSmrPreview] = useState(null);
    const [fileTab, setFileTab] = useState('all');
    const [isDragging, setIsDragging] = useState(false);
    const [editingFileName, setEditingFileName] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const smrFileRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

    const role = localStorage.getItem('user_role') || 'worker';
    const isOffice = ['moderator', 'boss', 'superadmin'].includes(role);

    // Equipment grouped by category
    const equipByCategory = allEquips.reduce((acc, eq) => {
        const cat = eq.category || 'Без категории';
        (acc[cat] = acc[cat] || []).push(eq);
        return acc;
    }, {});

    // KP plan sets
    const selectedKpIds = new Set(objectKpPlan);
    const filteredKp = kpCatalog.filter(k =>
        k.name.toLowerCase().includes(kpSearch.toLowerCase()) ||
        k.category.toLowerCase().includes(kpSearch.toLowerCase())
    );
    const selectedWorks = filteredKp.filter(k => selectedKpIds.has(k.id));
    const unselectedWorks = filteredKp.filter(k => !selectedKpIds.has(k.id));
    const unselectedByCategory = unselectedWorks.reduce((acc, k) => {
        acc[k.category] = acc[k.category] || [];
        acc[k.category].push(k);
        return acc;
    }, {});

    // Files filtering
    const filteredFiles = fileTab === 'all' ? objectFiles : objectFiles.filter(f => getFileType(f) === fileTab);

    const toggleResource = (type, id) => {
        setEditObj(prev => {
            const key = type === 'team' ? 'default_team_ids' : 'default_equip_ids';
            const list = prev[key];
            return { ...prev, [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] };
        });
    };

    const toggleKp = (id) => {
        setObjectKpPlan(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleSaveInfo = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', editObj.name); fd.append('address', editObj.address);
            fd.append('default_teams', editObj.default_team_ids.join(','));
            fd.append('default_equip', editObj.default_equip_ids.join(','));
            await axios.post(`/api/objects/${editObj.id}/update`, fd);
            onSaved(); toast.success('Настройки сохранены!');
        } catch { toast.error('Ошибка сохранения'); }
    };

    const handleSaveKPPlan = async () => {
        try {
            await axios.post(`/api/objects/${editObj.id}/kp/update`, { kp_ids: objectKpPlan, target_volumes: targetVolumes });
            toast.success('План СМР обновлен!');
        } catch { toast.error('Ошибка сохранения'); }
    };

    // File upload (shared between button click and drag-drop)
    const uploadFiles = async (files) => {
        if (!files.length) return;
        setUploading(true);
        const fd = new FormData();
        for (let f of files) fd.append('files', f);
        try {
            await axios.post(`/api/objects/${editObj.id}/files/upload`, fd);
            const res = await axios.get(`/api/objects/${editObj.id}/files`);
            setObjectFiles(res.data || []);
            toast.success('Файлы загружены!');
        } catch { toast.error('Ошибка загрузки'); }
        setUploading(false);
    };

    const handleDeleteFile = async (fileId) => {
        const ok = await confirm('Удалить файл?', { title: 'Удаление', confirmText: 'Удалить' });
        if (!ok) return;
        try {
            await axios.delete(`/api/objects/files/${fileId}`);
            setObjectFiles(prev => prev.filter(f => f.id !== fileId));
        } catch { toast.error('Ошибка удаления'); }
    };

    const startRename = (file) => { setEditingFileName(file.id); setRenameValue(file.original_name || ''); };
    const saveRename = async (fileId) => {
        if (!renameValue.trim()) { setEditingFileName(null); return; }
        try {
            await axios.post(`/api/objects/files/${fileId}/rename`, new URLSearchParams({ new_name: renameValue.trim() }));
            setObjectFiles(prev => prev.map(f => f.id === fileId ? { ...f, original_name: renameValue.trim() } : f));
        } catch {}
        setEditingFileName(null);
    };

    // SMR import
    const handleSmrImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSmrImporting(true);
        const fd = new FormData(); fd.append('file', file);
        try {
            const res = await axios.post(`/api/objects/${editObj.id}/smr/import`, fd);
            setSmrPreview(res.data);
        } catch (err) { toast.error(err.response?.data?.detail || 'Ошибка импорта'); }
        setSmrImporting(false); e.target.value = '';
    };

    const confirmSmrImport = async () => {
        if (!smrPreview) return;
        try {
            const addIds = smrPreview.new_works.map(w => w.kp_id);
            const volumes = {};
            smrPreview.new_works.forEach(w => { if (w.volume) volumes[w.kp_id] = w.volume; });
            await axios.post(`/api/objects/${editObj.id}/smr/confirm`, { add_kp_ids: addIds, remove_kp_ids: [], volumes });
            const res = await axios.get(`/api/objects/${editObj.id}/kp`);
            setObjectKpPlan(res.data.map(k => k.id) || []);
            const tvMap = {}; res.data.forEach(k => { tvMap[k.id] = k.target_volume || 0; }); setTargetVolumes(tvMap);
            setSmrPreview(null); toast.success(`Импорт: +${addIds.length} работ`);
        } catch { toast.error('Ошибка импорта'); }
    };

    // Drag and drop
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); uploadFiles(Array.from(e.dataTransfer.files)); };

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                    <h3 className="text-xl font-bold dark:text-white truncate">{editObj.name}</h3>
                    <button onClick={onClose} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1.5 border border-gray-100 dark:border-gray-700"><X className="w-5 h-5" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    {[['info', 'Инфо', 'blue'], ['resources', 'Ресурсы', 'indigo'], ['kp', 'План СМР', 'emerald'], ['files', 'Файлы', 'orange']].map(([key, label, color]) => (
                        <button key={key} onClick={() => setActiveTab(key)}
                            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === key ? `text-${color}-600 border-b-2 border-${color}-600 bg-white dark:bg-gray-800` : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {/* ── TAB: INFO ── */}
                    {activeTab === 'info' && (
                        <form onSubmit={handleSaveInfo} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Название</label>
                                <input type="text" required value={editObj.name} onChange={e => setEditObj({ ...editObj, name: e.target.value })}
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Адрес</label>
                                <input type="text" required value={editObj.address} onChange={e => setEditObj({ ...editObj, address: e.target.value })}
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all mt-4">Сохранить</button>
                        </form>
                    )}

                    {/* ── TAB: RESOURCES ── */}
                    {activeTab === 'resources' && (
                        <form onSubmit={handleSaveInfo} className="space-y-6">
                            <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                                <label className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-3 uppercase tracking-wider"><Users className="w-4 h-4" /> Бригады:</label>
                                <div className="flex flex-wrap gap-2">
                                    {allTeams.map(t => (
                                        <button key={t.id} type="button" onClick={() => toggleResource('team', t.id)}
                                            className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all flex items-center gap-1.5 ${editObj.default_team_ids.includes(t.id) ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                                            {editObj.default_team_ids.includes(t.id) && <CheckCircle className="w-4 h-4" />} {t.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                                <label className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wider"><Truck className="w-4 h-4" /> Техника:</label>
                                {Object.entries(equipByCategory).map(([cat, equips]) => (
                                    <div key={cat} className="mb-3">
                                        <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">{cat}</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {equips.map(e => (
                                                <button key={e.id} type="button" onClick={() => toggleResource('equip', e.id)}
                                                    className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all flex items-center gap-1.5 ${editObj.default_equip_ids.includes(e.id) ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                                                    {editObj.default_equip_ids.includes(e.id) && <CheckCircle className="w-4 h-4" />} {formatEquipName(e.name, e.license_plate)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all">Сохранить</button>
                        </form>
                    )}

                    {/* ── TAB: PLAN СМР — selected on top ── */}
                    {activeTab === 'kp' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 gap-2">
                                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Выбрано: {objectKpPlan.length}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => smrFileRef.current?.click()} disabled={smrImporting}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-600/20 transition-colors disabled:opacity-50">
                                        <Upload className="w-3.5 h-3.5" /> {smrImporting ? 'Загрузка...' : 'Из PDF'}
                                    </button>
                                    <input ref={smrFileRef} type="file" accept=".pdf" className="hidden" onChange={handleSmrImport} />
                                    <button onClick={handleSaveKPPlan} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 active:scale-95 transition-all">Сохранить</button>
                                </div>
                            </div>

                            {/* SMR Import Preview */}
                            {smrPreview && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/30 space-y-3">
                                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300">Результат импорта PDF</h4>
                                    {!smrPreview.name_match && smrPreview.parsed_name && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">⚠ Название «{smrPreview.parsed_name}» не совпадает</p>
                                    )}
                                    {smrPreview.warnings?.map((w, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-400">{w}</p>)}
                                    <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                                        <p>Распознано: <b>{smrPreview.total_parsed}</b> | Найдено: <b>{smrPreview.total_matched}</b></p>
                                        {smrPreview.new_works.length > 0 && <p className="text-emerald-600 dark:text-emerald-400">Новых: <b>{smrPreview.new_works.length}</b></p>}
                                    </div>
                                    {smrPreview.new_works.length > 0 && (
                                        <div className="max-h-40 overflow-y-auto text-xs space-y-1 bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                                            {smrPreview.new_works.map(w => (
                                                <div key={w.kp_id} className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                                    <span className="truncate flex-1">{w.name}</span>
                                                    <span className="ml-2 flex-shrink-0">{w.volume} {w.unit}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <button onClick={confirmSmrImport} className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 active:scale-95">Добавить {smrPreview.new_works.length} работ</button>
                                        <button onClick={() => setSmrPreview(null)} className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Отмена</button>
                                    </div>
                                </div>
                            )}

                            <div className="relative">
                                <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" />
                                <input type="text" value={kpSearch} onChange={e => setKpSearch(e.target.value)} placeholder="Поиск..."
                                    className="w-full pl-10 pr-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white" />
                            </div>

                            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {/* Selected works on top */}
                                {selectedWorks.length > 0 && (
                                    <div className="border border-emerald-200 dark:border-emerald-800/30 rounded-2xl overflow-hidden bg-emerald-50/30 dark:bg-emerald-900/10">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/30 px-4 py-2 border-b border-emerald-200 dark:border-emerald-800/30 font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                            Выбранные ({selectedWorks.length})
                                        </div>
                                        <div className="divide-y divide-emerald-100 dark:divide-emerald-900/20">
                                            {selectedWorks.map(k => (
                                                <div key={k.id} className="p-3 flex items-center gap-3">
                                                    <div onClick={() => toggleKp(k.id)} className="w-5 h-5 flex-shrink-0 rounded border bg-emerald-500 border-emerald-500 text-white flex items-center justify-center cursor-pointer">
                                                        <Check className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleKp(k.id)}>
                                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-tight truncate">{k.name}</p>
                                                    </div>
                                                    <span className="text-xs text-gray-400 w-14 text-center flex-shrink-0">{k.unit}</span>
                                                    <input type="number" min="0" step="0.1" placeholder="Объём" value={targetVolumes[k.id] || ''} onClick={e => e.stopPropagation()}
                                                        onChange={e => setTargetVolumes(prev => ({ ...prev, [k.id]: parseFloat(e.target.value) || 0 }))}
                                                        className="w-20 px-2 py-1.5 text-xs border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white text-right flex-shrink-0" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Unselected works by category */}
                                {Object.keys(unselectedByCategory).map(category => (
                                    <div key={category} className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800">
                                        <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 border-b border-gray-100 dark:border-gray-700 font-bold text-xs uppercase tracking-wider text-gray-500">{category}</div>
                                        <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                            {unselectedByCategory[category].map(k => (
                                                <div key={k.id} className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => toggleKp(k.id)}>
                                                    <div className="w-5 h-5 flex-shrink-0 rounded border border-gray-300 dark:border-gray-600" />
                                                    <p className="flex-1 text-sm text-gray-600 dark:text-gray-400 leading-tight truncate">{k.name}</p>
                                                    <span className="text-xs text-gray-400 w-14 text-center flex-shrink-0">{k.unit}</span>
                                                    <div className="w-20 flex-shrink-0" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {filteredKp.length === 0 && <p className="text-center text-gray-500 italic py-6">Ничего не найдено</p>}
                            </div>
                        </div>
                    )}

                    {/* ── TAB: FILES — subtabs, drag-drop, viewer, rename ── */}
                    {activeTab === 'files' && (
                        <div className="space-y-3">
                            {/* Sub-tabs */}
                            <div className="flex gap-1">
                                {FILE_TABS.map(t => (
                                    <button key={t.key} onClick={() => setFileTab(t.key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${fileTab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                                        {t.label} ({t.key === 'all' ? objectFiles.length : objectFiles.filter(f => getFileType(f) === t.key).length})
                                    </button>
                                ))}
                            </div>

                            {/* Drag-drop upload */}
                            {isOffice && (
                                <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Upload className="w-8 h-8 text-gray-300 dark:text-gray-500 mb-2" />
                                    <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{isDragging ? 'Отпустите файлы' : uploading ? 'Загрузка...' : 'Перетащите или нажмите'}</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, фото, Excel, Word</span>
                                    <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.xlsx,.xls,.doc,.docx,.dwg,.zip" className="hidden"
                                        onChange={e => { uploadFiles(Array.from(e.target.files)); e.target.value = ''; }} />
                                </div>
                            )}

                            {/* Image grid for images sub-tab */}
                            {fileTab === 'images' && filteredFiles.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {filteredFiles.map(file => (
                                        <div key={file.id} className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 aspect-square cursor-pointer"
                                            onClick={() => setViewingFile({ url: file.file_path, name: file.original_name })}>
                                            <img src={file.file_path} alt={file.original_name} className="w-full h-full object-cover" loading="lazy" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                                                <div className="w-full p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <p className="text-xs text-white truncate">{file.original_name}</p>
                                                </div>
                                            </div>
                                            {isOffice && (
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                                                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* List view for all other tabs */
                                filteredFiles.length > 0 ? (
                                    <div className="space-y-2">
                                        {filteredFiles.map(f => (
                                            <div key={f.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl">
                                                {getFileIcon(f)}
                                                <div className="flex-1 min-w-0">
                                                    {editingFileName === f.id ? (
                                                        <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                                                            onBlur={() => saveRename(f.id)} onKeyDown={e => { if (e.key === 'Enter') saveRename(f.id); if (e.key === 'Escape') setEditingFileName(null); }}
                                                            className="text-sm bg-transparent border-b border-blue-500/50 text-gray-800 dark:text-white outline-none w-full" autoFocus />
                                                    ) : (
                                                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate cursor-pointer hover:underline"
                                                            onClick={() => setViewingFile({ url: f.file_path, name: f.original_name })}
                                                            onDoubleClick={(e) => { e.stopPropagation(); startRename(f); }}
                                                            title="Двойной клик — переименовать">
                                                            {f.original_name || f.file_path.split('/').pop()}
                                                        </p>
                                                    )}
                                                    {f.file_size > 0 && <p className="text-xs text-gray-400">{formatFileSize(f.file_size)}</p>}
                                                </div>
                                                <span className="text-xs text-gray-400 flex-shrink-0">{f.uploaded_at?.slice(0, 10)}</span>
                                                {isOffice && (
                                                    <button onClick={() => handleDeleteFile(f.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : filteredFiles.length === 0 ? (
                                    <p className="text-center text-gray-400 italic py-6">Нет файлов</p>
                                ) : null
                            )}
                        </div>
                    )}
                </div>
            </div>

            <FileViewerModal
                isOpen={!!viewingFile}
                onClose={() => setViewingFile(null)}
                fileUrl={viewingFile?.url || ''}
                fileName={viewingFile?.name || ''}
            />
        </div>
    );
}

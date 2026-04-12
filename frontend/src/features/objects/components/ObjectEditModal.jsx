import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { formatEquipName } from '../../../utils/equipFormat';
import {
    X, Users, Truck, Search, Check, CheckCircle,
    Upload, Trash2, FileText,
} from 'lucide-react';

export default function ObjectEditModal({
    editObj,
    setEditObj,
    onClose,
    onSaved,
    allTeams,
    allEquips,
    kpCatalog,
    objectKpPlan,
    setObjectKpPlan,
    targetVolumes,
    setTargetVolumes,
    objectFiles,
    setObjectFiles,
    confirm,
}) {
    const [activeTab, setActiveTab] = useState('info');
    const [kpSearch, setKpSearch] = useState('');
    const [uploading, setUploading] = useState(false);

    const filteredKp = kpCatalog.filter(
        k =>
            k.name.toLowerCase().includes(kpSearch.toLowerCase()) ||
            k.category.toLowerCase().includes(kpSearch.toLowerCase())
    );
    const kpByCategory = filteredKp.reduce((acc, curr) => {
        acc[curr.category] = acc[curr.category] || [];
        acc[curr.category].push(curr);
        return acc;
    }, {});

    const toggleResource = (type, id) => {
        setEditObj(prev => {
            const list = type === 'team' ? prev.default_team_ids : prev.default_equip_ids;
            const key = type === 'team' ? 'default_team_ids' : 'default_equip_ids';
            return {
                ...prev,
                [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id],
            };
        });
    };

    const toggleKp = (id) => {
        setObjectKpPlan(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
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
            onSaved();
            toast.success('Настройки объекта сохранены!');
        } catch (e) {
            toast.error('Ошибка сохранения');
        }
    };

    const handleSaveKPPlan = async () => {
        try {
            await axios.post(`/api/objects/${editObj.id}/kp/update`, {
                kp_ids: objectKpPlan,
                target_volumes: targetVolumes,
            });
            toast.success('План СМР успешно обновлен!');
        } catch (e) {
            toast.error('Ошибка сохранения плана СМР');
        }
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
        } catch (err) {
            toast.error('Ошибка загрузки файлов');
        }
        setUploading(false);
        e.target.value = '';
    };

    const handleDeleteFile = async (fileId) => {
        const ok = await confirm('Удалить файл?', {
            title: 'Удаление файла',
            confirmText: 'Удалить',
        });
        if (!ok) return;
        try {
            await axios.delete(`/api/objects/files/${fileId}`);
            setObjectFiles(prev => prev.filter(f => f.id !== fileId));
        } catch (e) {
            toast.error('Ошибка удаления');
        }
    };

    return (
        <div className="fixed inset-0 w-screen h-[100dvh] z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                    <h3 className="text-xl font-bold dark:text-white truncate">
                        Настройки: {editObj.name}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1.5 border border-gray-100 dark:border-gray-700"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <button
                        onClick={() => setActiveTab('info')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Инфо
                    </button>
                    <button
                        onClick={() => setActiveTab('resources')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'resources' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Ресурсы
                    </button>
                    <button
                        onClick={() => setActiveTab('kp')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'kp' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        План СМР
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'files' ? 'text-orange-600 border-b-2 border-orange-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Файлы
                    </button>
                </div>

                <div className="p-6">
                    {/* TAB 1: INFO */}
                    {activeTab === 'info' && (
                        <form onSubmit={handleSaveInfo} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                    Название
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editObj.name}
                                    onChange={e => setEditObj({ ...editObj, name: e.target.value })}
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                    Адрес
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editObj.address}
                                    onChange={e => setEditObj({ ...editObj, address: e.target.value })}
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all mt-4"
                            >
                                Сохранить инфо
                            </button>
                        </form>
                    )}

                    {/* TAB 2: RESOURCES */}
                    {activeTab === 'resources' && (
                        <form onSubmit={handleSaveInfo} className="space-y-6">
                            <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                                <label className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-3 uppercase tracking-wider">
                                    <Users className="w-4 h-4" /> Бригады по умолчанию:
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {allTeams.map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => toggleResource('team', t.id)}
                                            className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all flex items-center gap-1.5 ${editObj.default_team_ids.includes(t.id) ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
                                        >
                                            {editObj.default_team_ids.includes(t.id) && (
                                                <CheckCircle className="w-4 h-4" />
                                            )}{' '}
                                            {t.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                                <label className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wider">
                                    <Truck className="w-4 h-4" /> Техника по умолчанию:
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {allEquips.map(e => (
                                        <button
                                            key={e.id}
                                            type="button"
                                            onClick={() => toggleResource('equip', e.id)}
                                            className={`px-3 py-2 text-sm font-bold rounded-xl border transition-all flex items-center gap-1.5 ${editObj.default_equip_ids.includes(e.id) ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
                                        >
                                            {editObj.default_equip_ids.includes(e.id) && (
                                                <CheckCircle className="w-4 h-4" />
                                            )}{' '}
                                            {formatEquipName(e.name, e.license_plate)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all mt-4"
                            >
                                Сохранить ресурсы
                            </button>
                        </form>
                    )}

                    {/* TAB 3: KP PLAN */}
                    {activeTab === 'kp' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400">
                                    Выбрано работ: {objectKpPlan.length}
                                </span>
                                <button
                                    onClick={handleSaveKPPlan}
                                    className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    Сохранить план
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 italic">
                                Для выбранных работ можно задать плановый объем (поле справа).
                            </p>

                            <div className="relative">
                                <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" />
                                <input
                                    type="text"
                                    value={kpSearch}
                                    onChange={e => setKpSearch(e.target.value)}
                                    placeholder="Поиск по названию или категории..."
                                    className="w-full pl-10 pr-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                                />
                            </div>

                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {Object.keys(kpByCategory).map(category => (
                                    <div
                                        key={category}
                                        className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800"
                                    >
                                        <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 border-b border-gray-100 dark:border-gray-700 font-bold text-xs uppercase tracking-wider text-gray-500">
                                            {category}
                                        </div>
                                        <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                            {kpByCategory[category].map(k => {
                                                const isSelected = objectKpPlan.includes(k.id);
                                                return (
                                                    <div
                                                        key={k.id}
                                                        className={`p-4 flex items-center gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
                                                    >
                                                        <div
                                                            onClick={() => toggleKp(k.id)}
                                                            className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center cursor-pointer ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}
                                                        >
                                                            {isSelected && <Check className="w-3.5 h-3.5" />}
                                                        </div>
                                                        <div
                                                            className="flex-1 cursor-pointer"
                                                            onClick={() => toggleKp(k.id)}
                                                        >
                                                            <p
                                                                className={`text-sm font-bold leading-tight ${isSelected ? 'text-emerald-900 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200'}`}
                                                            >
                                                                {k.name}
                                                            </p>
                                                            <p className="text-xs text-gray-500 font-medium mt-1">
                                                                ЗП: {k.salary} руб / {k.unit}
                                                            </p>
                                                        </div>
                                                        {isSelected && (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.1"
                                                                placeholder="План. объем"
                                                                value={targetVolumes[k.id] || ''}
                                                                onClick={e => e.stopPropagation()}
                                                                onChange={e =>
                                                                    setTargetVolumes(prev => ({
                                                                        ...prev,
                                                                        [k.id]: parseFloat(e.target.value) || 0,
                                                                    }))
                                                                }
                                                                className="w-24 px-2 py-1.5 text-xs border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white text-right"
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {filteredKp.length === 0 && (
                                    <p className="text-center text-gray-500 italic py-6">Ничего не найдено</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 4: FILES */}
                    {activeTab === 'files' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-800/30">
                                <label className="flex items-center gap-2 text-xs font-bold text-orange-800 dark:text-orange-300 mb-3 uppercase tracking-wider">
                                    <Upload className="w-4 h-4" /> Загрузить PDF файлы
                                </label>
                                <label
                                    className={`block w-full text-center py-4 border-2 border-dashed border-orange-200 dark:border-orange-700 rounded-xl cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        multiple
                                        onChange={handleFileUpload}
                                        className="hidden"
                                    />
                                    <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                                        {uploading ? 'Загрузка...' : 'Нажмите для выбора файлов (.pdf)'}
                                    </span>
                                </label>
                            </div>

                            {objectFiles.length > 0 ? (
                                <div className="space-y-2">
                                    {objectFiles.map(f => (
                                        <div
                                            key={f.id}
                                            className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl"
                                        >
                                            <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                                            <a
                                                href={f.file_path}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline truncate"
                                            >
                                                {f.file_path.split('/').pop()}
                                            </a>
                                            <span className="text-xs text-gray-400">
                                                {f.uploaded_at?.slice(0, 10)}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteFile(f.id)}
                                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-400 italic py-6">
                                    Нет загруженных файлов
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

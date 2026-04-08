import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    MapPin, Plus, Settings, Archive, CheckCircle,
    X, Search, Users, Truck, FileText, Check
} from 'lucide-react';

export default function Objects() {
    const role = localStorage.getItem('user_role') || 'Гость';
    const canManage = ['moderator', 'boss', 'superadmin', 'foreman'].includes(role);

    const [objects, setObjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);

    // Модалка создания
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [newObj, setNewObj] = useState({ name: '', address: '' });

    // Модалка редактирования
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editObj, setEditObj] = useState(null);
    const [activeTab, setActiveTab] = useState('info'); // info | resources | kp

    // Списки для модалки редактирования
    const [allTeams, setAllTeams] = useState([]);
    const [allEquips, setAllEquips] = useState([]);

    // Списки для КП
    const [kpCatalog, setKpCatalog] = useState([]);
    const [objectKpPlan, setObjectKpPlan] = useState([]);
    const [kpSearch, setKpSearch] = useState('');

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
            alert("Объект успешно создан!");
        } catch (e) { alert("Ошибка создания"); }
    };

    const handleArchiveToggle = async (objId, isCurrentlyArchived) => {
        if (!window.confirm(isCurrentlyArchived ? "Вернуть объект в работу?" : "Отправить объект в архив? Он больше не будет доступен для новых заявок.")) return;
        try {
            await axios.post(`/api/objects/${objId}/${isCurrentlyArchived ? 'restore' : 'archive'}`);
            fetchObjects();
        } catch (e) { alert("Ошибка смены статуса"); }
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
            const [dashRes, kpCatRes, objKpRes] = await Promise.all([
                axios.get('/api/dashboard'),
                axios.get('/api/kp/catalog'),
                axios.get(`/api/objects/${obj.id}/kp`)
            ]);
            setAllTeams(dashRes.data.teams || []);
            setAllEquips(dashRes.data.equipment || []);
            setKpCatalog(kpCatRes.data || []);
            setObjectKpPlan(objKpRes.data.map(k => k.id) || []);
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
            alert("Настройки объекта сохранены!");
        } catch (e) { alert("Ошибка сохранения"); }
    };

    const handleSaveKPPlan = async () => {
        try {
            await axios.post(`/api/objects/${editObj.id}/kp/update`, { kp_ids: objectKpPlan });
            alert("План КП успешно обновлен!");
        } catch (e) { alert("Ошибка сохранения плана КП"); }
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
                        <button onClick={() => setCreateModalOpen(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95">
                            <Plus className="w-4 h-4" /> Создать
                        </button>
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
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-md shadow-2xl relative">
                        <button onClick={() => setCreateModalOpen(false)} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 bg-gray-50 dark:bg-gray-700 rounded-full p-1.5"><X className="w-5 h-5" /></button>
                        <h3 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2"><MapPin className="text-blue-500" /> Новый объект</h3>
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
                            <button onClick={() => setActiveTab('resources')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'resources' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>Ресурсы по ум.</button>
                            <button onClick={() => setActiveTab('kp')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'kp' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white dark:bg-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>План КП</button>
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
                                                            <div key={k.id} onClick={() => toggleKp(k.id)} className={`p-4 flex items-center gap-3 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                                                                <div className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <p className={`text-sm font-bold leading-tight ${isSelected ? 'text-emerald-900 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200'}`}>{k.name}</p>
                                                                    <p className="text-xs text-gray-500 font-medium mt-1">ЗП: {k.salary} руб / {k.unit}</p>
                                                                </div>
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
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
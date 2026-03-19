import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Equipment() {
    const navigate = useNavigate();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';

    const [equipment, setEquipment] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('list');

    const [newEquip, setNewEquip] = useState({ name: '', driver: '', category: '' });
    const [customCategory, setCustomCategory] = useState('');
    const [bulkText, setBulkText] = useState('');

    const [selectedEquip, setSelectedEquip] = useState(null);
    const [inviteInfo, setInviteInfo] = useState(null);

    const canEditEquipment = ['moderator', 'boss', 'superadmin'].includes(role);

    const fetchData = async () => {
        try {
            const [equipRes, dashRes] = await Promise.all([axios.get('/api/equipment/admin_list'), axios.get('/api/dashboard')]);
            setEquipment(equipRes.data || []);
            const cats = dashRes.data?.equip_categories || [];
            setCategories(cats);
            if (cats.length > 0 && !newEquip.category) setNewEquip(prev => ({ ...prev, category: cats[0] }));
        } catch (e) {
            console.error("Fetch error");
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleAddSingle = async (e) => {
        e.preventDefault();
        if (!newEquip.name) return alert('Введите название техники');
        const finalCategory = newEquip.category === 'Своя категория' ? customCategory : newEquip.category;
        if (!finalCategory) return alert('Выберите или введите категорию');

        try {
            const fd = new FormData();
            fd.append('name', newEquip.name); fd.append('category', finalCategory); fd.append('driver', newEquip.driver); fd.append('tg_id', tgId);
            await axios.post('/api/equipment/add', fd);
            setNewEquip({ name: '', driver: '', category: categories.length > 0 ? categories[0] : '' });
            setCustomCategory('');
            alert('Техника добавлена!'); fetchData();
        } catch (err) { alert('Ошибка при добавлении'); }
    };

    const handleBulkAdd = async () => {
        const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return alert('Список пуст');
        const finalCategory = newEquip.category === 'Своя категория' ? customCategory : newEquip.category;
        if (!finalCategory) return alert('Выберите категорию для массовой загрузки');

        const items = lines.map(line => {
            const parts = line.split('-').map(p => p.trim());
            return { name: parts[0], driver: parts[1] || '', category: finalCategory };
        });

        try {
            const res = await axios.post('/api/equipment/bulk_add', { items });
            alert(`Успешно добавлено: ${res.data.added}`); setBulkText(''); fetchData();
        } catch (err) { alert('Ошибка массовой загрузки'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Удалить технику?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post(`/api/equipment/${id}/delete`, fd);
            setSelectedEquip(null); fetchData();
        } catch (e) { alert("Ошибка удаления"); }
    };

    const handleUnlink = async (id) => {
        if (!window.confirm("Отвязать водителя?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post(`/api/equipment/${id}/unlink`, fd);
            fetchData();
            if (selectedEquip) { setSelectedEquip({ ...selectedEquip, tg_id: null }); }
        } catch (e) { alert("Ошибка"); }
    };

    const generateInviteLink = async (id) => {
        try {
            const res = await axios.post(`/api/equipment/${id}/generate_invite`);
            setInviteInfo(res.data);
            setSelectedEquip(null);
        } catch (e) { alert("Ошибка генерации инвайта"); }
    };

    // ФУНКЦИЯ КОПИРОВАНИЯ СООБЩЕНИЯ
    const copyEquipMessage = () => {
        if (!inviteInfo) return;
        const text = `🚜 Привязка техники!

Для закрепления техники за вашим аккаунтом перейдите по одной из ссылок:
✈️ Telegram: ${inviteInfo.tg_bot_link}
📱 MAX: ${inviteInfo.max_bot_link}
🌐 Web: ${inviteInfo.invite_link}`;

        navigator.clipboard.writeText(text);
        alert("Сообщение скопировано в буфер обмена!");
    };

    if (loading) return <div className="flex justify-center p-10"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full"></div></div>;

    const groupedEquip = equipment.reduce((acc, eq) => {
        if (!acc[eq.category]) acc[eq.category] = [];
        acc[eq.category].push(eq);
        return acc;
    }, {});

    return (
        <div className="p-4 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 dark:text-white">Автопарк</h1>

            {canEditEquipment && (
                <div className="flex space-x-2 mb-6 bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <button onClick={() => setActiveTab('list')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'list' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Справочник</button>
                    <button onClick={() => setActiveTab('add_single')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'add_single' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Добавить 1</button>
                    <button onClick={() => setActiveTab('add_bulk')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'add_bulk' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Массово</button>
                </div>
            )}

            {activeTab === 'list' && (
                <div className="space-y-6">
                    {Object.keys(groupedEquip).length === 0 ? <p className="text-center text-gray-500">Техника не найдена</p> :
                        Object.keys(groupedEquip).sort().map(cat => (
                            <div key={cat} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                                <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200 border-b dark:border-gray-700 pb-2">{cat}</h2>
                                <div className="space-y-2">
                                    {groupedEquip[cat].map(eq => (
                                        <div key={eq.id} onClick={() => canEditEquipment ? setSelectedEquip(eq) : null} className={`flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 ${canEditEquipment ? 'cursor-pointer active:scale-[0.98] hover:border-blue-300 dark:hover:border-blue-600 transition-all' : ''}`}>
                                            <div>
                                                <p className="font-bold text-sm dark:text-white flex items-center">
                                                    {eq.name}
                                                    {eq.tg_id && <span className="ml-2 w-2 h-2 rounded-full bg-green-500" title="Аккаунт водителя привязан"></span>}
                                                </p>
                                                {eq.driver && <p className="text-xs text-gray-500 mt-0.5">Водитель: {eq.driver}</p>}
                                            </div>
                                            <div className="text-right">
                                                {eq.status === 'free' ? <span className="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">Свободен</span> : <span className="text-xs font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">В работе</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                </div>
            )}

            {activeTab === 'add_single' && canEditEquipment && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <form onSubmit={handleAddSingle} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Категория</label>
                            <select value={newEquip.category} onChange={e => setNewEquip({ ...newEquip, category: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm dark:text-white">
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                <option value="Своя категория">+ Ввести свою категорию</option>
                            </select>
                        </div>
                        {newEquip.category === 'Своя категория' && (
                            <input type="text" placeholder="Название новой категории" value={customCategory} onChange={e => setCustomCategory(e.target.value)} required className="w-full p-3 border dark:border-gray-600 rounded-xl outline-none text-sm bg-blue-50 dark:bg-gray-700 dark:text-white" />
                        )}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Наименование (Марка/Номер)</label>
                            <input type="text" value={newEquip.name} onChange={e => setNewEquip({ ...newEquip, name: e.target.value })} placeholder="Напр: Экскаватор JCB (Х000ХХ)" required className="w-full p-3 border dark:border-gray-600 rounded-xl outline-none text-sm dark:bg-gray-700 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Штатный водитель (опционально)</label>
                            <input type="text" value={newEquip.driver} onChange={e => setNewEquip({ ...newEquip, driver: e.target.value })} placeholder="Иванов И.И." className="w-full p-3 border dark:border-gray-600 rounded-xl outline-none text-sm dark:bg-gray-700 dark:text-white" />
                        </div>
                        <button type="submit" className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition">Добавить технику</button>
                    </form>
                </div>
            )}

            {activeTab === 'add_bulk' && canEditEquipment && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="mb-4">
                        <label className="block text-xs font-bold text-gray-500 mb-1">Категория для всего списка</label>
                        <select value={newEquip.category} onChange={e => setNewEquip({ ...newEquip, category: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm dark:text-white">
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="Своя категория">+ Ввести свою категорию</option>
                        </select>
                    </div>
                    {newEquip.category === 'Своя категория' && (
                        <input type="text" placeholder="Название новой категории" value={customCategory} onChange={e => setCustomCategory(e.target.value)} required className="w-full p-3 mb-4 border dark:border-gray-600 rounded-xl outline-none text-sm bg-blue-50 dark:bg-gray-700 dark:text-white" />
                    )}
                    <label className="block text-xs font-bold text-gray-500 mb-1">Список (Формат: Название - Водитель)</label>
                    <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder="КАМАЗ 123 - Петров\nКран Ивановец - Сидоров" rows={6} className="w-full p-3 border dark:border-gray-600 rounded-xl outline-none text-sm resize-none mb-4 dark:bg-gray-700 dark:text-white font-mono"></textarea>
                    <button onClick={handleBulkAdd} className="w-full py-3.5 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition">Загрузить список</button>
                </div>
            )}

            {selectedEquip && (
                <div className="fixed inset-0 z-50 bg-black/60 flex justify-center items-end sm:items-center p-0 sm:p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-safe shadow-2xl relative animate-slide-up sm:animate-fade-in">
                        <button onClick={() => setSelectedEquip(null)} className="absolute top-4 right-4 text-gray-400 text-2xl leading-none">&times;</button>
                        <h2 className="text-xl font-bold mb-1 pr-6 dark:text-white">{selectedEquip.name}</h2>
                        <p className="text-sm text-gray-500 mb-6">{selectedEquip.category}</p>

                        <div className="space-y-3 mb-6">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl flex justify-between items-center border border-gray-100 dark:border-gray-600">
                                <div><p className="text-xs text-gray-500 mb-0.5">Штатный водитель</p><p className="font-bold text-sm dark:text-white">{selectedEquip.driver || 'Не указан'}</p></div>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl flex justify-between items-center border border-gray-100 dark:border-gray-600">
                                <div><p className="text-xs text-gray-500 mb-0.5">Привязанный аккаунт</p><p className="font-bold text-sm dark:text-white">{selectedEquip.tg_id ? `ID: ${selectedEquip.tg_id}` : 'Нет привязки'}</p></div>
                                {selectedEquip.tg_id && <button onClick={() => handleUnlink(selectedEquip.id)} className="text-red-500 text-xs font-bold underline">Отвязать</button>}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button onClick={() => generateInviteLink(selectedEquip.id)} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg flex justify-center items-center">🔗 Привязать водителя (Инвайт)</button>
                            <button onClick={() => handleDelete(selectedEquip.id)} className="w-full py-3.5 bg-red-50 dark:bg-red-900/20 text-red-600 font-bold rounded-xl">Удалить из базы</button>
                        </div>
                    </div>
                </div>
            )}

            {inviteInfo && (
                <div className="fixed inset-0 z-[200] bg-black/60 flex justify-center items-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-3xl">🚜</span></div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Привязка техники</h2>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 text-center">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Telegram Бот</p>
                                <p className="text-sm text-gray-800 dark:text-gray-200 break-all">{inviteInfo.tg_bot_link}</p>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 text-center">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">MAX Бот</p>
                                <p className="text-sm text-gray-800 dark:text-gray-200 break-all">{inviteInfo.max_bot_link}</p>
                            </div>
                        </div>

                        {/* КНОПКА СКОПИРОВАТЬ СООБЩЕНИЕ */}
                        <button onClick={copyEquipMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 mb-3 flex justify-center items-center space-x-2">
                            <span>📄</span>
                            <span>Скопировать сообщение</span>
                        </button>

                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold py-3.5 rounded-xl transition-all">Закрыть</button>
                    </div>
                </div>
            )}
        </div>
    );
}
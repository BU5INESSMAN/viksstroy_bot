import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';

export default function Equipment() {
    const navigate = useNavigate();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';
    const { openProfile } = useOutletContext();

    const [equipment, setEquipment] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('list');

    const [newEquip, setNewEquip] = useState({ name: '', driver: '', category: '' });
    const [customCategory, setCustomCategory] = useState('');
    const [bulkText, setBulkText] = useState('');

    const [selectedEquip, setSelectedEquip] = useState(null);
    const [inviteInfo, setInviteInfo] = useState(null);
    const [copiedLink, setCopiedLink] = useState('');

    const canEditEquipment = ['moderator', 'boss', 'superadmin'].includes(role);

    const fetchData = async () => {
        try {
            const [equipRes, dashRes] = await Promise.all([axios.get('/api/equipment/admin_list'), axios.get('/api/dashboard')]);
            setEquipment(equipRes.data || []);
            const cats = dashRes.data?.equip_categories || [];
            setCategories(cats);
            if (cats.length > 0 && !cats.includes(activeTab) && activeTab !== 'list') {
                setActiveTab(cats[0]);
            }
            setLoading(false);
        } catch (e) { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreateEquip = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', newEquip.name);
            fd.append('driver', newEquip.driver);
            fd.append('category', customCategory || newEquip.category);
            fd.append('tg_id', tgId);
            await axios.post('/api/equipment/create', fd);
            setNewEquip({ name: '', driver: '', category: '' });
            setCustomCategory('');
            fetchData();
            alert("Техника добавлена!");
        } catch (e) { alert("Ошибка добавления"); }
    };

    const handleBulkUpload = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('text', bulkText);
            fd.append('tg_id', tgId);
            const res = await axios.post('/api/equipment/bulk_upload', fd);
            setBulkText('');
            fetchData();
            alert(`Успешно загружено единиц: ${res.data.added}`);
        } catch (e) { alert("Ошибка массовой загрузки"); }
    };

    const handleDeleteEquip = async (id) => {
        if (!window.confirm("Удалить эту технику из базы?")) return;
        try {
            const fd = new FormData(); fd.append('tg_id', tgId);
            await axios.post(`/api/equipment/${id}/delete`, fd);
            fetchData();
        } catch (e) { alert("Ошибка удаления"); }
    };

    const handleEquipStatusChange = async (id, newStatus) => {
        try {
            const fd = new FormData(); fd.append('tg_id', tgId); fd.append('status', newStatus);
            await axios.post(`/api/equipment/${id}/status`, fd);
            fetchData();
        } catch (e) { alert("Ошибка изменения статуса"); }
    };

    const generateInvite = async (eq) => {
        try {
            const res = await axios.post(`/api/equipment/${eq.id}/generate_invite`);
            setInviteInfo({...res.data, equipName: eq.name});
            setCopiedLink('');
        } catch (e) { alert("Ошибка генерации ссылки"); }
    };

    const copyToClipboard = (text, linkType) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedLink(linkType);
            setTimeout(() => setCopiedLink(''), 2000);
        });
    };

    const copyEquipMessage = () => {
        const code = inviteInfo.invite_code || inviteInfo.join_password;
        const message = `🚜 Привет! Вот приглашение для привязки техники в «ВИКС Расписание».\n\nМашина: ${inviteInfo.equipName}\n\n📱 Прямая ссылка:\n${inviteInfo.invite_link}\n\n✈️ Ссылка для Telegram бота:\n${inviteInfo.tg_bot_link}\n\n💬 Для мессенджера MAX:\nОтправьте боту Расписания команду:\n/join ${code}`;
        copyToClipboard(message, 'all');
        alert('Сообщение скопировано в буфер обмена!');
    };

    if (loading) return <div className="text-center mt-20 text-gray-500">Загрузка автопарка...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-20">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-100 dark:border-gray-700 gap-4">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">🚜</span> Автопарк</h2>
                {canEditEquipment && (
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setActiveTab('new')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-blue-700 transition">Добавить технику</button>
                        <button onClick={() => setActiveTab('bulk')} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-gray-900 transition">Массовая загрузка</button>
                    </div>
                )}
            </div>

            <div className="flex overflow-x-auto space-x-2 pb-2 scrollbar-hide">
                <button onClick={() => setActiveTab('list')} className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${activeTab === 'list' ? 'bg-blue-600 text-white shadow-blue-500/30' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>Все машины</button>
                {categories.map(c => (
                    <button key={c} onClick={() => setActiveTab(c)} className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${activeTab === c ? 'bg-indigo-600 text-white shadow-indigo-500/30' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>{c}</button>
                ))}
            </div>

            {['list', ...categories].includes(activeTab) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {equipment.filter(e => activeTab === 'list' || e.category === activeTab).map(eq => (
                        <div key={eq.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:border-blue-300 transition-colors">
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{eq.category}</span>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${eq.status === 'free' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : eq.status === 'work' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                                        {eq.status === 'free' ? 'Свободна' : eq.status === 'work' ? 'В работе' : 'Ремонт'}
                                    </span>
                                </div>
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight mb-1">{eq.name}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">👷‍♂️ Водитель: <b>{eq.driver_fio || 'Не назначен'}</b></p>
                            </div>

                            {canEditEquipment && (
                                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-col space-y-2">
                                    <div className="flex space-x-2">
                                        <button onClick={() => openProfile(eq.tg_id, 'equip', eq.id)} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 py-2 rounded-lg text-xs font-bold transition text-center whitespace-nowrap">👤 Профиль</button>
                                        <button onClick={() => generateInvite(eq)} className="flex-[2] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 dark:text-indigo-400 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap">🔗 Дать доступ водителю</button>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button onClick={() => handleEquipStatusChange(eq.id, eq.status === 'repair' ? 'free' : 'repair')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${eq.status === 'repair' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-200' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 hover:bg-red-200'}`}>
                                            {eq.status === 'repair' ? '✅ В строй' : '🛠 В ремонт'}
                                        </button>
                                        <button onClick={() => handleDeleteEquip(eq.id)} className="bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/40 dark:hover:text-red-400 py-2 px-3 rounded-lg text-xs font-bold transition">🗑</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {equipment.filter(e => activeTab === 'list' || e.category === activeTab).length === 0 && (
                        <p className="col-span-full text-center py-10 text-gray-500 italic">В этой категории пока нет техники.</p>
                    )}
                </div>
            )}

            {activeTab === 'new' && canEditEquipment && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-lg mx-auto">
                    <h3 className="text-xl font-bold mb-4 dark:text-white">Добавить машину</h3>
                    <form onSubmit={handleCreateEquip} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Название техники (Марка, гос.номер)</label>
                            <input type="text" value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} required className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Категория</label>
                            <select value={newEquip.category} onChange={e => {setNewEquip({...newEquip, category: e.target.value}); setCustomCategory('');}} className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-2 dark:text-white">
                                <option value="">-- Выберите категорию --</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                <option value="new">Своя категория...</option>
                            </select>
                            {newEquip.category === 'new' && (
                                <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Название новой категории" required className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">ФИО Водителя (по умолчанию)</label>
                            <input type="text" value={newEquip.driver} onChange={e => setNewEquip({...newEquip, driver: e.target.value})} className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow hover:bg-blue-700 transition">Добавить в автопарк</button>
                    </form>
                </div>
            )}

            {activeTab === 'bulk' && canEditEquipment && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mx-auto">
                    <h3 className="text-xl font-bold mb-2 dark:text-white">Массовая загрузка</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Вставьте список. Каждая строка — отдельная машина. <br/>Формат: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">Категория | Название техники | ФИО водителя</code></p>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-xl mb-4 text-xs font-mono text-blue-800 dark:text-blue-300">
                        Экскаваторы | ЭКСКАВАТОР 1 | Иванов И.И.<br/>
                        Самосвалы | САМОСВАЛ 2 | Петров П.П.<br/>
                        Краны | КРАН 3 |
                    </div>

                    <form onSubmit={handleBulkUpload}>
                        <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} required rows={10} className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-4 dark:text-white whitespace-nowrap overflow-auto" placeholder="Вставьте текст сюда..."></textarea>
                        <button type="submit" className="w-full bg-gray-800 dark:bg-gray-600 text-white font-bold py-3.5 rounded-xl shadow hover:bg-gray-900 dark:hover:bg-gray-500 transition">Загрузить список</button>
                    </form>
                </div>
            )}

            {/* ОКНО СО ССЫЛКАМИ ДЛЯ ВОДИТЕЛЯ */}
            {inviteInfo && (
                <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl w-full max-w-sm shadow-2xl relative">
                        <button onClick={() => setInviteInfo(null)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 text-2xl leading-none">&times;</button>
                        <h3 className="text-2xl font-bold mb-1 dark:text-white">Приглашение</h3>
                        <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-4">{inviteInfo.equipName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Скопируйте и отправьте водителю этой техники.</p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">✈️ Для Telegram:</label>
                                <button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition shadow-sm text-blue-600 dark:text-blue-400">
                                    {copiedLink === 'tg' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">🌐 Прямая Web-ссылка:</label>
                                <button onClick={() => copyToClipboard(inviteInfo.invite_link, 'web')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition shadow-sm text-blue-600 dark:text-blue-400">
                                    {copiedLink === 'web' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">💬 Для мессенджера MAX:</label>
                                <div className="w-full text-center px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium shadow-sm flex items-center justify-center">
                                    <code
                                        className="text-blue-600 dark:text-blue-400 font-bold text-lg cursor-pointer"
                                        onClick={() => copyToClipboard(`/join ${inviteInfo.invite_code || inviteInfo.join_password}`, 'max')}
                                    >
                                        {copiedLink === 'max' ? '✅ Скопировано!' : `/join ${inviteInfo.invite_code || inviteInfo.join_password}`}
                                    </code>
                                </div>
                            </div>
                        </div>

                        <button onClick={copyEquipMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 mb-3 flex justify-center items-center space-x-2">
                            <span>📄</span>
                            <span>Скопировать всё сообщение</span>
                        </button>

                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 dark:bg-gray-700 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-gray-900 transition-colors">Готово</button>
                    </div>
                </div>
            )}
        </main>
    );
}
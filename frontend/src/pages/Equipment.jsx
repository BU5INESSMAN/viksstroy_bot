import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
    Truck, Plus, Upload, User, Unplug, Link,
    CheckCircle, Wrench, Trash2, Send, Globe,
    MessageCircle, Copy, X, Search
} from 'lucide-react';

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

    // Разделяем права: foreman может управлять, но удалять может только руководство
    const canManageEquipment = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canDeleteEquipment = ['moderator', 'boss', 'superadmin'].includes(role);

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

    const handleUnlinkEquipment = async (equipId) => {
        if (!window.confirm("Отвязать Telegram/MAX аккаунт водителя от этой техники?")) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/equipment/${equipId}/unlink`, fd);
            fetchData();
        } catch (e) {
            alert("Ошибка при отвязке аккаунта");
        }
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

    if (loading) return (
        <div className="flex flex-col items-center justify-center mt-32 text-gray-400">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-medium animate-pulse">Загрузка автопарка...</p>
        </div>
    );

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 border border-gray-100 dark:border-gray-700 gap-4">
                <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <Truck className="w-7 h-7 text-blue-500 mr-2.5" /> Автопарк
                </h2>
                {canManageEquipment && (
                    <div className="flex flex-wrap gap-2.5">
                        <button onClick={() => setActiveTab('new')} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Добавить
                        </button>
                        <button onClick={() => setActiveTab('bulk')} className="bg-gray-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-gray-900 transition-all active:scale-95 flex items-center gap-2 dark:bg-gray-700 dark:hover:bg-gray-600">
                            <Upload className="w-4 h-4" /> Массовая загрузка
                        </button>
                    </div>
                )}
            </div>

            <div className="flex overflow-x-auto space-x-2.5 pb-2 custom-scrollbar">
                <button onClick={() => setActiveTab('list')} className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>Все машины</button>
                {categories.map(c => (
                    <button key={c} onClick={() => setActiveTab(c)} className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === c ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>{c}</button>
                ))}
            </div>

            {['list', ...categories].includes(activeTab) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {equipment.filter(e => activeTab === 'list' || e.category === activeTab).map(eq => (
                        <div key={eq.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all">
                            <div>
                                <div className="flex justify-between items-start mb-3">
                                    <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider border border-indigo-100 dark:border-indigo-800/50">{eq.category}</span>
                                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 ${eq.status === 'free' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : eq.status === 'work' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50'}`}>
                                        {eq.status === 'free' ? <CheckCircle className="w-3 h-3" /> : eq.status === 'work' ? <Truck className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                                        {eq.status === 'free' ? 'Свободна' : eq.status === 'work' ? 'В работе' : 'Ремонт'}
                                    </span>
                                </div>
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight mb-2">{eq.name}</h3>
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 font-medium bg-gray-50 dark:bg-gray-700/30 p-2.5 rounded-lg border border-gray-100 dark:border-gray-600/50">
                                    <User className="w-4 h-4 text-gray-400" />
                                    <span>Водитель: <b className="text-gray-800 dark:text-gray-200">{eq.driver_fio || 'Не назначен'}</b></span>
                                </div>
                            </div>

                            {canManageEquipment && (
                                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col space-y-2.5">
                                    <div className="flex space-x-2">
                                        <button onClick={() => openProfile(eq.tg_id, 'equip', eq.id)} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 py-2.5 rounded-xl text-xs font-bold transition-colors text-center flex items-center justify-center gap-1.5 active:scale-95">
                                            <User className="w-3.5 h-3.5" /> Профиль
                                        </button>

                                        {eq.tg_id ? (
                                            <button onClick={() => handleUnlinkEquipment(eq.id)} className="flex-[2] bg-orange-50 hover:bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 dark:text-orange-400 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                                                <Unplug className="w-3.5 h-3.5" /> Отвязать водителя
                                            </button>
                                        ) : (
                                            <button onClick={() => generateInvite(eq)} className="flex-[2] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 dark:text-indigo-400 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                                                <Link className="w-3.5 h-3.5" /> Дать доступ
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex space-x-2">
                                        <button onClick={() => handleEquipStatusChange(eq.id, eq.status === 'repair' ? 'free' : 'repair')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95 ${eq.status === 'repair' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 hover:bg-emerald-100' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100'}`}>
                                            {eq.status === 'repair' ? <><CheckCircle className="w-3.5 h-3.5" /> В строй</> : <><Wrench className="w-3.5 h-3.5" /> В ремонт</>}
                                        </button>

                                        {/* Корзина только для руководства! */}
                                        {canDeleteEquipment && (
                                            <button onClick={() => handleDeleteEquip(eq.id)} className="bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 py-2.5 px-4 rounded-xl text-xs font-bold transition-colors active:scale-95 flex items-center justify-center">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {equipment.filter(e => activeTab === 'list' || e.category === activeTab).length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                            <Search className="w-12 h-12 mb-3 opacity-20" />
                            <p className="italic font-medium">В этой категории пока нет техники.</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'new' && canManageEquipment && (
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-lg mx-auto">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
                        <Plus className="w-5 h-5 text-blue-500" /> Добавить машину
                    </h3>
                    <form onSubmit={handleCreateEquip} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Название техники (Марка, гос.номер)</label>
                            <input type="text" value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} required className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Категория</label>
                            <select value={newEquip.category} onChange={e => {setNewEquip({...newEquip, category: e.target.value}); setCustomCategory('');}} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-3 dark:text-white transition-colors">
                                <option value="">-- Выберите категорию --</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                <option value="new">Своя категория...</option>
                            </select>
                            {newEquip.category === 'new' && (
                                <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Название новой категории" required className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">ФИО Водителя (по умолчанию)</label>
                            <input type="text" value={newEquip.driver} onChange={e => setNewEquip({...newEquip, driver: e.target.value})} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98] mt-2">Добавить в автопарк</button>
                    </form>
                </div>
            )}

            {activeTab === 'bulk' && canManageEquipment && (
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mx-auto">
                    <h3 className="text-xl font-bold mb-2 flex items-center gap-2 dark:text-white">
                        <Upload className="w-5 h-5 text-gray-700 dark:text-gray-300" /> Массовая загрузка
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
                        Вставьте список. Каждая строка — отдельная машина. <br/>
                        Формат: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md text-pink-600 dark:text-pink-400 font-bold border border-gray-200 dark:border-gray-600">Категория | Название техники | ФИО водителя</code>
                    </p>

                    <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/50 p-4 rounded-xl mb-6 text-sm font-mono text-indigo-800 dark:text-indigo-300 shadow-inner">
                        Экскаваторы | ЭКСКАВАТОР 1 | Иванов И.И.<br/>
                        Самосвалы | САМОСВАЛ 2 | Петров П.П.<br/>
                        Краны | КРАН 3 |
                    </div>

                    <form onSubmit={handleBulkUpload}>
                        <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} required rows={10} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 mb-5 dark:text-white whitespace-pre font-mono text-sm shadow-inner transition-colors custom-scrollbar" placeholder="Вставьте текст сюда..."></textarea>
                        <button type="submit" className="w-full bg-gray-800 dark:bg-gray-700 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-all active:scale-[0.98]">Загрузить список</button>
                    </form>
                </div>
            )}

            {/* ОКНО СО ССЫЛКАМИ ДЛЯ ВОДИТЕЛЯ */}
            {inviteInfo && (
                <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative border border-gray-100 dark:border-gray-700">
                        <button onClick={() => setInviteInfo(null)} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5">
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-2xl font-bold mb-2 dark:text-white flex items-center gap-2">
                            <Link className="w-6 h-6 text-indigo-500" /> Приглашение
                        </h3>
                        <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-4 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/30">{inviteInfo.equipName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium">Скопируйте и отправьте водителю этой техники.</p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <Send className="w-4 h-4" /> Для Telegram:
                                </label>
                                <button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm text-blue-600 dark:text-blue-400 active:scale-[0.98]">
                                    {copiedLink === 'tg' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <Globe className="w-4 h-4" /> Прямая Web-ссылка:
                                </label>
                                <button onClick={() => copyToClipboard(inviteInfo.invite_link, 'web')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm text-blue-600 dark:text-blue-400 active:scale-[0.98]">
                                    {copiedLink === 'web' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <MessageCircle className="w-4 h-4" /> Для мессенджера MAX:
                                </label>
                                <div className="w-full text-center px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-medium shadow-sm flex items-center justify-center transition-colors">
                                    <code
                                        className="text-blue-600 dark:text-blue-400 font-bold text-lg cursor-pointer hover:opacity-70 active:scale-95"
                                        onClick={() => copyToClipboard(`/join ${inviteInfo.invite_code || inviteInfo.join_password}`, 'max')}
                                    >
                                        {copiedLink === 'max' ? '✅ Скопировано!' : `/join ${inviteInfo.invite_code || inviteInfo.join_password}`}
                                    </code>
                                </div>
                            </div>
                        </div>

                        <button onClick={copyEquipMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] mb-3 flex justify-center items-center gap-2">
                            <Copy className="w-5 h-5" />
                            Скопировать всё сообщение
                        </button>

                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-[0.98]">Готово</button>
                    </div>
                </div>
            )}
        </main>
    );
}
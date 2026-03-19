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
    const [copiedLink, setCopiedLink] = useState('');

    const canEditEquipment = ['moderator', 'boss', 'superadmin'].includes(role);

    const fetchData = async () => {
        try {
            const [equipRes, dashRes] = await Promise.all([axios.get('/api/equipment/admin_list'), axios.get('/api/dashboard')]);
            setEquipment(equipRes.data || []);
            const cats = dashRes.data?.equip_categories || [];
            setCategories(cats);
            if (cats.length > 0 && !newEquip.category) setNewEquip(prev => ({ ...prev, category: cats[0] }));
            setLoading(false);
        } catch (e) { setLoading(false); }
    };

    useEffect(() => {
        if (!['foreman', 'moderator', 'boss', 'superadmin', 'driver', 'worker'].includes(role)) {
            navigate('/dashboard');
        } else {
            fetchData();
        }
    }, [role, navigate]);

    const handleAddSingle = async (e) => { e.preventDefault(); try { const finalCategory = newEquip.category === 'Другое' ? (customCategory.trim() || 'Без категории') : newEquip.category; const fd = new FormData(); fd.append('name', newEquip.name); fd.append('category', finalCategory); fd.append('driver', newEquip.driver || ''); fd.append('tg_id', tgId); await axios.post('/api/equipment/add', fd); setNewEquip({ name: '', driver: '', category: categories[0] || '' }); setCustomCategory(''); alert('Техника успешно добавлена!'); setActiveTab('list'); fetchData(); } catch (e) { alert("Ошибка при добавлении"); } };

    // МАССОВОЕ ДОБАВЛЕНИЕ (Твоя логика с считыванием категории через ;)
    const handleAddBulk = async (e) => {
        e.preventDefault();
        const lines = bulkText.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return alert("Введите хотя бы одну строку");

        const items = lines.map(line => {
            const parts = line.split(';').map(p => p.trim());
            return { category: parts[0] || 'Другое', name: parts[1] || 'Без названия', driver: parts[2] || '' };
        });

        try {
            await axios.post('/api/equipment/bulk_add', { items, tg_id: tgId });
            setBulkText('');
            alert(`Успешно добавлено ${items.length} ед. техники!`);
            setActiveTab('list');
            fetchData();
        } catch (err) { alert("Ошибка массового добавления"); }
    };

    const handleEquipPhotoUpload = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            const fd = new FormData();
            fd.append('photo_base64', reader.result);
            fd.append('tg_id', tgId);
            try {
                const res = await axios.post(`/api/equipment/${selectedEquip.id}/update_photo`, fd);
                setSelectedEquip({...selectedEquip, photo_url: res.data.photo_url});
                fetchData();
            } catch(e) { alert("Ошибка загрузки"); }
        };
        reader.readAsDataURL(file);
    };

    const handleUpdateEquip = async (e) => { e.preventDefault(); try { const fd = new FormData(); fd.append('name', selectedEquip.name); fd.append('category', selectedEquip.category); fd.append('driver', selectedEquip.driver); fd.append('status', selectedEquip.status); fd.append('tg_id', tgId); await axios.post(`/api/equipment/${selectedEquip.id}/update`, fd); alert("Сохранено!"); setSelectedEquip(null); fetchData(); } catch (e) { alert("Ошибка"); } };
    const handleDeleteEquip = async () => { if (!window.confirm(`Удалить технику ${selectedEquip.name}?`)) return; try { const fd = new FormData(); fd.append('tg_id', tgId); await axios.post(`/api/equipment/${selectedEquip.id}/delete`, fd); setSelectedEquip(null); fetchData(); } catch (e) { alert("Ошибка удаления"); } };
    const handleGenerateInvite = async () => { try { const res = await axios.post(`/api/equipment/${selectedEquip.id}/generate_invite`); setInviteInfo(res.data); } catch (err) { alert("Ошибка генерации ссылки!"); } };
    const handleUnlinkDriver = async () => { if (!window.confirm("Отвязать водителя?")) return; try { const fd = new FormData(); fd.append('tg_id', tgId); await axios.post(`/api/equipment/${selectedEquip.id}/unlink`, fd); alert("Водитель отвязан!"); setSelectedEquip({ ...selectedEquip, tg_id: null }); fetchData(); } catch (err) { alert("Ошибка при отвязке"); } };

    const copyToClipboard = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopiedLink(type);
        setTimeout(() => setCopiedLink(''), 2000);
    };

    const copyEquipMessage = () => {
        if (!inviteInfo) return;
        const text = `🚜 Привязка техники!\n\nДля закрепления техники за вашим аккаунтом:\n✈️ Telegram: ${inviteInfo.tg_bot_link}\n📱 MAX: Отправьте боту @id222264297116_bot команду /join ${inviteInfo.join_password}\n🌐 Web: ${inviteInfo.invite_link}`;
        navigator.clipboard.writeText(text);
        alert("Сообщение скопировано в буфер обмена!");
    };

    const getStatusColor = (status) => { if (status === 'work') return 'bg-blue-100 text-blue-700 border-blue-200'; if (status === 'repair') return 'bg-red-100 text-red-700 border-red-200'; return 'bg-emerald-100 text-emerald-700 border-emerald-200'; };
    const getStatusLabel = (status) => { if (status === 'work') return 'В работе'; if (status === 'repair') return 'В ремонте'; return 'Свободна'; };

    const displayCategories = [...categories];
    if (!displayCategories.includes('Другое')) displayCategories.push('Другое');

    const groupedEquipment = displayCategories.reduce((acc, cat) => {
        acc[cat] = equipment.filter(e => e.category === cat || (cat === 'Другое' && !categories.includes(e.category)));
        return acc;
    }, {});

    if (loading) return <div className="text-center mt-20">Загрузка...</div>;

    const isDriver = selectedEquip?.tg_id === Number(tgId);
    const canManageFull = canEditEquipment;
    const canManageStatus = canEditEquipment || isDriver;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
                <button onClick={() => setActiveTab('list')} className={`px-5 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors ${activeTab === 'list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>📋 Список техники</button>
                {canManageFull && (<><button onClick={() => setActiveTab('add_single')} className={`px-5 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors ${activeTab === 'add_single' ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>➕ Добавить одну</button><button onClick={() => setActiveTab('add_bulk')} className={`px-5 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors ${activeTab === 'add_bulk' ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>📦 Массовая загрузка</button></>)}
            </div>

            {activeTab === 'list' && (
                <div>
                    {displayCategories.map(cat => groupedEquipment[cat]?.length > 0 && (
                        <div key={cat} className="mb-8">
                            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">{cat}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {groupedEquipment[cat].map(eq => (
                                    <div key={eq.id} onClick={() => setSelectedEquip(eq)} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group flex items-center space-x-4">
                                        <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-700 bg-cover bg-center flex-shrink-0 flex items-center justify-center border border-gray-200 dark:border-gray-600" style={{ backgroundImage: eq.photo_url ? `url(${eq.photo_url})` : 'none' }}>{!eq.photo_url && <span className="text-3xl opacity-50">🚜</span>}</div>
                                        <div className="flex-1 overflow-hidden"><p className="font-bold text-gray-900 dark:text-white truncate">{eq.name}</p><p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2 truncate">{eq.driver || 'Водитель не указан'}</p><span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${getStatusColor(eq.status)}`}>{getStatusLabel(eq.status)}</span></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'add_single' && canManageFull && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 max-w-2xl"><h3 className="text-xl font-bold mb-6 text-gray-800 dark:text-white">Добавление новой техники</h3><form onSubmit={handleAddSingle} className="space-y-5"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-gray-600 dark:text-gray-300 mb-1">Название техники <span className="text-red-500">*</span></label><input type="text" required value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} placeholder="Напр.: Кран Ивановец 25т" className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label className="block text-sm font-bold text-gray-600 dark:text-gray-300 mb-1">ФИО водителя</label><input type="text" value={newEquip.driver} onChange={e => setNewEquip({...newEquip, driver: e.target.value})} placeholder="Напр.: Иванов И.И." className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div><div><label className="block text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Категория</label><div className="flex flex-wrap gap-2">{displayCategories.map(cat => (<button key={cat} type="button" onClick={() => setNewEquip({...newEquip, category: cat})} className={`px-4 py-2 text-sm font-bold rounded-xl border transition-colors ${newEquip.category === cat ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{cat}</button>))}</div>{newEquip.category === 'Другое' && (<input type="text" required placeholder="Напишите свою категорию..." value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="mt-3 w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />)}</div><button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-transform transform hover:-translate-y-0.5">Сохранить в базу</button></form></div>
            )}

            {activeTab === 'add_bulk' && canManageFull && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 max-w-2xl">
                    <h3 className="text-xl font-bold mb-2 text-gray-800 dark:text-white">Массовая загрузка</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Формат: <b className="text-blue-600 dark:text-blue-400">Категория ; Название ; ФИО</b></p>
                    <form onSubmit={handleAddBulk}>
                        <textarea required rows="8" placeholder="Спецтехника ; Кран Ивановец ; Петров П.П." value={bulkText} onChange={e => setBulkText(e.target.value)} className="w-full p-4 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none font-mono text-sm mb-4 dark:text-white" />
                        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-lg">Загрузить список</button>
                    </form>
                </div>
            )}

            {selectedEquip && (
                <div className="fixed inset-0 z-[110] bg-black/60 overflow-y-auto backdrop-blur-sm"><div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24"><div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden transition-colors"><div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 relative flex flex-col items-center justify-center text-white"><button onClick={() => setSelectedEquip(null)} className="absolute top-4 right-5 text-gray-300 hover:text-white text-3xl leading-none font-light">&times;</button>
                <label className={`relative mt-4 mb-4 block ${canManageStatus ? 'group cursor-pointer' : ''}`}>
                    <div className="w-32 h-32 rounded-2xl bg-gray-700 border-4 border-gray-600 shadow-xl bg-cover bg-center flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105" style={{ backgroundImage: selectedEquip.photo_url ? `url(${selectedEquip.photo_url})` : 'none' }}>{!selectedEquip.photo_url && <span className="text-5xl opacity-50">🚜</span>}</div>
                    {canManageStatus && (<><div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-xs font-bold text-white text-center px-2">Загрузить</span></div><input type="file" accept="image/*" className="hidden" onChange={handleEquipPhotoUpload} /></>)}
                </label>
                <input type="text" disabled={!canManageFull} value={selectedEquip.name} onChange={e => setSelectedEquip({...selectedEquip, name: e.target.value})} className="bg-transparent text-center text-2xl font-bold border-b border-transparent focus:border-white outline-none w-full mb-1 disabled:opacity-100" /><span className={`text-xs font-extrabold uppercase px-3 py-1 rounded-full border mt-2 ${getStatusColor(selectedEquip.status)}`}>{getStatusLabel(selectedEquip.status)}</span></div><div className="p-6 space-y-6"><form onSubmit={handleUpdateEquip} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Категория</label><select disabled={!canManageFull} value={selectedEquip.category} onChange={e => setSelectedEquip({...selectedEquip, category: e.target.value})} className="w-full p-2.5 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-medium disabled:opacity-70">{displayCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Статус машины</label><select disabled={!canManageStatus} value={selectedEquip.status} onChange={e => setSelectedEquip({...selectedEquip, status: e.target.value})} className="w-full p-2.5 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium disabled:opacity-70"><option value="free">🟢 Свободна</option><option value="work" disabled>🔵 В работе на объекте (авто)</option><option value="repair">🔴 В ремонте</option></select></div></div><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Текстовое ФИО</label><input type="text" disabled={!canManageFull} value={selectedEquip.driver} onChange={e => setSelectedEquip({...selectedEquip, driver: e.target.value})} className="w-full p-2.5 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-medium disabled:opacity-70" /></div><div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 p-4 rounded-xl"><h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">Привязка Мессенджера</h4>{selectedEquip.tg_id ? (<div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-blue-200 dark:border-blue-700/50"><div className="flex items-center text-sm font-medium text-gray-800 dark:text-gray-200"><span className="text-green-500 mr-2 text-lg">✓</span> Профиль привязан</div>{canManageFull && <button type="button" onClick={handleUnlinkDriver} className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg hover:bg-red-100 transition">Отвязать</button>}</div>) : (<div className="flex flex-col sm:flex-row gap-2">{canManageFull ? (<button type="button" onClick={handleGenerateInvite} className="flex-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 text-xs font-bold py-2.5 rounded-lg shadow-sm hover:bg-blue-100 transition">🔗 Привязать водителя (Инвайт)</button>) : (<p className="text-xs text-gray-500">Нет привязанного профиля.</p>)}</div>)}</div>{canManageStatus && (<div className="flex justify-between items-center pt-4 border-t dark:border-gray-700 mt-6">{canManageFull ? <button type="button" onClick={handleDeleteEquip} className="text-red-500 font-bold text-sm bg-red-50 px-4 py-2.5 rounded-xl hover:bg-red-100 transition">🗑 Удалить</button> : <div></div>}<button type="submit" className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-md hover:bg-blue-700 transition">💾 Сохранить</button></div>)}</form></div></div></div></div>
            )}

            {/* ОКНО ПРИГЛАШЕНИЯ С 3-МЯ ВАРИАНТАМИ */}
            {inviteInfo && (
                <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-2xl w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4 text-center dark:text-white">Приглашение</h3>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">✈️ Telegram Бот:</label>
                                <button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition shadow-sm text-blue-600 dark:text-blue-400">
                                    {copiedLink === 'tg' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">📱 MAX Бот (Скопировать команду):</label>
                                <button onClick={() => copyToClipboard(`/join ${inviteInfo.join_password}`, 'max')} className="w-full text-center px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-lg font-mono tracking-widest font-bold bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition shadow-sm text-blue-600 dark:text-blue-400">
                                    {copiedLink === 'max' ? '✅ Скопировано!' : `/join ${inviteInfo.join_password}`}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">🌐 Прямая Web-ссылка:</label>
                                <button onClick={() => copyToClipboard(inviteInfo.invite_link, 'web')} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition shadow-sm text-blue-600 dark:text-blue-400">
                                    {copiedLink === 'web' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                                </button>
                            </div>
                        </div>

                        <button onClick={copyEquipMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 mb-3 flex justify-center items-center space-x-2">
                            <span>📄</span>
                            <span>Скопировать всё сообщение</span>
                        </button>

                        <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-800 dark:bg-gray-700 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-gray-900 transition">Готово</button>
                    </div>
                </div>
            )}
        </main>
    );
}
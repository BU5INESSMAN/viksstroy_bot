import { useEffect, useState } from 'react';
import axios from 'axios';

const getSmartDates = () => {
    const today = new Date();
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const labels = ['Сегодня', 'Завтра', 'Послезавтра'];
    return [0, 1, 2].map(i => {
        const d = new Date(today); d.setDate(today.getDate() + i);
        return { val: d.toISOString().split('T')[0], label: `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}, ${days[d.getDay()]} (${labels[i]})` };
    });
};

export default function Home() {
    const smartDates = getSmartDates();
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';

    const [data, setData] = useState({ stats: {}, teams: [], equipment: [], equip_categories: [], active_apps: [] });
    const [activeApp, setActiveApp] = useState(null);
    const [loading, setLoading] = useState(true);

    const [isAppModalOpen, setAppModalOpen] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);
    const [activeEqCategory, setActiveEqCategory] = useState(null);
    const [appForm, setAppForm] = useState({ date_target: smartDates[0].val, object_address: '', team_id: '', members: [], equipment: [], comment: '' });

    const fetchData = () => {
        axios.get('/api/dashboard').then(res => setData(res.data)).catch(() => {});
        axios.get(`/api/applications/active?tg_id=${tgId}`).then(res => setActiveApp(res.data)).catch(() => setActiveApp(null));
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    useEffect(() => {
        if (appForm.team_id) {
            axios.get(`/api/teams/${appForm.team_id}/details`).then(res => {
                setTeamMembers(res.data?.members || []);
                setAppForm(prev => ({ ...prev, members: (res.data?.members || []).map(m => m.id) }));
            }).catch(() => setTeamMembers([]));
        } else setTeamMembers([]);
    }, [appForm.team_id]);

    const toggleAppMember = (id) => { setAppForm(prev => ({ ...prev, members: prev.members?.includes(id) ? prev.members.filter(m => m !== id) : [...(prev.members || []), id] })); };
    const toggleEquipmentSelection = (equip) => {
        setAppForm(prev => {
            const exists = prev.equipment.find(e => e.id === equip.id);
            if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== equip.id) };
            const displayName = equip.driver ? `${equip.name} (${equip.driver})` : equip.name;
            return { ...prev, equipment: [...prev.equipment, { id: equip.id, name: displayName, time_start: '08', time_end: '17' }] };
        });
    };
    const updateEquipmentTime = (id, field, value) => { setAppForm(prev => ({ ...prev, equipment: prev.equipment.map(e => e.id === id ? { ...e, [field]: value } : e) })); };

    const handleCreateApp = async (e) => {
        e.preventDefault();
        if (!appForm.team_id && appForm.equipment.length === 0) return alert("Выберите бригаду или добавьте технику!");
        if (!appForm.team_id) {
            if (!window.confirm("Создать заявку БЕЗ рабочих (только техника)?")) return;
        } else if (appForm.members.length === 0) {
            return alert("Выберите хотя бы одного рабочего из состава бригады!");
        }
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId); fd.append('date_target', appForm.date_target); fd.append('object_address', appForm.object_address);
            fd.append('team_id', appForm.team_id || '0'); fd.append('comment', appForm.comment); fd.append('selected_members', appForm.members.join(','));
            fd.append('equipment_data', JSON.stringify(appForm.equipment));
            await axios.post('/api/applications/create', fd);
            setAppModalOpen(false); fetchData(); alert("Отправлено на модерацию!");
        } catch (err) { alert("Ошибка создания"); }
    };

    const handlePublishAppsClick = () => {
        if(!window.confirm('Отправить все одобренные наряды в чат?')) return;
        const fd = new FormData(); fd.append('tg_id', tgId);
        axios.post('/api/applications/publish', fd).then(res => { alert(`Опубликовано: ${res.data.published}`); fetchData(); }).catch(() => alert("Ошибка публикации"));
    };

    let activeEquipText = activeApp?.equip_name || 'Не требуется';
    if (activeApp?.equipment_data) { try { const eqList = JSON.parse(activeApp.equipment_data); if (eqList && eqList.length > 0) activeEquipText = eqList.map(e => `${e.name} (${e.time_start}:00-${e.time_end}:00)`).join(', '); } catch(e){} }

    if (loading) return <div className="text-center mt-20">Загрузка...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {['moderator', 'boss', 'superadmin'].includes(role) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard title="Заявок сегодня" value={data?.stats?.today_total || 0} color="blue" />
                  <StatCard title="Одобрено" value={data?.stats?.today_approved || 0} color="green" text="text-green-600 dark:text-green-400" />
                  <StatCard title="Отклонено" value={data?.stats?.today_rejected || 0} color="red" text="text-red-600 dark:text-red-400" />
                  <StatCard title="Ожидают" value={data?.stats?.waiting_publish || 0} color="yellow" text="text-yellow-600 dark:text-yellow-400" />
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border-l-4 border-blue-500 relative h-fit">
                    <h2 className="text-lg font-bold mb-2 flex items-center">📋 Действующий наряд</h2>
                    {activeApp ? (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 text-sm space-y-2">
                           <p><b>Дата:</b> {activeApp.date_target}</p><p><b>Объект:</b> {activeApp.object_address}</p><p><b>Техника:</b> {activeEquipText}</p><p><b>Бригада:</b> {activeApp.team_id ? activeApp.team_name : 'Без бригады'}</p>
                        </div>
                    ) : (<p className="text-center text-blue-600 dark:text-blue-400 font-medium text-sm p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">Активных нарядов пока нет.</p>)}
                </div>

                {['foreman', 'boss', 'superadmin', 'moderator'].includes(role) && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 h-fit">
                        <h2 className="text-lg font-bold mb-4 flex items-center">⚙️ Панель действий</h2>
                        <div className="space-y-3">
                        {['foreman', 'boss', 'superadmin'].includes(role) && (<button onClick={() => setAppModalOpen(true)} className="w-full bg-blue-600 text-white py-3 rounded-lg shadow hover:bg-blue-700 font-medium">📝 Создать заявку</button>)}
                        {['moderator', 'boss', 'superadmin'].includes(role) && (<button onClick={handlePublishAppsClick} className="w-full bg-emerald-500 text-white py-3 rounded-lg shadow hover:bg-emerald-600 font-medium">📤 Отправить наряды в группу</button>)}
                        </div>
                    </div>
                )}
            </div>

            {isAppModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity"><div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24"><div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden"><div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"><h3 className="text-xl font-bold dark:text-white">Создание заявки</h3><button onClick={() => setAppModalOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold transition">&times;</button></div><form onSubmit={handleCreateApp} className="p-6 space-y-6 text-sm"><div className="space-y-4"><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">📅 Дата выезда</label><input type="date" required value={appForm.date_target} onChange={e => setAppForm({...appForm, date_target: e.target.value})} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg outline-none font-bold text-gray-800 dark:text-gray-100 shadow-sm mb-2" /><div className="flex flex-wrap gap-2">{smartDates.map(d => (<button key={d.val} type="button" onClick={() => setAppForm({...appForm, date_target: d.val})} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${appForm.date_target === d.val ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-sm' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{d.label}</button>))}</div></div><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">📍 Адрес объекта</label><input type="text" id="address_field" name="address" required value={appForm.object_address} onChange={e => setAppForm({...appForm, object_address: e.target.value})} placeholder="г. Москва, ул. Ленина, 10" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 rounded-lg outline-none font-medium dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500" /></div></div><hr className="dark:border-gray-700" /><div className="space-y-3"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">👥 Выбор Бригады</label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setAppForm({...appForm, team_id: ''})} className={`px-4 py-2 text-sm font-medium rounded-xl border transition ${!appForm.team_id ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>❌ Без бригады</button>{data?.teams?.map(t => (<button key={t.id} type="button" onClick={() => setAppForm({...appForm, team_id: t.id})} className={`px-4 py-2 text-sm font-medium rounded-xl border transition ${Number(appForm.team_id) === t.id ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>🏗 {t.name}</button>))}</div>{teamMembers?.length > 0 && (<div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50 shadow-inner"><label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wide">Состав на выезд</label><div className="flex flex-wrap gap-2">{teamMembers.map(m => { const isSelected = appForm?.members?.includes(m.id); return (<button key={m.id} type="button" onClick={() => toggleAppMember(m.id)} className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition flex items-center ${isSelected ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}>{isSelected ? <span className="mr-1.5 text-white font-bold">✓</span> : <span className="mr-1.5 opacity-0">✓</span>} {m.fio}</button>);})}</div></div>)}</div><hr className="dark:border-gray-700" /><div className="space-y-3"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">🚜 Требуемая техника</label><div className="flex flex-wrap gap-2 mb-2">{data?.equip_categories?.map(cat => (<button key={cat} type="button" onClick={() => setActiveEqCategory(activeEqCategory === cat ? null : cat)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${activeEqCategory === cat ? 'bg-indigo-500 text-white border-indigo-600 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{cat}</button>))}</div>{activeEqCategory && (<div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 shadow-inner"><p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Техника в категории «{activeEqCategory}»:</p><div className="flex flex-wrap gap-2">{data.equipment?.filter(e => e.category === activeEqCategory || (activeEqCategory === 'Другое' && !data.equip_categories.includes(e.category))).map(e => { let statusState = 'free'; let alertMsg = ''; if (e.status === 'repair') { statusState = 'repair'; alertMsg = 'Техника в ремонте.'; } else if (data.active_apps) { const appsOnDate = data.active_apps.filter(a => a.date_target === appForm.date_target); for (const a of appsOnDate) { try { const eqList = JSON.parse(a.equipment_data || '[]'); if (eqList.some(eqq => eqq.id === e.id)) { statusState = 'busy'; alertMsg = `Занята на объекте:\n📍 ${a.object_address}`; break; } } catch(err) {} } } const isSelected = appForm.equipment.some(eq => eq.id === e.id); const displayName = e.driver ? `${e.name} (${e.driver})` : e.name; let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100'; if (statusState === 'repair') btnStyles = 'bg-red-50 border-red-300 text-red-600 dark:bg-red-900/30 cursor-not-allowed opacity-75'; else if (statusState === 'busy') btnStyles = 'bg-yellow-50 border-yellow-300 text-yellow-700 dark:bg-yellow-900/30 cursor-not-allowed opacity-80'; else if (isSelected) btnStyles = 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shadow-sm'; return (<button key={e.id} type="button" onClick={() => { if (statusState !== 'free') return alert(alertMsg); toggleEquipmentSelection({id: e.id, name: displayName, driver: e.driver}); }} className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition flex items-center ${btnStyles}`}>{isSelected && <span className="mr-1.5 font-bold">✓</span>}{statusState === 'repair' && <span className="mr-1.5">🛠</span>}{statusState === 'busy' && <span className="mr-1.5">⏳</span>}{displayName}</button>); })}{data.equipment?.filter(e => e.category === activeEqCategory).length === 0 && <p className="text-xs text-gray-400 italic">Нет доступной техники</p>}</div></div>)}{appForm.equipment.length > 0 && (<div className="mt-4 space-y-3 p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/50 shadow-inner"><label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide border-b border-indigo-200 dark:border-indigo-800 pb-2 mb-3">Время работы для каждой машины:</label>{appForm.equipment.map(eq => (<div key={eq.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-indigo-100 dark:border-indigo-700/50 shadow-sm gap-3"><p className="font-bold text-gray-800 dark:text-gray-200 text-sm">🚜 {eq.name}</p><div className="flex items-center space-x-2"><div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-1.5 text-xs font-bold text-gray-500 border-r dark:border-gray-600">С</span><input type="number" min="0" max="23" value={eq.time_start} onChange={e => updateEquipmentTime(eq.id, 'time_start', e.target.value)} className="w-12 text-center py-1.5 text-sm font-bold focus:outline-none dark:bg-gray-800 dark:text-white" /><span className="pr-2 font-bold text-gray-400 text-sm">:00</span></div><span className="text-gray-400 font-bold">—</span><div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-1.5 text-xs font-bold text-gray-500 border-r dark:border-gray-600">ДО</span><input type="number" min="0" max="23" value={eq.time_end} onChange={e => updateEquipmentTime(eq.id, 'time_end', e.target.value)} className="w-12 text-center py-1.5 text-sm font-bold focus:outline-none dark:bg-gray-800 dark:text-white" /><span className="pr-2 font-bold text-gray-400 text-sm">:00</span></div></div></div>))}</div>)}</div><hr className="dark:border-gray-700" /><div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">💬 Комментарий</label><input type="text" value={appForm.comment} onChange={e => setAppForm({...appForm, comment: e.target.value})} placeholder="Дополнительная информация..." className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-3 rounded-lg outline-none dark:text-white shadow-sm" /></div><div className="flex space-x-3 pt-4"><button type="button" onClick={() => setAppModalOpen(false)} className="w-1/3 bg-gray-100 dark:bg-gray-700 py-3.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition">Отмена</button><button type="submit" className="w-2/3 bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition transform hover:scale-[1.02]">Отправить заявку</button></div></form></div></div></div>
            )}
        </main>
    );
}

function StatCard({ title, value, color, text = "text-gray-900 dark:text-gray-100" }) {
  const borders = { blue: 'border-blue-500', green: 'border-emerald-500', red: 'border-red-500', yellow: 'border-yellow-500' };
  return (<div className={`bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 ${borders[color]}`}><p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">{title}</p><p className={`text-3xl font-bold ${text}`}>{value}</p></div>);
}
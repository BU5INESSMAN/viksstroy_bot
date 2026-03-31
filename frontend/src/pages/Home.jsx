import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
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

const getTodayStr = () => {
    try {
        return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Barnaul'}).format(new Date());
    } catch(e) {
        return new Date().toISOString().split('T')[0];
    }
};

const KanbanCol = ({ title, icon, colorClass, apps, isOpen, toggleOpen, onAppClick }) => {
    const [showAll, setShowAll] = useState(false);
    const displayedApps = showAll ? apps : apps.slice(0, 10);

    return (
        <div className="flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <button onClick={toggleOpen} className={`p-4 flex justify-between items-center w-full text-left font-bold ${colorClass} transition-colors lg:cursor-default`}>
                <span className="flex items-center">
                    <span className="mr-2 text-xl">{icon}</span> {title}
                    <span className="ml-2 bg-white/60 dark:bg-black/20 text-gray-800 dark:text-white text-xs px-2 py-0.5 rounded-full">{apps.length}</span>
                </span>
                <span className="lg:hidden">{isOpen ? '▲' : '▼'}</span>
            </button>
            <div className={`p-3 space-y-3 bg-gray-50 dark:bg-gray-900/30 min-h-[100px] ${isOpen ? 'block' : 'hidden lg:block'}`}>
                {displayedApps.map(a => {
                    let equipList = [];
                    if (a.equipment_data) {
                        try {
                            const parsed = JSON.parse(a.equipment_data);
                            if (parsed && parsed.length > 0) {
                                equipList = parsed;
                            }
                        } catch(e) {}
                    }

                    return (
                        <div key={a.id} onClick={() => onAppClick(a)} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-sm cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors group">
                            <p className="font-bold text-gray-800 dark:text-gray-100 mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400">{a.object_address}</p>

                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 font-medium">👷‍♂️ {a.foreman_name || 'Неизвестный прораб'}</p>

                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">📅 {a.date_target}</p>

                            <p className="text-xs text-gray-600 dark:text-gray-300 truncate mb-1">
                                👥 <span className={a.is_team_freed === 1 ? 'line-through text-gray-400' : 'font-medium'}>{a.team_name || 'Без бригады'}</span>
                                {a.is_team_freed === 1 ? <span className="ml-1 text-[10px] text-emerald-500 font-bold">Свободна</span> : null}
                            </p>

                            {equipList.length > 0 && (
                                <div className="mt-1.5 space-y-0.5">
                                    {equipList.map((eq, idx) => (
                                        <p key={idx} className={`text-xs truncate ${eq.is_freed ? 'text-gray-400 line-through' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                            🚜 {eq.name.split('(')[0].trim()} {eq.is_freed ? '✅' : ''}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {apps.length === 0 && <p className="text-xs text-gray-400 text-center py-4 italic">Нет заявок</p>}

                {apps.length > 10 && (
                    <button onClick={() => setShowAll(!showAll)} className="w-full mt-2 py-2 text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg transition-colors">
                        {showAll ? 'Свернуть 🔼' : `Показать все (${apps.length}) 🔽`}
                    </button>
                )}
            </div>
        </div>
    );
};

export default function Home() {
    const smartDates = getSmartDates();
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || 'Гость';
    const { isGlobalCreateAppOpen, setGlobalCreateAppOpen, openProfile } = useOutletContext();

    const [data, setData] = useState({ stats: {}, teams: [], equipment: [], equip_categories: [], kanban_apps: [], recent_addresses: [] });
    const [activeApps, setActiveApps] = useState([]);
    const [myTeam, setMyTeam] = useState(null);
    const [loading, setLoading] = useState(true);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const [teamMembers, setTeamMembers] = useState([]);
    const [activeEqCategory, setActiveEqCategory] = useState(null);

    const [appForm, setAppForm] = useState({
        id: null,
        status: '',
        date_target: smartDates[0].val,
        object_address: '',
        team_ids: [],
        team_name: '',
        members: [],
        members_data: [],
        equipment: [],
        comment: '',
        isViewOnly: false,
        foreman_id: null,
        foreman_name: '',
        is_team_freed: 0,
        freed_team_ids: []
    });

    const [openKanban, setOpenKanban] = useState({ waiting: true, approved: false, published: false, completed: false });
    const [freeModal, setFreeModal] = useState({ isOpen: false, type: '', app: null, teamId: null, inputValue: '' });

    const fetchData = () => {
        axios.get(`/api/dashboard?tg_id=${tgId}`).then(res => setData(res.data)).catch(() => {});
        axios.get(`/api/applications/active?tg_id=${tgId}`).then(res => { setActiveApps(res.data || []); setLoading(false); }).catch(() => { setActiveApps([]); setLoading(false); });

        if (['worker', 'foreman', 'boss', 'superadmin'].includes(role)) {
            axios.get(`/api/users/${tgId}/profile`).then(res => {
                if (res.data?.profile?.team_id) {
                    axios.get(`/api/teams/${res.data.profile.team_id}/details`).then(tRes => setMyTeam(tRes.data));
                }
            }).catch(()=>{});
        }
    };

    useEffect(() => { fetchData(); }, [tgId, role]);

    useEffect(() => {
        if (!isGlobalCreateAppOpen) {
            setAppForm({ id: null, status: '', date_target: smartDates[0].val, object_address: '', team_ids: [], team_name: '', members: [], members_data: [], equipment: [], comment: '', isViewOnly: false, foreman_id: null, foreman_name: '', is_team_freed: 0, freed_team_ids: [] });
            setActiveEqCategory(null);
            setTeamMembers([]);
            setIsSubmitting(false);
        }
    }, [isGlobalCreateAppOpen]);

    useEffect(() => {
        if (appForm.team_ids && appForm.team_ids.length > 0) {
            Promise.all(appForm.team_ids.map(id => axios.get(`/api/teams/${id}/details`)))
                .then(responses => {
                    const allMembers = responses.flatMap(res => res.data?.members || []);
                    const uniqueMembers = Array.from(new Map(allMembers.map(m => [m.id, m])).values());
                    setTeamMembers(uniqueMembers);

                    if(!appForm.isViewOnly && !appForm.id) {
                        setAppForm(prev => ({ ...prev, members: uniqueMembers.map(m => m.id) }));
                    }
                }).catch(() => setTeamMembers([]));
        } else {
            setTeamMembers([]);
        }
    }, [appForm.team_ids.join(',')]);

    const handleFormChange = (field, value) => { if(!appForm.isViewOnly) setAppForm(prev => ({ ...prev, [field]: value })); };

    const toggleTeamSelection = (id) => {
        if(appForm.isViewOnly) return;
        setAppForm(prev => {
            const newIds = prev.team_ids.includes(id) ? prev.team_ids.filter(x => x !== id) : [...prev.team_ids, id];
            return { ...prev, team_ids: newIds };
        });
    };

    const toggleAppMember = (id) => { if(!appForm.isViewOnly) setAppForm(prev => ({ ...prev, members: prev.members?.includes(id) ? prev.members.filter(m => m !== id) : [...(prev.members || []), id] })); };

    const checkTeamStatus = (team_id) => {
        if (data.kanban_apps) {
            const appsOnDate = data.kanban_apps.filter(a => a.date_target === appForm.date_target && ['approved', 'published'].includes(a.status));
            for (const a of appsOnDate) {
                const tIds = a.team_id ? String(a.team_id).split(',').map(Number) : [];
                if (tIds.includes(team_id) && appForm.id !== a.id) return { state: 'busy', message: `Эта бригада уже занята в этот день на объекте:\n📍 ${a.object_address}` };
            }
        }
        return { state: 'free' };
    };

    const checkEquipStatus = (equip) => {
        if (equip.status === 'repair') return { state: 'repair', message: 'Техника в ремонте.' };
        if (data.kanban_apps) {
            const appsOnDate = data.kanban_apps.filter(a => a.date_target === appForm.date_target && ['approved', 'published'].includes(a.status));
            for (const a of appsOnDate) {
                try {
                    const eqList = JSON.parse(a.equipment_data || '[]');
                    if (eqList.some(eqq => eqq.id === equip.id) && appForm.id !== a.id) return { state: 'busy', message: `Занята на объекте:\n📍 ${a.object_address}` };
                } catch(e) {}
            }
        }
        return { state: 'free' };
    };

    const toggleEquipmentSelection = (equip) => {
        if(appForm.isViewOnly) return;
        setAppForm(prev => {
            const exists = prev.equipment.find(e => e.id === equip.id);
            if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== equip.id) };
            const displayName = equip.driver ? `${equip.name} (${equip.driver})` : equip.name;
            return { ...prev, equipment: [...prev.equipment, { id: equip.id, name: displayName, time_start: '08', time_end: '17' }] };
        });
    };
    const updateEquipmentTime = (id, field, value) => { if(!appForm.isViewOnly) setAppForm(prev => ({ ...prev, equipment: prev.equipment.map(e => e.id === id ? { ...e, [field]: value } : e) })); };

    const handleCreateApp = async (e) => {
        e.preventDefault();
        if(appForm.isViewOnly) { setGlobalCreateAppOpen(false); return; }
        if (appForm.team_ids.length === 0 && appForm.equipment.length === 0) return alert("Выберите бригаду или технику!");
        if (appForm.team_ids.length === 0 && !window.confirm("Создать заявку ТОЛЬКО на технику (без людей)?")) return;
        if (appForm.team_ids.length > 0 && appForm.members.length === 0) return alert("Выберите хотя бы одного рабочего из бригады!");

        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId); fd.append('date_target', appForm.date_target); fd.append('object_address', appForm.object_address);
            fd.append('team_id', appForm.team_ids.join(',') || '0');
            fd.append('comment', appForm.comment); fd.append('selected_members', appForm.members.join(','));
            fd.append('equipment_data', JSON.stringify(appForm.equipment));

            if (appForm.id) {
                await axios.post(`/api/applications/${appForm.id}/update`, fd);
                alert("Заявка успешно обновлена!");
            } else {
                await axios.post('/api/applications/create', fd);
                alert("Успешно отправлено на модерацию!");
            }

            setGlobalCreateAppOpen(false); fetchData();
        } catch (err) {
            alert(err.response?.data?.detail || "Ошибка сохранения");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteApp = async () => {
        if (!window.confirm("ВНИМАНИЕ! Вы уверены, что хотите полностью УДАЛИТЬ эту заявку из системы? Это действие необратимо!")) return;
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/applications/${appForm.id}/delete`, fd);
            alert("Заявка успешно удалена!");
            setGlobalCreateAppOpen(false);
            fetchData();
        } catch (err) {
            alert(err.response?.data?.detail || "Ошибка при удалении заявки.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const openAppModalFromKanban = (app) => {
        setAppForm({
            id: app.id,
            status: app.status,
            date_target: app.date_target,
            object_address: app.object_address,
            team_ids: app.team_id ? String(app.team_id).split(',').map(Number) : [],
            team_name: app.team_name || '',
            members: app.selected_members ? app.selected_members.split(',').map(Number) : [],
            members_data: app.members_data || [],
            equipment: app.equipment_data ? JSON.parse(app.equipment_data) : [],
            comment: app.comment || '',
            isViewOnly: true,
            foreman_id: app.foreman_id,
            foreman_name: app.foreman_name,
            is_team_freed: app.is_team_freed,
            freed_team_ids: app.freed_team_ids ? app.freed_team_ids.split(',').map(Number) : []
        });
        setGlobalCreateAppOpen(true);
    };

    const openFreeModal = (type, dataPayload) => {
        if (type === 'specific_team') {
            setFreeModal({ isOpen: true, type, app: dataPayload.app, teamId: dataPayload.teamId, inputValue: '' });
        } else {
            setFreeModal({ isOpen: true, type, app: dataPayload, teamId: null, inputValue: '' });
        }
    };

    const executeFree = async () => {
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            if (freeModal.type === 'equipment') {
                await axios.post(`/api/applications/${freeModal.app.id}/free_equipment`, fd);
                alert("Успешно! Вы переведены в статус 'Свободен'.");
            } else if (freeModal.type === 'team') {
                await axios.post(`/api/applications/${freeModal.app.id}/free_team`, fd);
                alert("Успешно! Все бригады переведены в статус 'Свободны'.");
            } else if (freeModal.type === 'specific_team') {
                fd.append('team_id', freeModal.teamId);
                await axios.post(`/api/applications/${freeModal.app.id}/free_team`, fd);
                alert("Успешно! Выбранная бригада переведена в статус 'Свободна'.");
            }
            setFreeModal({ isOpen: false, type: '', app: null, teamId: null, inputValue: '' });
            fetchData();
            if (isGlobalCreateAppOpen) setGlobalCreateAppOpen(false); // Закрываем модалку заявки, чтобы обновить данные
        } catch(e) {
            alert(e.response?.data?.detail || "Ошибка при освобождении.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const todayYYYYMMDD = getTodayStr();
    const appsMap = { waiting: [], approved: [], published: [], completed: [] };

    if (data.kanban_apps) {
        data.kanban_apps.forEach(a => {
            if (a.status === 'waiting') appsMap.waiting.push(a);
            else if (a.status === 'completed') appsMap.completed.push(a);
            else if (a.status === 'approved') appsMap.approved.push(a);
            else if (a.status === 'published' || a.status === 'in_progress') {
                if (a.date_target > todayYYYYMMDD) {
                    appsMap.approved.push(a);
                } else {
                    appsMap.published.push(a);
                }
            }
        });
    }

    const isWorkerOrDriver = ['worker', 'driver'].includes(role);

    if (loading) return <div className="text-center mt-20 text-gray-500">Загрузка данных...</div>;

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-20">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {['worker', 'driver', 'foreman', 'boss', 'superadmin'].includes(role) && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border-l-4 border-blue-500 relative h-fit">
                        <h2 className="text-lg font-bold mb-2 flex items-center dark:text-white">📋 Текущие наряды</h2>
                        {activeApps.length > 0 ? (
                            <div className="space-y-4">
                                {activeApps.map(a => {
                                    let activeEquipList = [];
                                    if (a.equipment_data) { try { activeEquipList = JSON.parse(a.equipment_data) || []; } catch(e){} }

                                    return (
                                        <div key={a.id} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 text-sm space-y-2 text-gray-800 dark:text-gray-200">
                                            <p><b>Дата:</b> {a.date_target}</p>
                                            <p><b>Объект:</b> {a.object_address}</p>

                                            <p><b>Прораб:</b> {a.foreman_id ? (
                                                <button onClick={() => openProfile(a.foreman_id)} className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-left">{a.foreman_name || 'Неизвестно'}</button>
                                            ) : <span>{a.foreman_name || 'Неизвестно'}</span>}</p>

                                            <div className="flex flex-wrap items-center gap-1">
                                                <b className="mr-1">Техника:</b>
                                                {activeEquipList.length > 0 ? activeEquipList.map((e, idx) => (
                                                    <span key={idx} className={e.is_freed ? 'line-through text-gray-400' : ''}>
                                                        {e.name} ({e.time_start}:00-{e.time_end}:00){idx < activeEquipList.length - 1 ? ', ' : ''}
                                                    </span>
                                                )) : 'Не требуется'}
                                            </div>

                                            <p>
                                                <b>Бригада:</b> <span className={a.is_team_freed === 1 ? 'line-through text-gray-400' : ''}>{a.team_name || 'Только техника'}</span>
                                            </p>

                                            {role === 'driver' && !a.my_equip_is_freed && (
                                                <button onClick={() => openFreeModal('equipment', a)} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg font-bold shadow-md transition transform hover:scale-[1.01]">
                                                    ✅ Свободен
                                                </button>
                                            )}
                                            {role === 'driver' && a.my_equip_is_freed && (
                                                <p className="mt-4 w-full text-center text-emerald-600 dark:text-emerald-400 py-2.5 font-bold bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                                    Вы свободны ✅
                                                </p>
                                            )}

                                            {['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && a.is_team_freed !== 1 && a.team_id && a.team_id !== '0' && (
                                                <button onClick={() => openFreeModal('team', a)} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg font-bold shadow-md transition transform hover:scale-[1.01]">
                                                    ✅ Свободен (Освободить все бригады)
                                                </button>
                                            )}
                                            {['foreman', 'boss', 'superadmin'].includes(role) && a.foreman_id === Number(tgId) && a.is_team_freed === 1 && (
                                                <p className="mt-4 w-full text-center text-emerald-600 dark:text-emerald-400 py-2.5 font-bold bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                                    Все бригады свободны ✅
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (<p className="text-blue-600 dark:text-blue-400 font-medium text-sm p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">Предстоящих нарядов пока нет.</p>)}
                    </div>
                )}

                {myTeam && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border-l-4 border-indigo-500 relative h-fit">
                        <h2 className="text-lg font-bold mb-4 flex items-center dark:text-white">🧑‍🤝‍🧑 Бригада: {myTeam.name}</h2>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {myTeam.members.map(m => (
                                <div key={m.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                                    <div>
                                        <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">{m.fio}</span>
                                        {m.is_foreman ? <span className="ml-2 text-[10px] font-extrabold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded shadow-sm">БРИГАДИР</span> : null}
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">{m.position}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {!isWorkerOrDriver && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2 mt-2">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">📊 ЗАЯВКИ</h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        <KanbanCol title="На модерации" icon="⏳" colorClass="bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" apps={appsMap.waiting} isOpen={openKanban.waiting} toggleOpen={() => setOpenKanban({...openKanban, waiting: !openKanban.waiting})} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="Одобрены" icon="✅" colorClass="bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" apps={appsMap.approved} isOpen={openKanban.approved} toggleOpen={() => setOpenKanban({...openKanban, approved: !openKanban.approved})} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="В работе" icon="🏗" colorClass="bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" apps={appsMap.published} isOpen={openKanban.published} toggleOpen={() => setOpenKanban({...openKanban, published: !openKanban.published})} onAppClick={openAppModalFromKanban} />
                        <KanbanCol title="Завершены" icon="🏁" colorClass="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" apps={appsMap.completed} isOpen={openKanban.completed} toggleOpen={() => setOpenKanban({...openKanban, completed: !openKanban.completed})} onAppClick={openAppModalFromKanban} />
                    </div>
                </div>
            )}

            {freeModal.isOpen && (
                <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative">
                        <h3 className="text-2xl font-bold mb-2 dark:text-white">Подтверждение</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            Для завершения работы и освобождения, напишите слово <b className="text-gray-900 dark:text-white uppercase">свободен</b>:
                        </p>
                        <input
                            type="text"
                            value={freeModal.inputValue}
                            onChange={e => setFreeModal({...freeModal, inputValue: e.target.value})}
                            className="w-full border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 p-4 rounded-xl mb-6 dark:bg-gray-700 dark:border-gray-600 dark:text-white uppercase text-center font-bold tracking-widest outline-none transition-colors"
                            placeholder="СВОБОДЕН"
                            disabled={isSubmitting}
                        />
                        <div className="flex space-x-3">
                            <button disabled={isSubmitting} onClick={() => setFreeModal({isOpen: false, type: '', app: null, teamId: null, inputValue: ''})} className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 py-3.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 transition-colors">Отмена</button>
                            <button
                                onClick={executeFree}
                                disabled={isSubmitting || freeModal.inputValue.trim().toLowerCase() !== 'свободен'}
                                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-bold transition-colors flex justify-center items-center"
                            >
                                {isSubmitting ? '⏳ Обработка...' : 'Подтвердить'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ/ПРОСМОТРА ЗАЯВКИ */}
            {isGlobalCreateAppOpen && (
                <div className="fixed inset-0 z-[110] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity">
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden">

                            {/* Экран загрузки поверх модалки */}
                            {isSubmitting && (
                                <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                                    <p className="font-bold text-blue-700 dark:text-blue-400">⏳ Выполняется...</p>
                                </div>
                            )}

                            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                                <h3 className="text-xl font-bold dark:text-white">{appForm.id ? `Наряд №${appForm.id}` : 'Создание заявки'}</h3>
                                <button type="button" disabled={isSubmitting} onClick={() => setGlobalCreateAppOpen(false)} className="text-gray-400 hover:text-red-500 disabled:opacity-50 text-3xl leading-none transition">&times;</button>
                            </div>
                            <form onSubmit={handleCreateApp} className="p-6 space-y-6 text-sm">
                                <div className="space-y-4">
                                    <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">📅 Дата выезда</label><input type="date" disabled={appForm.isViewOnly || isSubmitting} required value={appForm.date_target} onChange={e => handleFormChange('date_target', e.target.value)} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-3 rounded-xl outline-none font-bold text-gray-800 dark:text-gray-100 shadow-sm mb-3 disabled:opacity-80 bg-transparent" />{!appForm.isViewOnly && <div className="flex flex-wrap gap-2">{smartDates.map(d => (<button key={d.val} type="button" disabled={isSubmitting} onClick={() => handleFormChange('date_target', d.val)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition disabled:opacity-50 ${appForm.date_target === d.val ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-sm' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}>{d.label}</button>))}</div>}</div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">📍 Адрес объекта</label>
                                        <input type="text" disabled={appForm.isViewOnly || isSubmitting} required value={appForm.object_address} onChange={e => handleFormChange('object_address', e.target.value)} placeholder="г. Москва, ул. Ленина, 10" className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-3 rounded-xl outline-none font-medium dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-80 bg-transparent" />
                                        {!appForm.isViewOnly && data.recent_addresses && data.recent_addresses.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {data.recent_addresses.map((addr, idx) => (
                                                    <button key={idx} type="button" disabled={isSubmitting} onClick={() => handleFormChange('object_address', addr)} className="bg-gray-100 disabled:opacity-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition shadow-sm border border-gray-200 dark:border-gray-600 truncate max-w-full">
                                                        {addr}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {appForm.id && appForm.foreman_name && (
                                            <div className="mt-4 flex items-center p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600">
                                                <span className="text-2xl mr-3">👷‍♂️</span>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide">Прораб (Создатель заявки)</p>
                                                    {appForm.foreman_id ? (
                                                        <button type="button" onClick={() => { setGlobalCreateAppOpen(false); openProfile(appForm.foreman_id); }} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline text-left">
                                                            {appForm.foreman_name}
                                                        </button>
                                                    ) : (
                                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{appForm.foreman_name}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <hr className="dark:border-gray-700" />

                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                                        {appForm.isViewOnly ? '👥 Состав бригад' : '👥 Выбор Бригад'}
                                    </label>

                                    {appForm.isViewOnly ? (
                                        <div className="flex flex-col gap-3">
                                            {appForm.team_ids && appForm.team_ids.length > 0 ? (
                                                appForm.team_ids.map(teamId => {
                                                    const tMembers = appForm.members_data?.filter(m => m.team_id === teamId) || [];
                                                    const tName = tMembers.length > 0 ? tMembers[0].team_name : (data.teams?.find(t => t.id === teamId)?.name || `Бригада`);
                                                    const isThisFreed = appForm.freed_team_ids?.includes(teamId) || appForm.is_team_freed === 1;

                                                    return (
                                                        <div key={teamId} className="p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-xl">
                                                            <div className="flex justify-between items-center mb-3">
                                                                <h4 className={`font-bold ${isThisFreed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                                                                    🏗 {tName}
                                                                </h4>
                                                                {isThisFreed && <span className="text-emerald-500 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded">Свободна ✅</span>}
                                                            </div>

                                                            {tMembers.length > 0 ? (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {tMembers.map(m => (
                                                                        <button
                                                                            type="button"
                                                                            key={m.id}
                                                                            disabled={isSubmitting}
                                                                            onClick={() => { setGlobalCreateAppOpen(false); openProfile(m.tg_user_id, 'member', m.id); }}
                                                                            className="px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold border border-gray-200 dark:border-gray-600 rounded-lg text-xs transition flex items-center shadow-sm"
                                                                        >
                                                                            👤 {m.fio}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            ) : <p className="text-xs text-gray-500 italic">Нет выбранных рабочих</p>}

                                                            {!isThisFreed && ['foreman', 'boss', 'superadmin', 'moderator'].includes(role) && (appForm.status === 'published' || appForm.status === 'in_progress') && (
                                                                <button type="button" disabled={isSubmitting} onClick={() => openFreeModal('specific_team', { app: appForm, teamId })} className="mt-4 w-full sm:w-auto text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 py-2.5 px-4 rounded-lg transition border border-emerald-200 dark:border-emerald-800 flex justify-center items-center shadow-sm">
                                                                    ✅ Освободить эту бригаду
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <p className="font-medium text-gray-800 dark:text-gray-100">Только техника</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" disabled={isSubmitting} onClick={() => handleFormChange('team_ids', [])} className={`px-4 py-2 text-sm disabled:opacity-50 font-medium rounded-xl border transition ${appForm.team_ids.length === 0 ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>❌ Без бригады</button>
                                            {data?.teams?.map(t => {
                                                const st = checkTeamStatus(t.id);
                                                const isSelected = appForm.team_ids.includes(t.id);
                                                let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700';
                                                if (st.state === 'busy') btnStyles = 'bg-red-50 border-red-300 text-red-500 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 cursor-not-allowed opacity-75';
                                                else if (isSelected) btnStyles = 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shadow-sm';

                                                return (<button key={t.id} type="button" disabled={isSubmitting} onClick={() => { if(st.state !== 'free') return alert(st.message); toggleTeamSelection(t.id); }} className={`px-4 py-2 disabled:opacity-50 text-sm font-medium rounded-xl border transition ${btnStyles}`}>🏗 {t.name}</button>);
                                            })}
                                        </div>
                                    )}

                                    {!appForm.isViewOnly && teamMembers?.length > 0 && (
                                        <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50 shadow-inner">
                                            <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wide">Выберите людей:</label>
                                            <div className="flex flex-wrap gap-2">
                                                {teamMembers.map(m => {
                                                    const isSelected = appForm?.members?.includes(m.id);
                                                    return (
                                                        <button key={m.id} type="button" disabled={isSubmitting} onClick={() => toggleAppMember(m.id)} className={`px-3 py-1.5 disabled:opacity-50 text-sm font-medium rounded-lg border transition flex items-center ${isSelected ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}>
                                                            {isSelected ? <span className="mr-1.5 text-white font-bold">✓</span> : <span className="mr-1.5 opacity-0">✓</span>} {m.fio}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <hr className="dark:border-gray-700" />
                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">🚜 Требуемая техника</label>
                                    {!appForm.isViewOnly && <div className="flex flex-wrap gap-2 mb-2">{data?.equip_categories?.map(cat => (<button key={cat} type="button" disabled={isSubmitting} onClick={() => setActiveEqCategory(activeEqCategory === cat ? null : cat)} className={`px-3 py-1.5 disabled:opacity-50 text-xs font-bold rounded-lg border transition ${activeEqCategory === cat ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50'}`}>{cat}</button>))}</div>}
                                    {activeEqCategory && !appForm.isViewOnly && (<div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 shadow-inner"><div className="flex flex-wrap gap-2">{data.equipment?.filter(e => e.category === activeEqCategory).map(e => { const st = checkEquipStatus(e); const isSelected = appForm.equipment.some(eq => eq.id === e.id); const displayName = e.driver ? `${e.name} (${e.driver})` : e.name; let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100'; if (st.state === 'repair') btnStyles = 'bg-red-50 border-red-300 text-red-500 cursor-not-allowed opacity-75'; else if (st.state === 'busy') btnStyles = 'bg-yellow-50 border-yellow-300 text-yellow-600 cursor-not-allowed opacity-80'; else if (isSelected) btnStyles = 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shadow-sm'; return (<button key={e.id} type="button" disabled={isSubmitting} onClick={() => { if (st.state !== 'free') return alert(st.message); toggleEquipmentSelection(e); }} className={`px-3 py-1.5 disabled:opacity-50 text-sm font-medium rounded-lg border transition flex items-center ${btnStyles}`}>{isSelected && <span className="mr-1.5 font-bold">✓</span>}{st.state === 'repair' && <span className="mr-1.5">🛠</span>}{st.state === 'busy' && <span className="mr-1.5">⏳</span>}{displayName}</button>); })}</div></div>)}
                                    {appForm.equipment.length > 0 ? (
                                        <div className="mt-4 space-y-3 p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/50 shadow-inner">
                                            <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide border-b border-indigo-200 dark:border-indigo-800 pb-2 mb-3">Список машин:</label>
                                            {appForm.equipment.map(eq => (
                                                <div key={eq.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-indigo-100 dark:border-indigo-700/50 shadow-sm gap-3">
                                                    {appForm.isViewOnly ? (
                                                        <button type="button" disabled={isSubmitting} onClick={() => { setGlobalCreateAppOpen(false); openProfile(0, 'equip', eq.id); }} className={`font-bold text-sm text-left hover:underline disabled:opacity-50 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
                                                            🚜 {eq.name.split('(')[0].trim()} {eq.is_freed ? '✅' : ''}
                                                        </button>
                                                    ) : (
                                                        <p className={`font-bold text-sm ${eq.is_freed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>🚜 {eq.name} {eq.is_freed ? '✅' : ''}</p>
                                                    )}
                                                    <div className="flex items-center space-x-2"><div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-1.5 text-xs font-bold text-gray-500 border-r dark:border-gray-600">С</span><input type="number" min="0" max="23" disabled={appForm.isViewOnly || isSubmitting} value={eq.time_start} onChange={e => updateEquipmentTime(eq.id, 'time_start', e.target.value)} className="w-12 text-center py-1.5 text-sm font-bold outline-none dark:bg-gray-800 dark:text-white disabled:opacity-80 bg-transparent" /><span className="pr-2 font-bold text-gray-400 text-sm">:00</span></div><span className="text-gray-400 font-bold">—</span><div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-1.5 text-xs font-bold text-gray-500 border-r dark:border-gray-600">ДО</span><input type="number" min="0" max="23" disabled={appForm.isViewOnly || isSubmitting} value={eq.time_end} onChange={e => updateEquipmentTime(eq.id, 'time_end', e.target.value)} className="w-12 text-center py-1.5 text-sm font-bold outline-none dark:bg-gray-800 dark:text-white disabled:opacity-80 bg-transparent" /><span className="pr-2 font-bold text-gray-400 text-sm">:00</span></div></div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (appForm.isViewOnly && <p className="text-gray-500 text-sm">Техника не требуется</p>)}
                                </div>
                                <hr className="dark:border-gray-700" />
                                <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">💬 Комментарий</label><input type="text" disabled={appForm.isViewOnly || isSubmitting} value={appForm.comment} onChange={e => handleFormChange('comment', e.target.value)} placeholder="Доп. информация..." className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-3 rounded-xl outline-none dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-80 bg-transparent" /></div>

                                <div className="flex space-x-2 pt-4">
                                    <button type="button" disabled={isSubmitting} onClick={() => setGlobalCreateAppOpen(false)} className={`bg-gray-100 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 py-4 px-4 rounded-xl font-bold text-gray-700 dark:text-gray-300 transition flex-1`}>Закрыть</button>

                                    {appForm.isViewOnly && appForm.id && ['superadmin', 'boss', 'moderator'].includes(role) && (
                                        <button type="button" title="Удалить заявку" disabled={isSubmitting} onClick={handleDeleteApp} className="bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 py-4 px-5 rounded-xl font-bold transition flex-none border border-red-200 dark:border-red-800 flex justify-center items-center">
                                            {isSubmitting ? '⏳' : '🗑️'}
                                        </button>
                                    )}

                                    {appForm.isViewOnly && appForm.status === 'waiting' && ['foreman', 'moderator', 'boss', 'superadmin'].includes(role) && (
                                        <button type="button" disabled={isSubmitting} onClick={() => setAppForm(prev => ({...prev, isViewOnly: false}))} className="bg-yellow-500 text-white py-4 rounded-xl font-bold disabled:opacity-50 shadow-lg hover:bg-yellow-600 transition flex-1">✏️ Редактировать</button>
                                    )}

                                    {!appForm.isViewOnly && (
                                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex-[2] flex justify-center items-center">
                                            {isSubmitting ? '⏳ Обработка...' : (appForm.id ? 'Сохранить изменения' : 'Отправить')}
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
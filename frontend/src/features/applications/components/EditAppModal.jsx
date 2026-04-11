import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, Clock, CheckCircle,
    User, HardHat, X, Check, XCircle, ChevronDown, Search, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import ExchangeDialog from './ExchangeDialog';

/* ---- Object Selector ---- */
function ObjectSelector({ objects, selectedId, disabled, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = objects.filter(o => {
        const q = search.toLowerCase();
        return (o.name || '').toLowerCase().includes(q) || (o.address || '').toLowerCase().includes(q);
    });

    const selected = objects.find(o => o.id === parseInt(selectedId));

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl font-bold text-left text-gray-800 dark:text-gray-100 shadow-inner disabled:opacity-80 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between gap-2"
            >
                <span className={`truncate ${!selected ? 'text-gray-400' : ''}`}>
                    {selected ? `${selected.name} ${selected.address ? `(${selected.address})` : ''}` : '-- Выберите объект из списка --'}
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-2xl max-h-64 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600">
                            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <input
                                type="text"
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Поиск объекта..."
                                className="w-full bg-transparent outline-none text-sm font-medium dark:text-white placeholder-gray-400"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto max-h-48">
                        {filtered.length === 0 ? (
                            <p className="text-sm text-gray-400 italic text-center py-4">Не найдено</p>
                        ) : (
                            filtered.map(obj => (
                                <button
                                    key={obj.id}
                                    type="button"
                                    onClick={() => { onSelect(obj.id); setIsOpen(false); setSearch(''); }}
                                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                                        parseInt(selectedId) === obj.id
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    <MapPin className={`w-4 h-4 flex-shrink-0 ${parseInt(selectedId) === obj.id ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <span className="truncate">{obj.name} {obj.address ? `(${obj.address})` : ''}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---- Edit App Modal ---- */
export default function EditAppModal({
    app, onClose, onSaved, data, objectsList, smartDates, role, tgId, openProfile
}) {
    const [form, setForm] = useState(() => {
        let eqData = [];
        if (app.equipment_data) {
            try { eqData = typeof app.equipment_data === 'string' ? JSON.parse(app.equipment_data) : app.equipment_data; } catch (_) {}
        }
        const teamIds = app.team_id ? String(app.team_id).split(',').map(Number).filter(Boolean) : [];
        const memberIds = app.selected_members ? String(app.selected_members).split(',').map(Number).filter(Boolean) : [];

        return {
            id: app.id,
            date_target: app.date_target || smartDates[1].val,
            object_id: app.object_id || '',
            object_address: app.object_address || '',
            team_ids: teamIds,
            members: memberIds,
            equipment: eqData,
            comment: app.comment || '',
        };
    });

    const [teamMembers, setTeamMembers] = useState([]);
    const [activeEqCategory, setActiveEqCategory] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exchangeDialog, setExchangeDialog] = useState(null);

    useEffect(() => {
        if (form.team_ids.length > 0) {
            Promise.all(form.team_ids.map(id => axios.get(`/api/teams/${id}/details`)))
                .then(responses => {
                    const allMembers = responses.flatMap(res => res.data?.members || []);
                    const uniqueMembers = Array.from(new Map(allMembers.map(m => [m.id, m])).values());
                    setTeamMembers(uniqueMembers);
                }).catch(() => setTeamMembers([]));
        } else {
            setTeamMembers([]);
        }
    }, [form.team_ids.join(',')]);

    const handleFormChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const checkTeamStatus = (team_id) => {
        if (data.kanban_apps) {
            const appsOnDate = data.kanban_apps.filter(a =>
                a.date_target === form.date_target && !['rejected', 'cancelled', 'completed'].includes(a.status)
            );
            for (const a of appsOnDate) {
                const tIds = a.team_id ? String(a.team_id).split(',').map(Number) : [];
                if (tIds.includes(team_id) && form.id !== a.id)
                    return { state: 'busy', message: `Эта бригада уже занята в этот день на объекте:\n📍 ${a.object_address}` };
            }
        }
        return { state: 'free' };
    };

    const checkEquipStatus = (equip) => {
        if (equip.status === 'repair') return { state: 'repair', message: 'Техника в ремонте.' };
        if (data.kanban_apps) {
            const appsOnDate = data.kanban_apps.filter(a =>
                a.date_target === form.date_target && !['rejected', 'cancelled', 'completed'].includes(a.status)
            );
            for (const a of appsOnDate) {
                try {
                    const eqList = JSON.parse(a.equipment_data || '[]');
                    if (eqList.some(eqq => eqq.id === equip.id) && form.id !== a.id)
                        return { state: 'busy', message: `Занята на объекте:\n📍 ${a.object_address}` };
                } catch (e) {}
            }
        }
        return { state: 'free' };
    };

    const handleEquipClick = async (e, st) => {
        if (st.state === 'repair') return toast.error(st.message);
        if (st.state === 'busy') {
            if (!form.date_target) return toast.error(st.message);
            try {
                const res = await axios.get(`/api/exchange/check_equip/${e.id}?date=${form.date_target}`);
                const info = res.data;
                if (info.can_exchange) {
                    setExchangeDialog({
                        equipId: e.id,
                        equipName: e.driver ? `${e.name} (${e.driver})` : e.name,
                        equipCategory: e.category,
                        holderName: info.holder_name,
                        holderObject: info.holder_object,
                        holderAppStatus: info.holder_app_status,
                        holderAppId: info.holder_app_id,
                    });
                } else if (info.is_in_pending_exchange) {
                    toast.error('Эта техника уже участвует в обмене');
                } else {
                    toast.error(st.message);
                }
            } catch {
                toast.error(st.message);
            }
            return;
        }
        toggleEquipmentSelection(e);
    };

    const toggleTeamSelection = (id) => {
        setForm(prev => {
            const newIds = prev.team_ids.includes(id) ? prev.team_ids.filter(x => x !== id) : [...prev.team_ids, id];
            return { ...prev, team_ids: newIds };
        });
    };

    const toggleAppMember = (id) => {
        setForm(prev => ({
            ...prev,
            members: prev.members.includes(id) ? prev.members.filter(m => m !== id) : [...prev.members, id]
        }));
    };

    const toggleEquipmentSelection = (equip) => {
        setForm(prev => {
            const exists = prev.equipment.find(e => e.id === equip.id);
            if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== equip.id) };
            const displayName = equip.driver ? `${equip.name} (${equip.driver})` : equip.name;
            return { ...prev, equipment: [...prev.equipment, { id: equip.id, name: displayName, time_start: '08', time_end: '17' }] };
        });
    };

    const updateEquipmentTime = (id, field, value) => {
        setForm(prev => ({ ...prev, equipment: prev.equipment.map(e => e.id === id ? { ...e, [field]: value } : e) }));
    };

    const handleObjectSelect = async (objectId) => {
        const selObj = objectsList.find(o => o.id === parseInt(objectId));
        setForm(prev => ({ ...prev, object_id: objectId, object_address: selObj ? `${selObj.name} (${selObj.address})` : '' }));
        if (objectId) {
            try {
                const fd = new FormData();
                fd.append('object_id', objectId);
                await axios.post(`/api/users/${tgId}/last_objects`, fd);
            } catch (e) {}
        }
    };

    const handleApplyDefaults = async (type) => {
        const selectedObj = objectsList.find(o => o.id === parseInt(form.object_id));
        if (!selectedObj) return;

        const targetTeams = type === 'teams' ? selectedObj.default_team_ids : "";
        const targetEquips = type === 'equip' ? selectedObj.default_equip_ids : "";

        if (!targetTeams && !targetEquips) {
            toast.error("Для этого объекта не назначены ресурсы по умолчанию.");
            return;
        }

        try {
            const fd = new FormData();
            fd.append('date_target', form.date_target);
            fd.append('object_id', selectedObj.id);
            fd.append('team_ids', type === 'teams' ? targetTeams : form.team_ids.join(','));
            fd.append('exclude_app_id', form.id);

            const equipDataForCheck = type === 'equip'
                ? JSON.stringify(targetEquips.split(',').map(id => ({ id: parseInt(id) })))
                : JSON.stringify(form.equipment);
            fd.append('equip_data', equipDataForCheck);

            const res = await axios.post('/api/applications/check_availability', fd);

            if (res.data.status === 'occupied') {
                toast.error(`Ошибка занятости: ${res.data.message}`);
            } else {
                if (type === 'teams') {
                    const ids = targetTeams.split(',').map(Number);
                    setForm(prev => ({ ...prev, team_ids: ids }));
                }
                if (type === 'equip') {
                    const ids = targetEquips.split(',').map(Number);
                    const newEq = data.equipment.filter(e => ids.includes(e.id)).map(e => ({
                        id: e.id, name: e.driver ? `${e.name} (${e.driver})` : e.name, time_start: '08', time_end: '17'
                    }));
                    setForm(prev => ({ ...prev, equipment: newEq }));
                }
                toast.success("Ресурсы успешно подставлены!");
            }
        } catch (e) {
            toast.error("Ошибка связи с сервером при проверке занятости.");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.object_id) return toast.error("Выберите объект!");
        if (form.team_ids.length === 0 && form.equipment.length === 0) return toast.error("Выберите бригаду или технику!");
        if (form.team_ids.length > 0 && form.members.length === 0) return toast.error("Выберите хотя бы одного рабочего из бригады!");

        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('date_target', form.date_target);
            fd.append('object_id', form.object_id);
            fd.append('object_address', form.object_address);
            fd.append('team_id', form.team_ids.join(',') || '0');
            fd.append('comment', form.comment);
            fd.append('selected_members', form.members.join(','));
            fd.append('equipment_data', JSON.stringify(form.equipment));

            await axios.post(`/api/applications/${form.id}/update`, fd);
            toast.success("Заявка успешно обновлена!");
            onSaved();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка сохранения");
        } finally {
            setIsSubmitting(false);
        }
    };

    const dateChips = [
        { label: 'Сегодня', val: smartDates[0].val },
        { label: 'Завтра', val: smartDates[1].val },
        { label: 'Послезавтра', val: smartDates[2].val },
    ];

    return (
        <div className="!fixed !inset-0 !top-0 !left-0 !w-screen !h-[100dvh] z-[99990] bg-black/50 m-0 p-0 overflow-y-auto">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden">

                    {isSubmitting && (
                        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="font-bold text-blue-700 dark:text-blue-400">Выполняется...</p>
                        </div>
                    )}

                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                            <ClipboardList className="text-yellow-500 w-6 h-6" />
                            Редактирование наряда #{form.id}
                        </h3>
                        <button type="button" disabled={isSubmitting} onClick={onClose} className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6 text-sm">
                        <div className="space-y-5">
                            {/* Date */}
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <Calendar className="w-4 h-4" /> Дата выезда
                                </label>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    {dateChips.map(chip => {
                                        const active = chip.val === form.date_target;
                                        return (
                                            <button key={chip.val} type="button" disabled={isSubmitting}
                                                onClick={() => handleFormChange('date_target', chip.val)}
                                                className={`py-2.5 text-xs font-bold rounded-xl border transition-all disabled:opacity-50 active:scale-95 ${active ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                {chip.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <input type="date" required value={form.date_target}
                                    disabled={isSubmitting}
                                    onChange={e => handleFormChange('date_target', e.target.value)}
                                    className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl outline-none font-bold text-gray-800 dark:text-gray-100 shadow-inner disabled:opacity-80 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                            </div>

                            {/* Object */}
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <MapPin className="w-4 h-4 text-red-500" /> Объект
                                </label>
                                <ObjectSelector
                                    objects={objectsList}
                                    selectedId={form.object_id}
                                    disabled={isSubmitting}
                                    onSelect={(id) => handleObjectSelect(id)}
                                />

                                {form.object_id && (
                                    <div className="flex gap-2 mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                        <button type="button" onClick={() => handleApplyDefaults('teams')} className="flex-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700/50 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm flex items-center justify-center gap-1.5">
                                            <Users className="w-3.5 h-3.5" /> Бригады по умолчанию
                                        </button>
                                        <button type="button" onClick={() => handleApplyDefaults('equip')} className="flex-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 py-2 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors shadow-sm flex items-center justify-center gap-1.5">
                                            <Truck className="w-3.5 h-3.5" /> Техника по умолчанию
                                        </button>
                                    </div>
                                )}

                                {app.foreman_name && (
                                    <div className="mt-5 flex items-center p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600/50 shadow-sm">
                                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-full mr-4 text-blue-600 dark:text-blue-400">
                                            <HardHat className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-0.5">Прораб (Создатель)</p>
                                            {app.foreman_id ? (
                                                <button type="button" onClick={() => { onClose(); openProfile(app.foreman_id); }} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline text-left transition-colors">
                                                    {app.foreman_name}
                                                </button>
                                            ) : (
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{app.foreman_name}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        {/* Teams */}
                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Users className="w-4 h-4" /> Выбор Бригад
                            </label>
                            <div className="flex flex-wrap gap-2.5">
                                <button type="button" disabled={isSubmitting} onClick={() => handleFormChange('team_ids', [])} className={`px-4 py-2.5 text-sm disabled:opacity-50 font-bold rounded-xl border transition-all active:scale-95 flex items-center gap-2 ${form.team_ids.length === 0 ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                                    <XCircle className="w-4 h-4" /> Без бригады
                                </button>
                                {data?.teams?.map(t => {
                                    const st = checkTeamStatus(t.id);
                                    const isSelected = form.team_ids.includes(t.id);
                                    let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700';
                                    let icon = <Users className="w-4 h-4 text-gray-400" />;

                                    if (st.state === 'busy') {
                                        btnStyles = 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-500 cursor-not-allowed opacity-75';
                                        icon = <Clock className="w-4 h-4" />;
                                    } else if (isSelected) {
                                        btnStyles = 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-500';
                                        icon = <CheckCircle className="w-4 h-4" />;
                                    }

                                    return (
                                        <button key={t.id} type="button" disabled={isSubmitting} onClick={() => { if (st.state !== 'free') return toast.error(st.message); toggleTeamSelection(t.id); }} className={`px-4 py-2.5 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 ${btnStyles}`}>
                                            {icon} {t.name}
                                        </button>
                                    );
                                })}
                            </div>

                            {teamMembers.length > 0 && (
                                <div className="mt-5 p-5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 shadow-inner">
                                    <label className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-4 uppercase tracking-wider">
                                        <User className="w-4 h-4" /> Выберите людей:
                                    </label>
                                    <div className="flex flex-wrap gap-2.5">
                                        {teamMembers.map(m => {
                                            const isSelected = form.members.includes(m.id);
                                            return (
                                                <button key={m.id} type="button" disabled={isSubmitting} onClick={() => toggleAppMember(m.id)} className={`px-3.5 py-2 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 hover:shadow-md ${isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                    {isSelected ? <Check className="w-4 h-4" /> : <div className="w-4 h-4 border-2 border-current rounded-full opacity-30"></div>}
                                                    {m.fio}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        {/* Equipment */}
                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Truck className="w-4 h-4" /> Требуемая техника
                            </label>

                            <div className="flex flex-wrap gap-2.5 mb-3">
                                {data?.equip_categories?.map(cat => (
                                    <button key={cat} type="button" disabled={isSubmitting} onClick={() => setActiveEqCategory(activeEqCategory === cat ? null : cat)} className={`px-4 py-2.5 disabled:opacity-50 text-xs font-bold rounded-xl border transition-all active:scale-95 ${activeEqCategory === cat ? 'bg-blue-500 text-white border-blue-600 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {activeEqCategory && (
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-inner">
                                    <div className="flex flex-wrap gap-2.5">
                                        {data.equipment?.filter(e => e.category === activeEqCategory).map(e => {
                                            const st = checkEquipStatus(e);
                                            const isSelected = form.equipment.some(eq => eq.id === e.id);
                                            const displayName = e.driver ? `${e.name} (${e.driver})` : e.name;
                                            let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700';

                                            if (st.state === 'repair') btnStyles = 'bg-red-50 border-red-200 text-red-500 cursor-not-allowed opacity-75 dark:bg-red-900/20 dark:border-red-800';
                                            else if (st.state === 'busy') btnStyles = 'bg-yellow-50 border-yellow-200 text-yellow-600 cursor-not-allowed opacity-80 dark:bg-yellow-900/20 dark:border-yellow-800';
                                            else if (isSelected) btnStyles = 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shadow-sm ring-1 ring-blue-500';

                                            return (
                                                <button key={e.id} type="button" disabled={isSubmitting} onClick={() => handleEquipClick(e, st)} className={`px-3.5 py-2 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 ${btnStyles}`}>
                                                    {isSelected ? <CheckCircle className="w-4 h-4" /> : (st.state === 'repair' ? <XCircle className="w-4 h-4" /> : (st.state === 'busy' ? <Clock className="w-4 h-4" /> : <div className="w-4 h-4 border-2 border-current rounded-full opacity-30"></div>))}
                                                    {displayName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {form.equipment.length > 0 && (
                                <div className="mt-5 space-y-3.5 p-5 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30 shadow-inner">
                                    <label className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider border-b border-blue-200 dark:border-blue-800/50 pb-3 mb-4">
                                        <ClipboardList className="w-4 h-4" /> Список машин:
                                    </label>
                                    {form.equipment.map(eq => (
                                        <div key={eq.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-blue-100 dark:border-blue-700/50 shadow-sm gap-4 hover:shadow-md transition-shadow">
                                            <p className={`font-bold text-sm flex items-center gap-2 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                                <Truck className={`w-5 h-5 ${eq.is_freed ? 'text-gray-400' : 'text-blue-500'}`} />
                                                {eq.name}
                                                {eq.is_freed && <CheckCircle className="w-4 h-4 text-emerald-500 ml-1" />}
                                            </p>

                                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
                                                <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                                                    <span className="bg-gray-50 dark:bg-gray-700 px-2.5 py-2 text-[10px] font-extrabold text-gray-500 border-r border-gray-200 dark:border-gray-600">С</span>
                                                    <input type="number" min="0" max="23" disabled={isSubmitting} value={eq.time_start} onChange={e => updateEquipmentTime(eq.id, 'time_start', e.target.value)} className="w-12 text-center py-2 text-sm font-bold outline-none dark:bg-gray-800 dark:text-white disabled:opacity-80 bg-transparent" />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                                <span className="text-gray-400 font-bold px-1">&mdash;</span>
                                                <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                                                    <span className="bg-gray-50 dark:bg-gray-700 px-2 py-2 text-[10px] font-extrabold text-gray-500 border-r border-gray-200 dark:border-gray-600">ДО</span>
                                                    <input type="number" min="0" max="23" disabled={isSubmitting} value={eq.time_end} onChange={e => updateEquipmentTime(eq.id, 'time_end', e.target.value)} className="w-12 text-center py-2 text-sm font-bold outline-none dark:bg-gray-800 dark:text-white disabled:opacity-80 bg-transparent" />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        {/* Comment */}
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                <MessageSquare className="w-4 h-4" /> Комментарий
                            </label>
                            <input type="text" disabled={isSubmitting} value={form.comment} onChange={e => handleFormChange('comment', e.target.value)} placeholder="Доп. информация..." className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl outline-none dark:text-white shadow-inner focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-80 transition-colors" />
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-6">
                            <button type="button" disabled={isSubmitting} onClick={onClose} className="bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 py-4 px-6 rounded-xl font-bold text-gray-700 dark:text-gray-300 transition-all shadow-sm active:scale-95 flex-1">
                                Закрыть
                            </button>
                            <button type="submit" disabled={isSubmitting} className="bg-yellow-500 text-white py-4 px-6 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex-[2] flex justify-center items-center gap-2">
                                {isSubmitting ? 'Сохранение...' : 'Сохранить изменения'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            {exchangeDialog && createPortal(
                <ExchangeDialog
                    info={exchangeDialog}
                    equipment={data.equipment || []}
                    appEquipment={form.equipment}
                    appId={form.id}
                    tgId={tgId}
                    dateTarget={form.date_target}
                    onClose={() => setExchangeDialog(null)}
                />,
                document.body
            )}
        </div>
    );
}

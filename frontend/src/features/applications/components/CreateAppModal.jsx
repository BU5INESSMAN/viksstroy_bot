import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, Clock, CheckCircle,
    User, HardHat, X, Check, XCircle, ChevronDown, Search, RefreshCw, AlertTriangle, Lock, ArrowLeftRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import ExchangeDialog from './ExchangeDialog';

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

export default function CreateAppModal({
    appForm, setAppForm, isSubmitting, setGlobalCreateAppOpen,
    handleCreateApp, handleDeleteApp, handleFormChange, handleApplyDefaults,
    handleObjectSelect,
    smartDates, objectsList, data, role,
    toggleTeamSelection, toggleAppMember, checkTeamStatus, checkEquipStatus,
    toggleEquipmentSelection, updateEquipmentTime,
    activeEqCategory, setActiveEqCategory, teamMembers, openProfile, openFreeModal,
    tgId
}) {
    const [exchangeDialog, setExchangeDialog] = useState(null);
    const [equipAvailability, setEquipAvailability] = useState(null);
    const [equipLoading, setEquipLoading] = useState(false);
    const [timeAutoSet, setTimeAutoSet] = useState(false);
    const [actionChoiceEquip, setActionChoiceEquip] = useState(null);

    // Fetch equipment availability when date changes
    const fetchAvailability = useCallback(async (date) => {
        if (!date) { setEquipAvailability(null); return; }
        setEquipLoading(true);
        try {
            const res = await axios.get(`/api/equipment/availability?date=${date}`);
            setEquipAvailability(res.data);
        } catch { setEquipAvailability(null); }
        finally { setEquipLoading(false); }
    }, []);

    useEffect(() => {
        if (!appForm.isViewOnly && appForm.date_target) fetchAvailability(appForm.date_target);
    }, [appForm.date_target, appForm.isViewOnly, fetchAvailability]);

    const getEquipState = (eqAvail) => {
        if (eqAvail.status === 'repair') return 'repair';
        if (eqAvail.status === 'free') return 'available';
        if (eqAvail.is_in_pending_exchange) return 'in_exchange';
        const hasExchangeable = (eqAvail.busy_slots || []).some(s => s.can_exchange && eqAvail.exchange_enabled);
        const hasFreeTime = (eqAvail.free_slots || []).length > 0;
        if (hasExchangeable && hasFreeTime) return 'both';
        if (hasExchangeable) return 'exchange';
        if (hasFreeTime) return 'free_time';
        return 'unavailable';
    };

    const makeDisplayName = (eq) => eq.driver_fio
        ? `${eq.name} [${eq.license_plate || 'нет г.н.'}] (${eq.driver_fio})`
        : (eq.driver ? `${eq.name} [${eq.license_plate || 'нет г.н.'}] (${eq.driver})` : `${eq.name} [${eq.license_plate || 'нет г.н.'}]`);

    const openExchangeDialog = (eqAvail) => {
        const exchangeSlot = eqAvail.busy_slots.find(s => s.can_exchange);
        setExchangeDialog({
            equipId: eqAvail.id,
            equipName: makeDisplayName(eqAvail),
            equipCategory: eqAvail.category,
            holderName: exchangeSlot.foreman_name,
            holderObject: exchangeSlot.object_address,
            holderAppStatus: exchangeSlot.app_status,
            holderAppId: exchangeSlot.app_id,
        });
    };

    const handleFreeTimeSelect = (eqAvail) => {
        const freeSlots = eqAvail.free_slots || [];
        // Pick the longest free slot
        let best = freeSlots[0];
        if (freeSlots.length > 1) {
            const toMin = (t) => { const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1] || 0); };
            best = freeSlots.reduce((a, b) => (toMin(b.time_end) - toMin(b.time_start)) > (toMin(a.time_end) - toMin(a.time_start)) ? b : a, freeSlots[0]);
        }
        const tsHour = best.time_start.split(':')[0];
        const teHour = best.time_end.split(':')[0];
        const displayName = makeDisplayName(eqAvail);
        setAppForm(prev => ({
            ...prev,
            equipment: [...prev.equipment, { id: eqAvail.id, name: displayName, time_start: tsHour, time_end: teHour, isPartialTime: true }],
        }));
        setTimeAutoSet(true);
        toast('Время автоматически изменено. Проверьте время техники.', { icon: '⏰' });
    };

    const handleEquipClick = async (eqAvail) => {
        const state = getEquipState(eqAvail);
        if (state === 'repair' || state === 'unavailable') return;
        if (state === 'in_exchange') return toast.error('Эта техника уже участвует в обмене');

        const isSelected = appForm.equipment.some(eq => eq.id === eqAvail.id);
        if (isSelected) return toggleEquipmentSelection({ id: eqAvail.id, name: eqAvail.name, driver: eqAvail.driver_fio, license_plate: eqAvail.license_plate });

        if (state === 'both') {
            setActionChoiceEquip(eqAvail);
            return;
        }

        if (state === 'exchange') {
            openExchangeDialog(eqAvail);
            return;
        }

        if (state === 'free_time') {
            handleFreeTimeSelect(eqAvail);
            return;
        }

        // state === 'available'
        toggleEquipmentSelection({ id: eqAvail.id, name: eqAvail.name, driver: eqAvail.driver_fio, license_plate: eqAvail.license_plate });
    };

    // Deferred exchange: save intent, do NOT add occupied equipment to the list
    const handleDeferredExchange = ({ requested_equip_id, offered_equip_id, offeredEquipData }) => {
        const reqEquip = data.equipment?.find(eq => eq.id === requested_equip_id);
        const reqEquipName = reqEquip
            ? (reqEquip.driver ? `${reqEquip.name} [${reqEquip.license_plate || 'нет г.н.'}] (${reqEquip.driver})` : `${reqEquip.name} [${reqEquip.license_plate || 'нет г.н.'}]`)
            : `Техника #${requested_equip_id}`;

        setAppForm(prev => {
            // Remove offered equipment from selection if it was there
            const filteredEquip = prev.equipment.filter(eq => eq.id !== offered_equip_id);
            return {
                ...prev,
                equipment: filteredEquip,
                pendingExchange: { requested_equip_id, offered_equip_id, requestedEquipName: reqEquipName },
            };
        });
        toast.success('Обмен будет отправлен после создания заявки');
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

                    {/* Экран загрузки поверх модалки */}
                    {isSubmitting && (
                        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="font-bold text-blue-700 dark:text-blue-400">⏳ Выполняется...</p>
                        </div>
                    )}

                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                            <ClipboardList className="text-blue-500 w-6 h-6" />
                            {appForm.id ? `Наряд №${appForm.id}` : 'Создание заявки'}
                        </h3>
                        <button type="button" disabled={isSubmitting} onClick={() => setGlobalCreateAppOpen(false)} className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleCreateApp} className="p-6 space-y-6 text-sm">
                        <div className="space-y-5">
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <Calendar className="w-4 h-4" /> Дата выезда
                                </label>
                                {appForm.isViewOnly ? (
                                    <div className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-xl font-bold text-gray-800 dark:text-gray-100">
                                        {appForm.date_target}
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            {dateChips.map(chip => {
                                                const active = chip.val === appForm.date_target;
                                                return (
                                                    <button key={chip.val} type="button" disabled={isSubmitting}
                                                        onClick={() => handleFormChange('date_target', chip.val)}
                                                        className={`py-2.5 text-xs font-bold rounded-xl border transition-all disabled:opacity-50 active:scale-95 ${active ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                        {chip.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <input type="date" required value={appForm.date_target}
                                            disabled={isSubmitting}
                                            onChange={e => handleFormChange('date_target', e.target.value)}
                                            className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl outline-none font-bold text-gray-800 dark:text-gray-100 shadow-inner disabled:opacity-80 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                    </>
                                )}
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <MapPin className="w-4 h-4 text-red-500" /> Объект
                                </label>
                                {appForm.isViewOnly ? (
                                    <div className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-xl font-bold text-gray-900 dark:text-white">
                                        {appForm.object_address || 'Объект не выбран'}
                                    </div>
                                ) : (
                                    <ObjectSelector
                                        objects={objectsList}
                                        selectedId={appForm.object_id}
                                        disabled={appForm.isViewOnly || isSubmitting}
                                        onSelect={(id) => handleObjectSelect ? handleObjectSelect(id) : (() => {
                                            const selObj = objectsList.find(o => o.id === parseInt(id));
                                            setAppForm({...appForm, object_id: id, object_address: selObj ? `${selObj.name} (${selObj.address})` : ''});
                                        })()}
                                    />
                                )}

                                {!appForm.isViewOnly && appForm.object_id && (
                                    <div className="flex gap-2 mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                        <button type="button" onClick={() => handleApplyDefaults('teams')} className="flex-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700/50 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm flex items-center justify-center gap-1.5">
                                            <Users className="w-3.5 h-3.5" /> Бригады по умолчанию
                                        </button>
                                        <button type="button" onClick={() => handleApplyDefaults('equip')} className="flex-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 py-2 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors shadow-sm flex items-center justify-center gap-1.5">
                                            <Truck className="w-3.5 h-3.5" /> Техника по умолчанию
                                        </button>
                                    </div>
                                )}

                                {appForm.id && appForm.foreman_name && (
                                    <div className="mt-5 flex items-center p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600/50 shadow-sm">
                                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-full mr-4 text-blue-600 dark:text-blue-400">
                                            <HardHat className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-0.5">Прораб (Создатель)</p>
                                            {appForm.foreman_id ? (
                                                <button type="button" onClick={() => { setGlobalCreateAppOpen(false); openProfile(appForm.foreman_id); }} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline text-left transition-colors">
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
                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Users className="w-4 h-4" /> {appForm.isViewOnly ? 'Состав бригад' : 'Выбор Бригад'}
                            </label>

                            {appForm.isViewOnly ? (
                                <div className="flex flex-col gap-4">
                                    {appForm.team_ids && appForm.team_ids.length > 0 ? (
                                        appForm.team_ids.map(teamId => {
                                            const tMembers = appForm.members_data?.filter(m => m.team_id === teamId) || [];
                                            const tName = tMembers.length > 0 ? tMembers[0].team_name : (data.teams?.find(t => t.id === teamId)?.name || `Бригада`);
                                            const isThisFreed = appForm.freed_team_ids?.includes(teamId) || appForm.is_team_freed === 1;

                                            return (
                                                <div key={teamId} className="p-4 bg-gray-50/80 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600/50 rounded-2xl shadow-sm">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h4 className={`font-bold flex items-center gap-2 ${isThisFreed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                                                            <div className={`p-1.5 rounded-lg ${isThisFreed ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500'}`}>
                                                                <Users className="w-4 h-4" />
                                                            </div>
                                                            {tName}
                                                        </h4>
                                                        {isThisFreed && <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-md flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Свободна</span>}
                                                    </div>

                                                    {tMembers.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2.5">
                                                            {tMembers.map(m => (
                                                                <button
                                                                    type="button"
                                                                    key={m.id}
                                                                    disabled={isSubmitting}
                                                                    onClick={() => { setGlobalCreateAppOpen(false); openProfile(m.tg_user_id, 'member', m.id); }}
                                                                    className="px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold border border-gray-200 dark:border-gray-700 rounded-xl text-xs transition-all flex items-center gap-2 shadow-sm active:scale-95 hover:shadow-md"
                                                                >
                                                                    <User className="w-3.5 h-3.5 text-gray-400" /> {m.fio}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : <p className="text-xs text-gray-500 italic bg-white dark:bg-gray-800 p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">Нет выбранных рабочих</p>}

                                                    {!isThisFreed && ['foreman', 'boss', 'superadmin', 'moderator'].includes(role) && (appForm.status === 'published' || appForm.status === 'in_progress') && (
                                                        <button type="button" disabled={isSubmitting} onClick={() => openFreeModal('specific_team', { app: appForm, teamId })} className="mt-5 w-full text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 py-3.5 rounded-xl transition-all border border-emerald-200 dark:border-emerald-800/50 flex justify-center items-center gap-2 shadow-sm active:scale-[0.98]">
                                                            <CheckCircle className="w-4 h-4" /> Освободить эту бригаду
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center">
                                            <Truck className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                            <p className="font-medium text-gray-600 dark:text-gray-300">Только техника (люди не требуются)</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2.5">
                                    <button type="button" disabled={isSubmitting} onClick={() => handleFormChange('team_ids', [])} className={`px-4 py-2.5 text-sm disabled:opacity-50 font-bold rounded-xl border transition-all active:scale-95 flex items-center gap-2 ${appForm.team_ids.length === 0 ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                                        <XCircle className="w-4 h-4" /> Без бригады
                                    </button>
                                    {data?.teams?.map(t => {
                                        const st = checkTeamStatus(t.id);
                                        const isSelected = appForm.team_ids.includes(t.id);
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
                                            <button key={t.id} type="button" disabled={isSubmitting} onClick={() => { if(st.state !== 'free') return toast.error(st.message); toggleTeamSelection(t.id); }} className={`px-4 py-2.5 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 ${btnStyles}`}>
                                                {icon} {t.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {!appForm.isViewOnly && teamMembers?.length > 0 && (
                                <div className="mt-5 p-5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 shadow-inner">
                                    <label className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-4 uppercase tracking-wider">
                                        <User className="w-4 h-4" /> Выберите людей:
                                    </label>
                                    <div className="flex flex-wrap gap-2.5">
                                        {teamMembers.map(m => {
                                            const isSelected = appForm?.members?.includes(m.id);
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

                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Truck className="w-4 h-4" /> Требуемая техника
                            </label>

                            {!appForm.isViewOnly && (
                                <>
                                    <div className="flex flex-wrap gap-2.5 mb-3">
                                        {data?.equip_categories?.map(cat => (
                                            <button key={cat} type="button" disabled={isSubmitting} onClick={() => setActiveEqCategory(activeEqCategory === cat ? null : cat)} className={`px-4 py-2.5 disabled:opacity-50 text-xs font-bold rounded-xl border transition-all active:scale-95 ${activeEqCategory === cat ? 'bg-blue-500 text-white border-blue-600 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                {cat}
                                            </button>
                                        ))}
                                    </div>

                                    {activeEqCategory && equipLoading && (
                                        <div className="p-6 text-center text-gray-400">
                                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                            <p className="text-xs font-medium">Загрузка доступности...</p>
                                        </div>
                                    )}

                                    {activeEqCategory && !equipLoading && (
                                        <div className="space-y-2">
                                            {(equipAvailability || data.equipment || [])
                                                .filter(e => e.category === activeEqCategory)
                                                .map(eqA => {
                                                    const isSelected = appForm.equipment.some(eq => eq.id === eqA.id);
                                                    const displayName = makeDisplayName(eqA);
                                                    const state = getEquipState(eqA);
                                                    const busySlots = eqA.busy_slots || [];
                                                    const freeSlots = eqA.free_slots || [];
                                                    const isDisabled = isSubmitting || state === 'repair' || state === 'unavailable' || state === 'in_exchange';

                                                    let rowBg = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50';
                                                    let statusBadge = null;
                                                    let subtitle = null;

                                                    if (isSelected) {
                                                        const selEq = appForm.equipment.find(eq => eq.id === eqA.id);
                                                        rowBg = selEq?.isPartialTime
                                                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 ring-1 ring-amber-400'
                                                            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-700 ring-1 ring-blue-400';
                                                    } else if (state === 'repair') {
                                                        rowBg = 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50 opacity-60';
                                                        statusBadge = <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-md"><XCircle className="w-3 h-3" />Ремонт</span>;
                                                    } else if (state === 'both') {
                                                        rowBg = 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50';
                                                        statusBadge = <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-md"><ArrowLeftRight className="w-3 h-3" />Выбор</span>;
                                                        const slot = busySlots[0];
                                                        if (slot) subtitle = `${slot.foreman_name || ''} · ${slot.object_address || ''} · ${slot.time_start}–${slot.time_end}`;
                                                    } else if (state === 'exchange') {
                                                        rowBg = 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50';
                                                        statusBadge = <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-md"><RefreshCw className="w-3 h-3" />Обмен</span>;
                                                        const slot = busySlots[0];
                                                        if (slot) subtitle = `${slot.foreman_name || ''} · ${slot.object_address || ''} · ${slot.time_start}–${slot.time_end}`;
                                                    } else if (state === 'free_time') {
                                                        rowBg = 'bg-yellow-50/30 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/50';
                                                        const freeText = freeSlots.map(s => `${s.time_start}–${s.time_end}`).join(', ');
                                                        statusBadge = <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md"><Clock className="w-3 h-3" />с {freeSlots[0]?.time_start}</span>;
                                                        const busyText = busySlots.map(s => `${s.time_start}–${s.time_end}`).join(', ');
                                                        subtitle = `Занята ${busyText}`;
                                                    } else if (state === 'in_exchange') {
                                                        rowBg = 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60';
                                                        statusBadge = <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-500 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-md"><RefreshCw className="w-3 h-3" />В обмене</span>;
                                                    } else if (state === 'unavailable') {
                                                        rowBg = 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-50';
                                                        statusBadge = <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md"><Lock className="w-3 h-3" />Недоступна</span>;
                                                        const slot = busySlots[0];
                                                        if (slot) subtitle = `${slot.foreman_name || ''} · ${slot.object_address || ''} · ${slot.time_start}–${slot.time_end}`;
                                                    }

                                                    return (
                                                        <button
                                                            key={eqA.id}
                                                            type="button"
                                                            disabled={isDisabled}
                                                            onClick={() => handleEquipClick(eqA)}
                                                            className={`w-full text-left p-3 rounded-xl border transition-all disabled:cursor-not-allowed ${rowBg}`}
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                    {isSelected
                                                                        ? <CheckCircle className={`w-4 h-4 flex-shrink-0 ${appForm.equipment.find(eq => eq.id === eqA.id)?.isPartialTime ? 'text-amber-500' : 'text-blue-500'}`} />
                                                                        : <Truck className={`w-4 h-4 flex-shrink-0 ${state === 'repair' || state === 'unavailable' ? 'text-gray-300' : (state === 'exchange' || state === 'both') ? 'text-amber-500' : 'text-gray-500'}`} />
                                                                    }
                                                                    <span className={`text-sm font-bold truncate ${state === 'unavailable' || state === 'in_exchange' ? 'text-gray-400' : 'dark:text-gray-200'}`}>{displayName}</span>
                                                                </div>
                                                                {statusBadge}
                                                            </div>
                                                            {subtitle && (
                                                                <p className="mt-1 ml-6 text-[11px] text-gray-400 truncate">{subtitle}</p>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </>
                            )}

                            {appForm.equipment.length > 0 ? (
                                <div className="mt-5 space-y-3.5 p-5 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30 shadow-inner">
                                    <label className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider border-b border-blue-200 dark:border-blue-800/50 pb-3 mb-4">
                                        <ClipboardList className="w-4 h-4" /> Список машин:
                                    </label>
                                    {appForm.equipment.map(eq => {
                                        const isPartial = eq.isPartialTime;
                                        const cardBorder = isPartial ? 'border-amber-200 dark:border-amber-700/50' : 'border-blue-100 dark:border-blue-700/50';
                                        const cardBg = isPartial ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'bg-white dark:bg-gray-800';
                                        return (
                                        <div key={eq.id} className={`flex flex-col sm:flex-row sm:items-center justify-between ${cardBg} p-4 rounded-xl border ${cardBorder} shadow-sm gap-4 hover:shadow-md transition-shadow`}>
                                            {appForm.isViewOnly ? (
                                                <button type="button" disabled={isSubmitting} onClick={() => { setGlobalCreateAppOpen(false); openProfile(0, 'equip', eq.id); }} className={`font-bold text-sm text-left hover:underline disabled:opacity-50 flex items-center gap-2 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
                                                    <div className={`p-1.5 rounded-lg ${eq.is_freed ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-500'}`}>
                                                        <Truck className="w-4 h-4" />
                                                    </div>
                                                    {eq.name}
                                                    {eq.is_freed && <CheckCircle className="w-4 h-4 text-emerald-500 ml-1" />}
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Truck className={`w-5 h-5 flex-shrink-0 ${eq.is_freed ? 'text-gray-400' : isPartial ? 'text-amber-500' : 'text-blue-500'}`} />
                                                    <p className={`font-bold text-sm truncate ${eq.is_freed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                                        {eq.name}
                                                    </p>
                                                    {eq.is_freed && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                                                    {isPartial && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded flex-shrink-0">Частичное</span>}
                                                </div>
                                            )}

                                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
                                                <div className={`flex items-center rounded-lg overflow-hidden border shadow-sm focus-within:ring-2 ${isPartial && timeAutoSet ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600 focus-within:ring-amber-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 focus-within:ring-blue-500'}`}>
                                                    <span className={`px-2.5 py-2 text-[10px] font-extrabold border-r ${isPartial && timeAutoSet ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 border-amber-300 dark:border-amber-600' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600'}`}>С</span>
                                                    <input type="number" min="0" max="23" disabled={appForm.isViewOnly || isSubmitting} value={eq.time_start} onChange={e => { updateEquipmentTime(eq.id, 'time_start', e.target.value); setTimeAutoSet(false); }} className={`w-12 text-center py-2 text-sm font-bold outline-none disabled:opacity-80 ${isPartial && timeAutoSet ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' : 'bg-transparent dark:bg-gray-800 dark:text-white'}`} />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                                <span className="text-gray-400 font-bold px-1">—</span>
                                                <div className={`flex items-center rounded-lg overflow-hidden border shadow-sm focus-within:ring-2 ${isPartial && timeAutoSet ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600 focus-within:ring-amber-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 focus-within:ring-blue-500'}`}>
                                                    <span className={`px-2 py-2 text-[10px] font-extrabold border-r ${isPartial && timeAutoSet ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 border-amber-300 dark:border-amber-600' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600'}`}>ДО</span>
                                                    <input type="number" min="0" max="23" disabled={appForm.isViewOnly || isSubmitting} value={eq.time_end} onChange={e => { updateEquipmentTime(eq.id, 'time_end', e.target.value); setTimeAutoSet(false); }} className={`w-12 text-center py-2 text-sm font-bold outline-none disabled:opacity-80 ${isPartial && timeAutoSet ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' : 'bg-transparent dark:bg-gray-800 dark:text-white'}`} />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                appForm.isViewOnly && (
                                    <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center">
                                        <Truck className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                        <p className="font-medium text-gray-600 dark:text-gray-300">Техника не требуется</p>
                                    </div>
                                )
                            )}
                        </div>

                        {appForm.pendingExchange && !appForm.isViewOnly && (
                            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800/50">
                                <div className="bg-amber-100 dark:bg-amber-900/40 p-2 rounded-lg text-amber-600 dark:text-amber-400">
                                    <RefreshCw className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-0.5">Обмен ожидает</p>
                                    <p className="text-sm font-bold text-amber-800 dark:text-amber-200 truncate">{appForm.pendingExchange.requestedEquipName}</p>
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Запрос будет отправлен после создания заявки</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAppForm(prev => ({ ...prev, pendingExchange: null }))}
                                    className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors p-1"
                                    title="Отменить обмен"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                <MessageSquare className="w-4 h-4" /> Комментарий
                            </label>
                            <input type="text" disabled={appForm.isViewOnly || isSubmitting} value={appForm.comment} onChange={e => handleFormChange('comment', e.target.value)} placeholder="Доп. информация..." className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl outline-none dark:text-white shadow-inner focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-80 transition-colors" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-6">
                            <button type="button" disabled={isSubmitting} onClick={() => setGlobalCreateAppOpen(false)} className="bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 py-4 px-6 rounded-xl font-bold text-gray-700 dark:text-gray-300 transition-all shadow-sm active:scale-95 flex-1">
                                Закрыть
                            </button>

                            {appForm.isViewOnly && appForm.id && ['superadmin', 'boss', 'moderator'].includes(role) && (
                                <button type="button" title="Удалить заявку" disabled={isSubmitting} onClick={handleDeleteApp} className="bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 py-4 px-6 rounded-xl font-bold transition-all flex-none border border-red-200 dark:border-red-800 flex justify-center items-center shadow-sm active:scale-95">
                                    {isSubmitting ? '⏳' : <XCircle className="w-5 h-5" />}
                                </button>
                            )}

                            {appForm.isViewOnly && appForm.status === 'waiting' && (
                                ['moderator', 'boss', 'superadmin'].includes(role) ||
                                (role === 'foreman' && String(appForm.foreman_id) === String(localStorage.getItem('tg_id') || '0'))
                            ) && (
                                <button type="button" disabled={isSubmitting} onClick={() => setAppForm(prev => ({...prev, isViewOnly: false}))} className="bg-yellow-500 text-white py-4 px-6 rounded-xl font-bold disabled:opacity-50 shadow-md hover:shadow-lg hover:bg-yellow-600 transition-all active:scale-[0.98] flex-1 flex justify-center items-center gap-2">
                                    Редактировать
                                </button>
                            )}

                            {!appForm.isViewOnly && (
                                <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white py-4 px-6 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex-[2] flex justify-center items-center gap-2">
                                    {isSubmitting ? '⏳ Обработка...' : (appForm.id ? 'Сохранить изменения' : '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c')}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
            {actionChoiceEquip && createPortal(
                <div className="fixed inset-0 z-[99992] bg-black/50 flex items-center justify-center p-4" onClick={() => setActionChoiceEquip(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-5 pt-5 pb-3">
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{makeDisplayName(actionChoiceEquip)}</p>
                            {actionChoiceEquip.busy_slots?.[0] && (
                                <p className="text-xs text-gray-400 mt-1">
                                    Занята: {actionChoiceEquip.busy_slots[0].foreman_name} · {actionChoiceEquip.busy_slots[0].object_address}
                                    <br />Время: {actionChoiceEquip.busy_slots[0].time_start} — {actionChoiceEquip.busy_slots[0].time_end}
                                </p>
                            )}
                        </div>
                        <div className="px-5 pb-3 space-y-2.5">
                            <button type="button" onClick={() => { handleFreeTimeSelect(actionChoiceEquip); setActionChoiceEquip(null); }}
                                className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors text-left">
                                <div className="flex items-center gap-3">
                                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Взять свободное время</p>
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                            {(actionChoiceEquip.free_slots || []).map(s => `${s.time_start} — ${s.time_end}`).join(' или ')}
                                        </p>
                                    </div>
                                </div>
                            </button>
                            <button type="button" onClick={() => { openExchangeDialog(actionChoiceEquip); setActionChoiceEquip(null); }}
                                className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-left">
                                <div className="flex items-center gap-3">
                                    <ArrowLeftRight className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-blue-800 dark:text-blue-200">Предложить обмен</p>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Обменять на вашу технику</p>
                                    </div>
                                </div>
                            </button>
                        </div>
                        <div className="px-5 pb-5">
                            <button type="button" onClick={() => setActionChoiceEquip(null)}
                                className="w-full py-3 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {exchangeDialog && createPortal(
                <ExchangeDialog
                    info={exchangeDialog}
                    equipment={data.equipment || []}
                    appEquipment={appForm.equipment}
                    appId={appForm.id}
                    tgId={tgId}
                    dateTarget={appForm.date_target}
                    onClose={() => setExchangeDialog(null)}
                    onExchange={!appForm.id ? handleDeferredExchange : undefined}
                />,
                document.body
            )}
        </div>
    );
}

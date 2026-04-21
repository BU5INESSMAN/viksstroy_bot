import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, HardHat, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { motion } from 'framer-motion';
import ExchangeDialog from './ExchangeDialog';
import ObjectSelector from './ObjectSelector';
import EquipmentSelector from './EquipmentSelector';
import TeamSelector from './TeamSelector';
import useEquipDefaultTime from '../../../hooks/useEquipDefaultTime';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    const [equipAvailability, setEquipAvailability] = useState(null);
    const [equipLoading, setEquipLoading] = useState(false);
    const [timeAutoSet, setTimeAutoSet] = useState(false);
    const [actionChoiceEquip, setActionChoiceEquip] = useState(null);
    const defaultTime = useEquipDefaultTime();

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
        if (form.date_target) fetchAvailability(form.date_target);
    }, [form.date_target, fetchAvailability]);

    useEffect(() => {
        if (form.team_ids.length > 0) {
            // Partial-brigade picker: pass the edit app's own id as
            // exclude_app_id so its own selected members aren't marked
            // as "used" against themselves.
            const params = new URLSearchParams();
            if (form.date_target) params.set('date', form.date_target);
            if (form.id) params.set('exclude_app_id', String(form.id));
            const qs = params.toString() ? `?${params.toString()}` : '';
            Promise.all(form.team_ids.map(id => axios.get(`/api/teams/${id}/details${qs}`)))
                .then(responses => {
                    const allMembers = responses.flatMap(res => {
                        const tid = res.data?.id;
                        const tname = res.data?.name || '';
                        return (res.data?.members || []).map(m => ({ ...m, team_id: tid, team_name: tname }));
                    });
                    const uniqueMembers = Array.from(new Map(allMembers.map(m => [m.id, m])).values());
                    setTeamMembers(uniqueMembers);
                }).catch(() => setTeamMembers([]));
        } else {
            setTeamMembers([]);
        }
    }, [form.team_ids.join(','), form.date_target, form.id]);

    const handleFormChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const checkTeamStatus = (team_id) => {
        // Mirrors useAppForm.checkTeamStatus (partial-brigade aware).
        if (!data.kanban_apps) return { state: 'free' };
        const appsOnDate = data.kanban_apps.filter(a =>
            a.date_target === form.date_target && !['rejected', 'cancelled', 'completed'].includes(a.status)
        );
        let partialHit = null;
        for (const a of appsOnDate) {
            if (form.id === a.id) continue;
            const tIds = a.team_id ? String(a.team_id).split(',').map(Number) : [];
            if (!tIds.includes(team_id)) continue;
            const otherSelected = a.selected_members
                ? String(a.selected_members).split(',').map(s => Number(s.trim())).filter(Boolean)
                : [];
            if (otherSelected.length === 0) {
                return { state: 'busy', message: `Бригада полностью занята в этот день на объекте:\n📍 ${a.object_address}` };
            }
            partialHit = partialHit || { state: 'partial', message: `Бригада частично занята (заявка №${a.id} · ${a.object_address}).` };
        }
        return partialHit || { state: 'free' };
    };

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
        let best = freeSlots[0];
        if (freeSlots.length > 1) {
            const toMin = (t) => { const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1] || 0); };
            best = freeSlots.reduce((a, b) => (toMin(b.time_end) - toMin(b.time_start)) > (toMin(a.time_end) - toMin(a.time_start)) ? b : a, freeSlots[0]);
        }
        const tsHour = best.time_start.split(':')[0];
        const teHour = best.time_end.split(':')[0];
        const displayName = makeDisplayName(eqAvail);
        setForm(prev => ({
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

        const isSelected = form.equipment.some(eq => eq.id === eqAvail.id);
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

        toggleEquipmentSelection({ id: eqAvail.id, name: eqAvail.name, driver: eqAvail.driver_fio, license_plate: eqAvail.license_plate });
    };

    const toggleTeamSelection = (id) => {
        setForm(prev => {
            const newIds = prev.team_ids.includes(id) ? prev.team_ids.filter(x => x !== id) : [...prev.team_ids, id];
            return { ...prev, team_ids: newIds };
        });
    };

    const toggleAppMember = (id) => {
        const target = teamMembers.find(m => m.id === id);
        if (target?.is_used) {
            toast.error(
                target.used_in_object
                    ? `Уже занят: заявка №${target.used_in_app_id} · ${target.used_in_object}`
                    : `Уже занят в заявке №${target.used_in_app_id}`
            );
            return;
        }
        setForm(prev => ({
            ...prev,
            members: prev.members.includes(id) ? prev.members.filter(m => m !== id) : [...prev.members, id]
        }));
    };

    const selectAllFreeInTeam = (teamId) => {
        const freeIds = teamMembers
            .filter(m => m.team_id === teamId && !m.is_used)
            .map(m => m.id);
        setForm(prev => {
            const keep = (prev.members || []).filter(mid => {
                const mm = teamMembers.find(x => x.id === mid);
                return !mm || mm.team_id !== teamId;
            });
            return { ...prev, members: [...keep, ...freeIds] };
        });
    };

    const toggleEquipmentSelection = (equip) => {
        setForm(prev => {
            const exists = prev.equipment.find(e => e.id === equip.id);
            if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== equip.id) };
            const displayName = equip.driver ? `${equip.name} [${equip.license_plate || 'нет г.н.'}] (${equip.driver})` : `${equip.name} [${equip.license_plate || 'нет г.н.'}]`;
            return { ...prev, equipment: [...prev.equipment, { id: equip.id, name: displayName, time_start: defaultTime.start, time_end: defaultTime.end }] };
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
                        id: e.id, name: e.driver ? `${e.name} [${e.license_plate || 'нет г.н.'}] (${e.driver})` : `${e.name} [${e.license_plate || 'нет г.н.'}]`, time_start: defaultTime.start, time_end: defaultTime.end
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
        <motion.div
            className="!fixed !inset-0 !top-0 !left-0 !w-full !h-[100dvh] z-[99990] bg-black/50 m-0 p-0 overflow-y-auto"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
        >
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <motion.div
                    className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg sm:max-w-2xl shadow-2xl relative transition-colors overflow-hidden"
                    initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                >

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

                    <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                            <div className="sm:col-span-2">
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
                            <TeamSelector
                                teams={data?.teams}
                                teamIds={form.team_ids}
                                onToggleTeam={(id) => id === null ? handleFormChange('team_ids', []) : toggleTeamSelection(id)}
                                teamMembers={teamMembers}
                                selectedMembers={form.members}
                                onToggleMember={toggleAppMember}
                                onSelectAllFreeInTeam={selectAllFreeInTeam}
                                checkTeamStatus={checkTeamStatus}
                                isSubmitting={isSubmitting}
                                isViewOnly={false}
                            />
                        </div>

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        {/* Equipment */}
                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Truck className="w-4 h-4" /> Требуемая техника
                            </label>
                            <EquipmentSelector
                                equipAvailability={equipAvailability}
                                equipLoading={equipLoading}
                                equipment={data.equipment}
                                equipCategories={data?.equip_categories}
                                selectedEquipment={form.equipment}
                                activeEqCategory={activeEqCategory}
                                setActiveEqCategory={setActiveEqCategory}
                                isSubmitting={isSubmitting}
                                isViewOnly={false}
                                handleEquipClick={handleEquipClick}
                                makeDisplayName={makeDisplayName}
                                getEquipState={getEquipState}
                                updateEquipmentTime={updateEquipmentTime}
                                timeAutoSet={timeAutoSet}
                                setTimeAutoSet={setTimeAutoSet}
                                openProfile={openProfile}
                                onCloseModal={onClose}
                                actionChoiceEquip={actionChoiceEquip}
                                setActionChoiceEquip={setActionChoiceEquip}
                                handleFreeTimeSelect={handleFreeTimeSelect}
                                openExchangeDialog={openExchangeDialog}
                            />
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
                </motion.div>
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
        </motion.div>
    );
}

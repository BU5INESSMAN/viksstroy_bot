import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, HardHat, X, XCircle, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { motion } from 'framer-motion';
import ExchangeDialog from './ExchangeDialog';
import ObjectSelector from './ObjectSelector';
import EquipmentSelector from './EquipmentSelector';
import TeamSelector from './TeamSelector';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CreateAppModal({
    appForm, setAppForm, isSubmitting, setGlobalCreateAppOpen,
    handleCreateApp, handleDeleteApp, handleFormChange, handleApplyDefaults,
    handleObjectSelect,
    smartDates, objectsList, data, role,
    toggleTeamSelection, toggleAppMember, selectAllFreeInTeam,
    checkTeamStatus, checkEquipStatus,
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

                    <form onSubmit={handleCreateApp} className="p-6 sm:p-8 space-y-6 text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                            <div className="sm:col-span-2">
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

                            <TeamSelector
                                teams={data?.teams}
                                teamIds={appForm.team_ids}
                                onToggleTeam={(id) => id === null ? handleFormChange('team_ids', []) : toggleTeamSelection(id)}
                                teamMembers={teamMembers}
                                selectedMembers={appForm.members}
                                onToggleMember={toggleAppMember}
                                onSelectAllFreeInTeam={selectAllFreeInTeam}
                                checkTeamStatus={checkTeamStatus}
                                isSubmitting={isSubmitting}
                                isViewOnly={appForm.isViewOnly}
                                appForm={appForm}
                                data={data}
                                role={role}
                                openProfile={openProfile}
                                onCloseModal={() => setGlobalCreateAppOpen(false)}
                                openFreeModal={openFreeModal}
                            />
                        </div>

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Truck className="w-4 h-4" /> Требуемая техника
                            </label>

                            <EquipmentSelector
                                equipAvailability={equipAvailability}
                                equipLoading={equipLoading}
                                equipment={data.equipment}
                                equipCategories={data?.equip_categories}
                                selectedEquipment={appForm.equipment}
                                activeEqCategory={activeEqCategory}
                                setActiveEqCategory={setActiveEqCategory}
                                isSubmitting={isSubmitting}
                                isViewOnly={appForm.isViewOnly}
                                handleEquipClick={handleEquipClick}
                                makeDisplayName={makeDisplayName}
                                getEquipState={getEquipState}
                                updateEquipmentTime={updateEquipmentTime}
                                timeAutoSet={timeAutoSet}
                                setTimeAutoSet={setTimeAutoSet}
                                openProfile={openProfile}
                                onCloseModal={() => setGlobalCreateAppOpen(false)}
                                actionChoiceEquip={actionChoiceEquip}
                                setActionChoiceEquip={setActionChoiceEquip}
                                handleFreeTimeSelect={handleFreeTimeSelect}
                                openExchangeDialog={openExchangeDialog}
                            />
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
                </motion.div>
            </div>
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
        </motion.div>
    );
}

import { createPortal } from 'react-dom';
import {
    Truck, Clock, CheckCircle, ClipboardList,
    XCircle, RefreshCw, Lock, ArrowLeftRight
} from 'lucide-react';

export default function EquipmentSelector({
    equipAvailability,
    equipLoading,
    equipment,
    equipCategories,
    selectedEquipment,
    activeEqCategory,
    setActiveEqCategory,
    isSubmitting,
    isViewOnly,
    handleEquipClick,
    makeDisplayName,
    getEquipState,
    updateEquipmentTime,
    timeAutoSet,
    setTimeAutoSet,
    openProfile,
    onCloseModal,
    actionChoiceEquip,
    setActionChoiceEquip,
    handleFreeTimeSelect,
    openExchangeDialog,
}) {
    return (
        <>
            {/* Category tabs — only shown in edit mode */}
            {!isViewOnly && (
                <>
                    <div className="flex flex-wrap gap-2.5 mb-3">
                        {equipCategories?.map(cat => (
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
                            {(equipAvailability || equipment || [])
                                .filter(e => e.category === activeEqCategory)
                                .map(eqA => {
                                    const isSelected = selectedEquipment.some(eq => eq.id === eqA.id);
                                    const displayName = makeDisplayName(eqA);
                                    const state = getEquipState(eqA);
                                    const busySlots = eqA.busy_slots || [];
                                    const freeSlots = eqA.free_slots || [];
                                    const isDisabled = isSubmitting || state === 'repair' || state === 'unavailable' || state === 'in_exchange';

                                    let rowBg = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50';
                                    let statusBadge = null;
                                    let subtitle = null;

                                    if (isSelected) {
                                        const selEq = selectedEquipment.find(eq => eq.id === eqA.id);
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
                                                        ? <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${selectedEquipment.find(eq => eq.id === eqA.id)?.isPartialTime ? 'text-amber-500' : 'text-blue-500'}`} />
                                                        : <Truck className={`w-4 h-4 flex-shrink-0 mt-0.5 ${state === 'repair' || state === 'unavailable' ? 'text-gray-300' : (state === 'exchange' || state === 'both') ? 'text-amber-500' : 'text-gray-500'}`} />
                                                    }
                                                    <div className="min-w-0 flex-1">
                                                        <span className={`text-sm font-bold truncate block ${state === 'unavailable' || state === 'in_exchange' ? 'text-gray-400' : 'dark:text-gray-200'}`}>
                                                            {eqA.name} {eqA.license_plate ? `[${eqA.license_plate}]` : ''}
                                                        </span>
                                                        {(eqA.driver_fio && eqA.driver_fio !== 'Не указан') && (
                                                            <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate block">{eqA.driver_fio}</span>
                                                        )}
                                                    </div>
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

            {/* Selected equipment list with time inputs */}
            {selectedEquipment.length > 0 ? (
                <div className="mt-5 space-y-3.5 p-5 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30 shadow-inner">
                    <label className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider border-b border-blue-200 dark:border-blue-800/50 pb-3 mb-4">
                        <ClipboardList className="w-4 h-4" /> Список машин:
                    </label>
                    {selectedEquipment.map(eq => {
                        const isPartial = eq.isPartialTime;
                        const cardBorder = isPartial ? 'border-amber-200 dark:border-amber-700/50' : 'border-blue-100 dark:border-blue-700/50';
                        const cardBg = isPartial ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'bg-white dark:bg-gray-800';
                        return (
                            <div key={eq.id} className={`flex flex-col sm:flex-row sm:items-center justify-between ${cardBg} p-4 rounded-xl border ${cardBorder} shadow-sm gap-4 hover:shadow-md transition-shadow`}>
                                {isViewOnly ? (
                                    <button type="button" disabled={isSubmitting} onClick={() => { onCloseModal(); openProfile(0, 'equip', eq.id); }} className={`font-bold text-sm text-left hover:underline disabled:opacity-50 flex items-center gap-2 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
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
                                        <input type="number" min="0" max="23" disabled={isViewOnly || isSubmitting} value={eq.time_start} onChange={e => { updateEquipmentTime(eq.id, 'time_start', e.target.value); setTimeAutoSet(false); }} className={`w-12 text-center py-2 text-sm font-bold outline-none disabled:opacity-80 ${isPartial && timeAutoSet ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' : 'bg-transparent dark:bg-gray-800 dark:text-white'}`} />
                                        <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                    </div>
                                    <span className="text-gray-400 font-bold px-1">—</span>
                                    <div className={`flex items-center rounded-lg overflow-hidden border shadow-sm focus-within:ring-2 ${isPartial && timeAutoSet ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600 focus-within:ring-amber-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 focus-within:ring-blue-500'}`}>
                                        <span className={`px-2 py-2 text-[10px] font-extrabold border-r ${isPartial && timeAutoSet ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 border-amber-300 dark:border-amber-600' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600'}`}>ДО</span>
                                        <input type="number" min="0" max="23" disabled={isViewOnly || isSubmitting} value={eq.time_end} onChange={e => { updateEquipmentTime(eq.id, 'time_end', e.target.value); setTimeAutoSet(false); }} className={`w-12 text-center py-2 text-sm font-bold outline-none disabled:opacity-80 ${isPartial && timeAutoSet ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' : 'bg-transparent dark:bg-gray-800 dark:text-white'}`} />
                                        <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                isViewOnly && (
                    <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center">
                        <Truck className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                        <p className="font-medium text-gray-600 dark:text-gray-300">Техника не требуется</p>
                    </div>
                )
            )}

            {/* Action choice portal */}
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
        </>
    );
}

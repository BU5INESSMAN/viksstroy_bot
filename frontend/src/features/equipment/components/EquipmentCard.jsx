import { useState } from 'react';
import {
    Truck, User, Unplug, Link, CheckCircle, Wrench, Pencil,
    Settings, ChevronDown, BarChart3, Star, Pencil as PencilSm,
} from 'lucide-react';
import { formatEquipName } from '../../../utils/equipFormat';
import { EQUIPMENT_ICONS, getIconComponent, DEFAULT_EQUIPMENT_ICON } from '../../../utils/iconConfig';

export default function EquipmentCard({
    eq, canManageEquipment, canDeleteEquipment, isOffice,
    openProfile, handleUnlinkEquipment, generateInvite,
    handleEquipStatusChange, onEdit, onStats, onSetDefaultDriver,
}) {
    const [showMenu, setShowMenu] = useState(false);
    const CategoryIcon = getIconComponent(eq.category_icon, EQUIPMENT_ICONS)
        || getIconComponent(DEFAULT_EQUIPMENT_ICON, EQUIPMENT_ICONS);
    // v2.6: equipment owns the default-driver relation. `default_driver_fio`
    // is server-enriched by the admin_list endpoint (LEFT JOIN users on
    // equipment.default_driver_user_id). Falsy → no default assigned yet.
    const defaultDriverName = eq.default_driver_fio || '';
    const hasDefault = !!eq.default_driver_user_id;
    // v2.6 commit 7: legacy `eq.tg_id` / `eq.driver_fio` reads severed.
    // "Профиль водителя" menu now opens the default driver's user-page
    // when one is assigned. No driver → no menu item.
    const hasDriver = hasDefault;

    return (
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all">
            <div>
                <div className="flex justify-between items-start mb-3">
                    <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider border border-indigo-100 dark:border-indigo-800/50 inline-flex items-center gap-1.5">
                        <CategoryIcon className="w-3 h-3" stroke={2} />
                        {eq.category}
                    </span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 ${eq.status === 'free' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : eq.status === 'work' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50'}`}>
                        {eq.status === 'free' ? <CheckCircle className="w-3 h-3" /> : eq.status === 'work' ? <Truck className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                        {eq.status === 'free' ? 'Свободна' : eq.status === 'work' ? 'В работе' : 'Ремонт'}
                    </span>
                </div>
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight mb-2">{formatEquipName(eq.name, eq.license_plate)}</h3>
                {/* v2.6 commit 7: legacy "Водитель: {driver_fio}" row removed.
                    The default driver row below is the single source of
                    truth for driver-on-equipment display. */}

                {/* v2.6: default driver row — all roles see it; only office sees the edit button. */}
                <div className={`mt-2 flex items-center gap-2 text-sm font-medium p-2.5 rounded-lg border ${hasDefault
                    ? 'bg-amber-50/60 dark:bg-amber-900/20 text-gray-700 dark:text-gray-300 border-amber-100 dark:border-amber-800/30'
                    : 'bg-gray-50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-600/50'}`}>
                    <Star className={`w-4 h-4 shrink-0 ${hasDefault ? 'text-amber-500' : 'text-gray-400'}`} />
                    <span className="flex-1 min-w-0 truncate">
                        Драйвер по умолчанию: {hasDefault
                            ? <b className="text-gray-800 dark:text-gray-200">{defaultDriverName || '—'}</b>
                            : <span className="italic">не назначен</span>}
                    </span>
                    {isOffice && onSetDefaultDriver && (
                        <button
                            onClick={() => onSetDefaultDriver(eq)}
                            title="Изменить водителя по умолчанию"
                            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors active:scale-95"
                        >
                            <PencilSm className="w-3 h-3" />
                            Изменить
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                {onStats && (
                    <button onClick={() => onStats(eq)} title="Статистика" className="flex-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 dark:border-blue-800/50 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                        <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden lg:inline truncate">Статистика</span>
                    </button>
                )}

                {canManageEquipment && (
                    <div className="relative flex-1">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            title="Параметры"
                            className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 dark:border-gray-700 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95"
                        >
                            <Settings className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden lg:inline truncate">Параметры</span>
                            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
                        </button>

                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                                    {hasDriver && (
                                        // v2.6 commit 7: opens the default driver's
                                        // user-profile (was: equipment.tg_id, which
                                        // is severed).
                                        <button onClick={() => { openProfile(eq.default_driver_user_id, 'user', 0); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors">
                                            <User className="w-4 h-4 text-blue-500" /> Профиль водителя
                                        </button>
                                    )}
                                    <button onClick={() => { generateInvite(eq); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors">
                                        <Link className="w-4 h-4 text-indigo-500" /> Дать доступ
                                    </button>
                                    {/* v2.6 commit 7: legacy `eq.tg_id`-based "Отвязать водителя"
                                        action removed. Default-driver detachment now lives in
                                        the DefaultDriverModal "Снять" button per equipment. */}
                                    <button onClick={() => { handleEquipStatusChange(eq.id, eq.status === 'repair' ? 'free' : 'repair'); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors">
                                        {eq.status === 'repair'
                                            ? <><CheckCircle className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-600 dark:text-emerald-400">Вернуть в строй</span></>
                                            : <><Wrench className="w-4 h-4 text-red-500" /> <span className="text-red-600 dark:text-red-400">В ремонт</span></>
                                        }
                                    </button>
                                    {canDeleteEquipment && (
                                        <button onClick={() => { onEdit(eq); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-gray-700">
                                            <Pencil className="w-4 h-4 text-gray-400" /> Редактировать
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

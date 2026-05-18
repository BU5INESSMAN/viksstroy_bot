import { useState } from 'react';
import {
    User, Pencil, Send, Star, Settings, ChevronDown,
    Trash2, RefreshCw, Link2, ShieldAlert,
} from 'lucide-react';
import { displayFio } from '../../../utils/fioFormat';
import { EQUIPMENT_ICONS, getIconComponent, DEFAULT_EQUIPMENT_ICON } from '../../../utils/iconConfig';

/**
 * DriverCard — one driver tile on the Resources → Водители tab.
 *
 * Visual language follows Teams/EquipmentCard: GlassCard-ish white box,
 * soft hover lift (Emil principle: subtle motion that confirms "I am
 * interactive" without competing with content), category chips, default
 * equipment line with star, pending invite_code shown explicitly for
 * not-yet-redeemed drivers.
 */
export default function DriverCard({
    driver, canManage,
    onEdit, onDelete, onRegenerateInvite, onShowInvite,
}) {
    const [showMenu, setShowMenu] = useState(false);
    const fio = displayFio(driver);

    const isLinked = !driver.is_synthetic && (driver.tg_id || driver.max_id);
    const pending = driver.is_synthetic;

    return (
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-cyan-300 dark:hover:border-cyan-700 hover:-translate-y-0.5 transition-all">
            <div>
                <div className="flex justify-between items-start mb-3">
                    <span className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider border border-cyan-100 dark:border-cyan-800/50 inline-flex items-center gap-1.5">
                        <User className="w-3 h-3" /> Водитель
                    </span>
                    {isLinked ? (
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 inline-flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            {driver.tg_id ? 'TG' : 'MAX'}
                        </span>
                    ) : (
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 inline-flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" /> Не привязан
                        </span>
                    )}
                </div>

                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight mb-2">{fio}</h3>

                {driver.categories?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {driver.categories.map((c) => {
                            const Icon = getIconComponent(c.icon, EQUIPMENT_ICONS)
                                || getIconComponent(DEFAULT_EQUIPMENT_ICON, EQUIPMENT_ICONS);
                            return (
                                <span key={c.name} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                    <Icon className="w-3 h-3" /> {c.name}
                                </span>
                            );
                        })}
                    </div>
                )}

                {driver.default_equipment_name && (
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 font-medium bg-amber-50/60 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-100 dark:border-amber-800/30">
                        <Star className="w-4 h-4 text-amber-500" />
                        <span>По умолчанию: <b className="text-gray-800 dark:text-gray-200">{driver.default_equipment_name}</b></span>
                    </div>
                )}

                {pending && driver.invite_code && (
                    <div className="mt-3 p-3 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10">
                        <div className="text-[10px] uppercase tracking-wider font-extrabold text-amber-700 dark:text-amber-400 mb-1">Код приглашения</div>
                        <code className="text-base font-bold tracking-wider text-amber-700 dark:text-amber-400">{driver.invite_code}</code>
                    </div>
                )}
            </div>

            {canManage && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                    <button onClick={() => onEdit(driver)} title="Редактировать" className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 dark:border-gray-700 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                        <Pencil className="w-3.5 h-3.5" />
                        <span className="hidden lg:inline">Изменить</span>
                    </button>
                    <div className="relative flex-1">
                        <button onClick={() => setShowMenu(!showMenu)} title="Параметры" className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 dark:border-gray-700 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                            <Settings className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Действия</span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                                    <button onClick={() => { onShowInvite(driver); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors">
                                        <Send className="w-4 h-4 text-blue-500" /> Показать приглашение
                                    </button>
                                    <button onClick={() => { onRegenerateInvite(driver); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors">
                                        <RefreshCw className="w-4 h-4 text-indigo-500" /> Перегенерировать код
                                    </button>
                                    <button onClick={() => { onDelete(driver); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-gray-700">
                                        <Trash2 className="w-4 h-4" /> Удалить
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

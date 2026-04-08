import {
    Truck, User, Unplug, Link,
    CheckCircle, Wrench, Trash2
} from 'lucide-react';

export default function EquipmentCard({ eq, canManageEquipment, canDeleteEquipment, openProfile, handleUnlinkEquipment, generateInvite, handleEquipStatusChange, handleDeleteEquip }) {
    return (
        <div key={eq.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all">
            <div>
                <div className="flex justify-between items-start mb-3">
                    <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider border border-indigo-100 dark:border-indigo-800/50">{eq.category}</span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 ${eq.status === 'free' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : eq.status === 'work' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50'}`}>
                        {eq.status === 'free' ? <CheckCircle className="w-3 h-3" /> : eq.status === 'work' ? <Truck className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                        {eq.status === 'free' ? 'Свободна' : eq.status === 'work' ? 'В работе' : 'Ремонт'}
                    </span>
                </div>
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight mb-2">{eq.name}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 font-medium bg-gray-50 dark:bg-gray-700/30 p-2.5 rounded-lg border border-gray-100 dark:border-gray-600/50">
                    <User className="w-4 h-4 text-gray-400" />
                    <span>Водитель: <b className="text-gray-800 dark:text-gray-200">{eq.driver_fio || 'Не назначен'}</b></span>
                </div>
            </div>

            {canManageEquipment && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col space-y-2.5">
                    <div className="flex space-x-2">
                        <button onClick={() => openProfile(eq.tg_id, 'equip', eq.id)} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 py-2.5 rounded-xl text-xs font-bold transition-colors text-center flex items-center justify-center gap-1.5 active:scale-95">
                            <User className="w-3.5 h-3.5" /> Профиль
                        </button>

                        {eq.tg_id ? (
                            <button onClick={() => handleUnlinkEquipment(eq.id)} className="flex-[2] bg-orange-50 hover:bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 dark:text-orange-400 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                                <Unplug className="w-3.5 h-3.5" /> Отвязать водителя
                            </button>
                        ) : (
                            <button onClick={() => generateInvite(eq)} className="flex-[2] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 dark:text-indigo-400 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95">
                                <Link className="w-3.5 h-3.5" /> Дать доступ
                            </button>
                        )}
                    </div>
                    <div className="flex space-x-2">
                        <button onClick={() => handleEquipStatusChange(eq.id, eq.status === 'repair' ? 'free' : 'repair')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95 ${eq.status === 'repair' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 hover:bg-emerald-100' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100'}`}>
                            {eq.status === 'repair' ? <><CheckCircle className="w-3.5 h-3.5" /> В строй</> : <><Wrench className="w-3.5 h-3.5" /> В ремонт</>}
                        </button>

                        {canDeleteEquipment && (
                            <button onClick={() => handleDeleteEquip(eq.id)} className="bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 py-2.5 px-4 rounded-xl text-xs font-bold transition-colors active:scale-95 flex items-center justify-center">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, Clock, CheckCircle, HardHat, Flag, X, User
} from 'lucide-react';

export default function ViewAppModal({ app, onClose, data }) {
    if (!app) return null;

    // Расшифровываем статусы
    const statusConfig = {
        'waiting': { label: 'Ожидание', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: Clock },
        'approved': { label: 'Одобрено', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500', icon: CheckCircle },
        'published': { label: 'В работе', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: HardHat },
        'completed': { label: 'Завершено', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Flag }
    };

    const currentStatus = statusConfig[app.status] || statusConfig['waiting'];
    const StatusIcon = currentStatus.icon;

    // Парсим технику
    let eqList = [];
    if (app.equipment_data) {
        try {
            eqList = typeof app.equipment_data === 'string' ? JSON.parse(app.equipment_data) : app.equipment_data;
        } catch (e) {
            console.error("Ошибка парсинга техники", e);
        }
    }

    // Сопоставляем ID рабочих с их именами (ищем по всем бригадам)
    const workerIds = app.workers ? String(app.workers).split(',').map(Number) : [];
    const allMembers = data?.teams?.flatMap(t => t.members) || [];

    const resolvedWorkers = workerIds.map(id => {
        const member = allMembers.find(m => m.id === id);
        return member ? member.fio : `Сотрудник (ID: ${id})`;
    });

    return (
        <div className="fixed inset-0 z-[120] bg-black/60 overflow-y-auto backdrop-blur-sm transition-opacity flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl relative transition-colors overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Шапка */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                    <div>
                        <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-white mb-1.5">
                            <ClipboardList className="w-6 h-6 text-blue-500 mr-2.5" />
                            Просмотр наряда
                        </h2>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${currentStatus.color}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {currentStatus.label}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700 transition-colors active:scale-95 shadow-sm">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Основной контент */}
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">

                    {/* Базовая информация */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Дата работ</span>
                            <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                {app.date_target}
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Объект</span>
                            <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-red-500" />
                                {app.obj_name || 'Неизвестный объект'}
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Прораб</span>
                        <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <User className="w-4 h-4 text-yellow-500" />
                            {app.foreman_name || 'Не назначен'}
                        </div>
                    </div>

                    {/* Рабочие */}
                    <div className="border border-indigo-100 dark:border-indigo-900/30 rounded-2xl p-5 bg-indigo-50/30 dark:bg-indigo-900/10">
                        <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 mb-3">
                            <Users className="w-5 h-5 text-indigo-500" /> Состав рабочих ({resolvedWorkers.length})
                        </h4>
                        {resolvedWorkers.length > 0 ? (
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {resolvedWorkers.map((name, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        {name}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 italic">Рабочие не назначены</p>
                        )}
                    </div>

                    {/* Техника */}
                    <div className="border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-5 bg-emerald-50/30 dark:bg-emerald-900/10">
                        <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-2 mb-3">
                            <Truck className="w-5 h-5 text-emerald-500" /> Задействованная техника ({eqList.length})
                        </h4>
                        {eqList.length > 0 ? (
                            <div className="space-y-2">
                                {eqList.map((eq, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center gap-2">
                                            {eq.is_freed ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1.5 mr-1"></div>}
                                            <span className={`text-sm font-bold ${eq.is_freed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                                {eq.name.split('(')[0].trim()}
                                            </span>
                                        </div>
                                        <span className="text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400 px-2.5 py-1 rounded-lg">
                                            {eq.time || '08:00'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 italic">Техника не назначена</p>
                        )}
                    </div>

                    {/* План работ */}
                    {app.plan_text && (
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-purple-500" /> План работ
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-medium leading-relaxed">
                                {app.plan_text}
                            </p>
                        </div>
                    )}
                </div>

                {/* Подвал */}
                <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                    <button type="button" onClick={onClose} className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-4 px-6 rounded-xl font-bold shadow-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-all active:scale-[0.98]">
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
}
import { Bell, MapPin, CheckCircle, XCircle, X } from 'lucide-react';

export default function ObjectRequestsPanel({ objectRequests, onApprove, onReject, onClose }) {
    return (
        <div className="fixed inset-0 w-screen h-[100dvh] z-[99990] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                    <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                        <Bell className="w-5 h-5 text-amber-500" /> Запросы на объекты
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1.5 border border-gray-100 dark:border-gray-700"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {objectRequests.map(req => (
                        <div
                            key={req.id}
                            className="p-5 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600/50"
                        >
                            <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-2">
                                <MapPin className="w-4 h-4 text-blue-500" /> {req.name}
                            </h4>
                            {req.address && (
                                <p className="text-sm text-gray-500 mb-1">Адрес: {req.address}</p>
                            )}
                            {req.comment && (
                                <p className="text-sm text-gray-500 mb-1">Комментарий: {req.comment}</p>
                            )}
                            <p className="text-xs text-gray-400 mb-3">
                                От: {req.requested_by_name} · {req.created_at?.slice(0, 16)}
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onApprove(req)}
                                    className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-600 active:scale-95 transition-all"
                                >
                                    <CheckCircle className="w-4 h-4" /> Одобрить
                                </button>
                                <button
                                    onClick={() => onReject(req.id)}
                                    className="flex-1 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-red-100 active:scale-95 transition-all border border-red-200 dark:border-red-800/50"
                                >
                                    <XCircle className="w-4 h-4" /> Отклонить
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

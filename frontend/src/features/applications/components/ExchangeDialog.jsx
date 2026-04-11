import { useState, useEffect, useRef } from 'react';
import { RefreshCw, X, Truck, MapPin, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const STATUS_LABELS = {
    pending: 'Новая',
    waiting: 'Ожидание',
    approved: 'Одобрена',
    in_progress: 'В работе',
    published: 'Опубликована',
    completed: 'Завершена',
};

/**
 * @param {object} props
 * @param {function} [props.onExchange] - If provided, called with { requested_equip_id, offered_equip_id, offeredEquipData }
 *   instead of sending API request. Used for deferred exchange during app creation.
 */
export default function ExchangeDialog({ info, equipment, appEquipment, appId, tgId, dateTarget, onClose, onExchange }) {
    const [offeredEquipId, setOfferedEquipId] = useState(null);
    const [sending, setSending] = useState(false);
    const [availableOffer, setAvailableOffer] = useState([]);
    const submitLock = useRef(false);

    useEffect(() => {
        if (!dateTarget) return;

        const candidates = equipment.filter(e =>
            e.category === info.equipCategory &&
            e.id !== info.equipId &&
            (appEquipment.some(ae => ae.id === e.id) || e.status === 'free')
        );

        Promise.all(
            candidates.map(async (e) => {
                try {
                    const res = await axios.get(`/api/exchange/check_equip/${e.id}?date=${dateTarget}`);
                    return { ...e, inExchange: res.data.is_in_pending_exchange };
                } catch {
                    return { ...e, inExchange: false };
                }
            })
        ).then(results => {
            setAvailableOffer(results.filter(e => !e.inExchange));
        });
    }, [info, equipment, appEquipment, dateTarget]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (submitLock.current || sending) return;
        submitLock.current = true;

        if (!offeredEquipId) {
            submitLock.current = false;
            return toast.error('Выберите технику для обмена');
        }

        // Deferred mode: just save the intent, don't call API
        if (onExchange) {
            const offeredEquip = availableOffer.find(eq => eq.id === offeredEquipId);
            onExchange({
                requested_equip_id: info.equipId,
                offered_equip_id: offeredEquipId,
                offeredEquipData: offeredEquip,
            });
            submitLock.current = false;
            onClose();
            return;
        }

        // Immediate mode: send API request (used when app already exists)
        setSending(true);
        try {
            const res = await axios.post('/api/exchange/request', {
                requester_tg_id: tgId,
                requester_app_id: appId,
                requested_equip_id: info.equipId,
                offered_equip_id: offeredEquipId,
            });
            if (res.data.success) {
                toast.success('Запрос на обмен отправлен. Ожидайте ответа.');
                onClose();
            } else {
                toast.error(res.data.error || 'Ошибка');
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Ошибка отправки');
        } finally {
            setSending(false);
            setTimeout(() => { submitLock.current = false; }, 500);
        }
    };

    const handleClose = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4" onClick={handleClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 flex items-center justify-between">
                    <h3 className="text-white font-bold flex items-center gap-2">
                        <RefreshCw className="w-5 h-5" /> Техника занята
                    </h3>
                    <button type="button" onClick={handleClose} className="text-white/80 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Equipment info */}
                    <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-200 dark:border-gray-600 space-y-2">
                        <p className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <Truck className="w-4 h-4 text-blue-500" />
                            {info.equipName}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <span className="font-medium">Занята:</span> {info.holderName}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5" />
                            {info.holderObject}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            Статус заявки: {STATUS_LABELS[info.holderAppStatus] || info.holderAppStatus}
                        </p>
                    </div>

                    {/* Exchange offer */}
                    <div>
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                            Предложить обмен? Выберите технику взамен:
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            (только техника той же категории)
                        </p>

                        {availableOffer.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic p-3 bg-gray-50 dark:bg-gray-700/20 rounded-xl text-center">
                                Нет доступной техники для обмена
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                                {availableOffer.map(e => {
                                    const displayName = e.driver ? `${e.name} [${e.license_plate || 'нет г.н.'}] (${e.driver})` : `${e.name} [${e.license_plate || 'нет г.н.'}]`;
                                    const isSelected = offeredEquipId === e.id;
                                    const inApp = appEquipment.some(ae => ae.id === e.id);
                                    return (
                                        <button
                                            key={e.id}
                                            type="button"
                                            onClick={() => setOfferedEquipId(e.id)}
                                            className={`text-left px-3.5 py-2.5 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 ${
                                                isSelected
                                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-500'
                                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <Truck className="w-4 h-4 flex-shrink-0" />
                                            <span className="flex-1">{displayName}</span>
                                            {inApp && <span className="text-xs text-gray-400">(в заявке)</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Deferred mode hint */}
                    {onExchange && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
                            Запрос на обмен будет отправлен после создания заявки
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={sending}
                            className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 py-3 px-4 rounded-xl font-bold text-gray-700 dark:text-gray-300 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                            Отменить
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={sending || !offeredEquipId}
                            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex justify-center items-center gap-2"
                        >
                            {sending ? '⏳...' : <><RefreshCw className="w-4 h-4" /> Обменять</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, CheckCheck, ChevronLeft, ExternalLink, Clock3 } from 'lucide-react';
import axios from 'axios';
import ModalPortal from '../../../components/ui/ModalPortal';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TYPE_LABELS = {
    app_new: 'Новая заявка',
    app_approved: 'Заявка одобрена',
    app_rejected: 'Заявка отклонена',
    app_status_changed: 'Статус заявки',
    app_moderator_edited: 'Изменение заявки',
    smr_debt: 'СМР',
    exchange_request: 'Обмен',
    object_request: 'Объекты',
    delivery_failed: 'Система',
    error: 'Система',
};

const getTypeLabel = (type = '') => {
    if (TYPE_LABELS[type]) return TYPE_LABELS[type];
    if (type.includes('app')) return 'Заявки';
    if (type.includes('smr') || type.includes('report')) return 'СМР';
    if (type.includes('exchange')) return 'Обмен';
    if (type.includes('object')) return 'Объекты';
    if (type.includes('error') || type.includes('incident') || type.includes('system')) return 'Система';
    return 'Уведомление';
};

const parseDate = (ts) => {
    if (!ts) return null;
    let safe = ts;
    if (typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')) safe = ts.replace(' ', 'T') + 'Z';
    const date = new Date(safe);
    return Number.isNaN(date.getTime()) ? null : date;
};

export default function NotificationsModal({ isOpen, onClose, onNavigate }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setSelected(null);
            setLoading(true);
            axios.get('/api/notifications/my?limit=50')
                .then(r => { setNotifications(r.data.notifications || []); setUnreadCount(r.data.unread_count || 0); })
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    const markAllRead = async () => {
        try {
            const fd = new URLSearchParams(); fd.append('notification_ids', 'all');
            await axios.post('/api/notifications/read', fd);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch {}
    };

    const markRead = async (id) => {
        try {
            const fd = new URLSearchParams(); fd.append('notification_ids', String(id));
            await axios.post('/api/notifications/read', fd);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch {}
    };

    const openNotification = (notification) => {
        setSelected({ ...notification, is_read: true });
        if (!notification.is_read) markRead(notification.id);
    };

    if (!isOpen) return null;

    const formatTime = (ts) => {
        if (!ts) return '';
        try {
            const d = parseDate(ts);
            if (!d) return '';
            const diff = Date.now() - d.getTime();
            if (diff < 60000) return 'только что';
            if (diff < 3600000) return `${Math.floor(diff / 60000)} мин`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч`;
            return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        } catch { return ''; }
    };

    const formatFullTime = (ts) => {
        const date = parseDate(ts);
        if (!date) return '';
        return date.toLocaleString('ru-RU', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    };

    const getDetailBody = (notification) => {
        const body = (notification?.body || '').trim();
        const title = (notification?.title || '').trim();
        if (!body) return 'Дополнительная информация не указана.';
        if (title && body.startsWith(title)) {
            const rest = body.slice(title.length).trim().replace(/^[-—:]+\s*/, '');
            if (rest) return rest;
        }
        return body;
    };

    const anim = prefersReducedMotion ? {} : { initial: { opacity: 0, y: -20, scale: 0.95 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -20, scale: 0.95 }, transition: { duration: 0.2 } };

    return (
        <ModalPortal>
        <AnimatePresence>
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-4 sm:pt-24 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
                style={{ top: 0, left: 0, right: 0, bottom: 0 }}
                onClick={onClose}
            >
                <motion.div
                    {...anim}
                    className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-2rem)] sm:max-h-[70vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-2">
                            {selected && (
                                <button onClick={() => setSelected(null)} className="w-10 h-10 -ml-2 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Вернуться к списку уведомлений">
                                    <ChevronLeft className="w-5 h-5 text-gray-500 dark:text-white/60" />
                                </button>
                            )}
                            <Bell className="w-5 h-5 text-gray-500 dark:text-white/60" />
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">{selected ? 'Подробности' : 'Уведомления'}</h3>
                            {!selected && unreadCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-bold">{unreadCount}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {!selected && unreadCount > 0 && (
                                <button onClick={markAllRead} title="Прочитать все" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                                    <CheckCheck className="w-4 h-4 text-blue-500" />
                                </button>
                            )}
                            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Закрыть уведомления">
                                <X className="w-4 h-4 text-gray-400 dark:text-white/50" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {selected ? (
                            <div className="p-5 sm:p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                        {getTypeLabel(selected.type)}
                                    </span>
                                    {!selected.is_read && (
                                        <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Новое</span>
                                    )}
                                </div>
                                <h4 className="text-lg font-bold leading-snug text-gray-900 dark:text-white break-words">{selected.title}</h4>
                                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-white/45">
                                    <Clock3 className="w-4 h-4 flex-shrink-0" />
                                    <span>{formatFullTime(selected.created_at)}</span>
                                </div>
                                <div className="mt-5 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4">
                                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-white/75">{getDetailBody(selected)}</p>
                                </div>
                                {selected.link_url && (
                                    <button
                                        onClick={() => onNavigate?.(selected.link_url)}
                                        className="mt-5 w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition-colors"
                                    >
                                        Открыть связанный раздел
                                        <ExternalLink className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ) : loading ? (
                            <div className="p-8 text-center text-gray-400 dark:text-white/30 text-sm">Загрузка...</div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 dark:text-white/30 text-sm">Нет уведомлений</div>
                        ) : (
                            notifications.map(n => (
                                <button
                                    type="button"
                                    key={n.id}
                                    onClick={() => openNotification(n)}
                                    className={`w-full text-left px-4 py-3 border-b border-gray-50 dark:border-white/5 transition-colors cursor-pointer ${!n.is_read ? 'bg-blue-50/50 dark:bg-blue-500/5 hover:bg-blue-50 dark:hover:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-2 flex-1 min-w-0">
                                            {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-snug ${!n.is_read ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-white/60'} line-clamp-2`}>
                                                    {n.title}
                                                </p>
                                                <p className="mt-1 text-xs text-gray-400 dark:text-white/35">{getTypeLabel(n.type)} · Нажмите, чтобы посмотреть</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-gray-400 dark:text-white/25 whitespace-nowrap flex-shrink-0 mt-0.5">{formatTime(n.created_at)}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        </ModalPortal>
    );
}

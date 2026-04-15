import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, CheckCheck } from 'lucide-react';
import axios from 'axios';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function NotificationsModal({ isOpen, onClose, tgId }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && tgId) {
            setLoading(true);
            axios.get(`/api/notifications/my?tg_id=${tgId}&limit=50`)
                .then(r => { setNotifications(r.data.notifications || []); setUnreadCount(r.data.unread_count || 0); })
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [isOpen, tgId]);

    const markAllRead = async () => {
        try {
            const fd = new URLSearchParams(); fd.append('tg_id', tgId); fd.append('notification_ids', 'all');
            await axios.post('/api/notifications/read', fd);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch {}
    };

    const markRead = async (id) => {
        try {
            const fd = new URLSearchParams(); fd.append('tg_id', tgId); fd.append('notification_ids', String(id));
            await axios.post('/api/notifications/read', fd);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch {}
    };

    if (!isOpen) return null;

    const formatTime = (ts) => {
        if (!ts) return '';
        try {
            let safe = ts;
            if (typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')) safe = ts.replace(' ', 'T') + 'Z';
            const d = new Date(safe);
            const diff = Date.now() - d.getTime();
            if (diff < 60000) return 'только что';
            if (diff < 3600000) return `${Math.floor(diff / 60000)} мин`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч`;
            return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        } catch { return ''; }
    };

    const anim = prefersReducedMotion ? {} : { initial: { opacity: 0, y: -20, scale: 0.95 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -20, scale: 0.95 }, transition: { duration: 0.2 } };

    return (
        <AnimatePresence>
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 px-4"
                onClick={onClose}
            >
                <motion.div
                    {...anim}
                    className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[70vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-2">
                            <Bell className="w-5 h-5 text-gray-500 dark:text-white/60" />
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Уведомления</h3>
                            {unreadCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-bold">{unreadCount}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {unreadCount > 0 && (
                                <button onClick={markAllRead} title="Прочитать все" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                                    <CheckCheck className="w-4 h-4 text-blue-500" />
                                </button>
                            )}
                            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                                <X className="w-4 h-4 text-gray-400 dark:text-white/50" />
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center text-gray-400 dark:text-white/30 text-sm">Загрузка...</div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 dark:text-white/30 text-sm">Нет уведомлений</div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    onClick={() => !n.is_read && markRead(n.id)}
                                    className={`px-4 py-3 border-b border-gray-50 dark:border-white/5 transition-colors ${!n.is_read ? 'bg-blue-50/50 dark:bg-blue-500/5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-2 flex-1 min-w-0">
                                            {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-snug ${!n.is_read ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-white/60'} line-clamp-2`}>
                                                    {n.title}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-gray-400 dark:text-white/25 whitespace-nowrap flex-shrink-0 mt-0.5">{formatTime(n.created_at)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

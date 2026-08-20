import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users } from 'lucide-react';
import axios from 'axios';
import ModalPortal from '../../../components/ui/ModalPortal';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ROLE_NAMES = { superadmin: 'Супер-Админ', boss: 'Руководитель', moderator: 'Модератор', hr: 'Кадры', foreman: 'Прораб', brigadier: 'Бригадир', worker: 'Рабочий', employee: 'Сотрудник', driver: 'Водитель' };
const ROLE_COLORS = { superadmin: 'text-red-500', boss: 'text-orange-500', moderator: 'text-yellow-600 dark:text-yellow-400', hr: 'text-violet-600 dark:text-violet-400', foreman: 'text-blue-500', brigadier: 'text-cyan-500', worker: 'text-emerald-500', employee: 'text-slate-500', driver: 'text-emerald-600 dark:text-emerald-400' };

export default function OnlineUsersModal({ isOpen, onClose }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            axios.get('/api/online')
                .then(r => setUsers(r.data.users || []))
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const formatActive = (ts) => {
        if (!ts) return '';
        try {
            let safe = ts;
            if (typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')) safe = ts.replace(' ', 'T') + 'Z';
            const diff = Date.now() - new Date(safe).getTime();
            if (diff < 60000) return 'сейчас';
            return `${Math.floor(diff / 60000)} мин`;
        } catch { return ''; }
    };

    const anim = prefersReducedMotion ? {} : { initial: { opacity: 0, y: -20, scale: 0.95 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -20, scale: 0.95 }, transition: { duration: 0.2 } };

    return (
        <ModalPortal>
        <AnimatePresence>
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-4 sm:pt-24 px-4 pb-4"
                style={{ top: 0, left: 0, right: 0, bottom: 0 }}
                onClick={onClose}
            >
                <motion.div
                    {...anim}
                    className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-2rem)] sm:max-h-[60vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Онлайн</h3>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">{users.length}</span>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Закрыть">
                            <X className="w-4 h-4 text-gray-400 dark:text-white/50" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center text-gray-400 dark:text-white/30 text-sm">Загрузка...</div>
                        ) : users.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 dark:text-white/30 text-sm">Нет активных пользователей</div>
                        ) : (
                            users.map(u => (
                                <div key={u.user_id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-white/5">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.fio || 'Без имени'}</p>
                                            <p className={`text-[11px] ${ROLE_COLORS[u.role] || 'text-gray-400'}`}>{ROLE_NAMES[u.role] || u.role}</p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-gray-400 dark:text-white/30 whitespace-nowrap flex-shrink-0">{formatActive(u.last_active)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        </ModalPortal>
    );
}

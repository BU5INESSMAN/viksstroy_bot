import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Cog, ChevronDown } from 'lucide-react';
import IconPicker from '../../../components/ui/IconPicker';
import { EQUIPMENT_ICONS, getIconComponent, DEFAULT_EQUIPMENT_ICON } from '../../../utils/iconConfig';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Admin-only modal for assigning icons to equipment categories.
 * Lists every used category + saved setting; click a row expands an
 * IconPicker accordion; pick → PATCH → optimistic update.
 */
export default function CategorySettingsModal({ onClose, onSaved }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);

    useEffect(() => {
        let cancelled = false;
        axios.get('/api/equipment/category-settings')
            .then((res) => { if (!cancelled) { setRows(res.data || []); setLoading(false); } })
            .catch(() => { if (!cancelled) { toast.error('Не удалось загрузить категории'); setLoading(false); } });
        return () => { cancelled = true; };
    }, []);

    const handlePick = async (category, iconKey) => {
        const prev = rows;
        setRows((list) => list.map((r) => r.category === category ? { ...r, icon: iconKey } : r));
        try {
            await axios.patch(
                `/api/equipment/category-settings/${encodeURIComponent(category)}`,
                { icon: iconKey },
            );
            onSaved?.();
        } catch (e) {
            setRows(prev);
            toast.error(e?.response?.data?.detail || 'Ошибка сохранения');
        }
    };

    return (
        <motion.div
            className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
        >
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <motion.div
                    className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
                    initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                            <Cog className="w-5 h-5 text-indigo-500" /> Иконки категорий
                        </h3>
                        <button onClick={onClose} className="text-gray-400 bg-white dark:bg-gray-800 rounded-full p-1.5 border border-gray-100 dark:border-gray-700 hover:bg-gray-50 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-5 space-y-2">
                        {loading ? (
                            <div className="py-12 text-center text-gray-400 text-sm">Загрузка...</div>
                        ) : rows.length === 0 ? (
                            <div className="py-12 text-center text-gray-400 text-sm italic">Нет категорий</div>
                        ) : rows.map((row) => {
                            const iconKey = row.icon || '';
                            const CurrentIcon = getIconComponent(iconKey, EQUIPMENT_ICONS)
                                || getIconComponent(DEFAULT_EQUIPMENT_ICON, EQUIPMENT_ICONS);
                            const isOpen = expanded === row.category;
                            return (
                                <div key={row.category} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(isOpen ? null : row.category)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                                    >
                                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg
                                            ${iconKey ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}`}>
                                            <CurrentIcon className="w-5 h-5" />
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                                                {row.category}
                                            </div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                                {iconKey ? `Иконка: ${EQUIPMENT_ICONS[iconKey]?.label || iconKey}` : 'Без иконки'}
                                            </div>
                                        </span>
                                        <motion.span
                                            animate={{ rotate: isOpen ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="text-gray-400"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </motion.span>
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {isOpen && (
                                            <motion.div
                                                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                                                className="overflow-hidden bg-gray-50/50 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700"
                                            >
                                                <div className="p-4">
                                                    <IconPicker
                                                        value={iconKey || null}
                                                        onChange={(key) => handlePick(row.category, key)}
                                                        icons={EQUIPMENT_ICONS}
                                                        columns={5}
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Users } from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CrossBrigadeWarningModal({ isOpen, onClose, warnings, onConfirm }) {
    if (!isOpen || !warnings?.length) return null;

    const motionProps = prefersReducedMotion ? {} : { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.95 } };
    const bgMotionProps = prefersReducedMotion ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

    return (
        <AnimatePresence>
            <motion.div
                {...bgMotionProps}
                className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
                onClick={onClose}
            >
                <motion.div
                    {...motionProps}
                    className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-yellow-50/50 dark:bg-yellow-900/10">
                        <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                            <AlertTriangle className="w-5 h-5" />
                            <h3 className="text-base font-bold">Внимание: бригадир не выбран</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Следующие сотрудники выбраны без бригадира своей бригады. Отчёт СМР будет оформлен без бригадирской проверки.
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                        {warnings.map((w, i) => (
                            <div key={i} className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                                <p className="text-sm text-gray-800 dark:text-gray-200 font-bold">{w.member.fio}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                                    <Users className="w-3 h-3" /> {w.fromTeam.name} — бригадир не в списке
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                        <button onClick={onClose}
                            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-[0.98]">
                            Назад
                        </button>
                        <button onClick={onConfirm}
                            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-md active:scale-[0.98]">
                            Всё равно создать
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

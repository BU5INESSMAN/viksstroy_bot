import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Users, UserCheck } from 'lucide-react';
import ModalPortal from '../../../components/ui/ModalPortal';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Non-blocking warning shown right before creating an application when
 * the user picked a partial brigade *without its brigadier*. SMR for
 * that team can then only be filled by the foreman — the UI makes that
 * consequence explicit so there are no surprises downstream.
 *
 * Input shape (from useAppForm.checkCrossBrigadeMembers):
 *   [{ team: {id, name}, members: [...], selectedCount, totalCount }]
 */
export default function CrossBrigadeWarningModal({ isOpen, onClose, warnings, onConfirm }) {
    if (!isOpen || !warnings?.length) return null;

    const motionProps = prefersReducedMotion ? {} : { initial: { opacity: 0, scale: 0.95, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: 8 }, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } };
    const bgMotionProps = prefersReducedMotion ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

    const singleTeam = warnings.length === 1;

    return (
        <ModalPortal>
        <AnimatePresence>
            <motion.div
                {...bgMotionProps}
                className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
                onClick={onClose}
            >
                <motion.div
                    {...motionProps}
                    className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-yellow-50/60 dark:bg-yellow-900/10">
                        <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                            <AlertTriangle className="w-5 h-5" />
                            <h3 className="text-base font-bold">
                                {singleTeam
                                    ? `Вы выбрали часть бригады «${warnings[0].team.name}» без бригадира`
                                    : 'Вы выбрали часть нескольких бригад без бригадира'}
                            </h3>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 flex items-start gap-1.5">
                            <UserCheck className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <span>СМР по этой группе сможет заполнить только прораб.</span>
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                        {warnings.map((w) => (
                            <div key={w.team.id} className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 min-w-0">
                                        <Users className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                                        <span className="truncate">{w.team.name}</span>
                                    </p>
                                    <span className="text-[11px] font-bold text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                        {w.selectedCount} из {w.totalCount}
                                    </span>
                                </div>
                                {w.members.length > 0 && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                        {w.members.map(m => m.fio).join(', ')}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-[0.98]"
                        >
                            Назад
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-md active:scale-[0.98]"
                        >
                            Всё равно создать
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        </ModalPortal>
    );
}

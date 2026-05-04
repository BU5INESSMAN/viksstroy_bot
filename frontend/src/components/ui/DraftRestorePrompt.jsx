import { Clock, RotateCcw, Trash2 } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import GlassCard from './GlassCard';
import { formatDraftAge } from '../../utils/draftStorage';

/**
 * Subtle restore-or-discard prompt for an unfinished form draft.
 * Tap-outside / backdrop click is treated as discard (matches Emil's
 * "make the safe action obvious" rule — coming back to an empty form is
 * less surprising than silently re-applying old data).
 */
export default function DraftRestorePrompt({ open, savedAt, onRestore, onDiscard }) {
    const age = formatDraftAge(savedAt);
    return (
        <AnimatedModal isOpen={open} onClose={onDiscard}>
            <GlassCard className="w-full max-w-sm p-6">
                <div className="flex items-start gap-3 mb-5">
                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex-shrink-0">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">
                            Восстановить черновик?
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Найдена незавершённая форма от {age}.
                        </p>
                    </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button
                        type="button"
                        onClick={onDiscard}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        Сбросить
                    </button>
                    <button
                        type="button"
                        onClick={onRestore}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Восстановить
                    </button>
                </div>
            </GlassCard>
        </AnimatedModal>
    );
}

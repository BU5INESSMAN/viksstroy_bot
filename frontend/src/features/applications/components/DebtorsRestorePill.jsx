import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Minimal outlined pill shown in place of DebtorsWidget when the user
 * has dismissed it for the current session. Click to restore.
 *
 * Emil restraint: no card chrome, no icon color explosion — a single
 * muted outlined line that reads "Должники СМР скрыты • Показать".
 */
export default function DebtorsRestorePill({ onRestore }) {
    return (
        <motion.button
            type="button"
            onClick={onRestore}
            initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm font-medium transition-colors duration-150 cursor-pointer"
        >
            <Eye className="w-4 h-4" />
            <span>Должники СМР скрыты • Показать</span>
        </motion.button>
    );
}

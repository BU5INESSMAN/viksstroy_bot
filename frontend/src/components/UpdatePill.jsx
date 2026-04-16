import { motion } from 'framer-motion';
import { applyUpdate } from '../utils/pwaUpdate';

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Floating "update ready" pill, rendered when the user defers the update
 * modal. Stays until they click Применить.
 */
export default function UpdatePill({ worker }) {
  const handleApply = () => applyUpdate(worker);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 45,
      }}
    >
      <div className="flex items-center gap-2.5 pl-3 pr-1 py-1 rounded-full border border-white/10 bg-gray-900/90 dark:bg-gray-800/90 backdrop-blur-xl text-white shadow-lg shadow-black/30 select-none">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
        </span>
        <span className="text-xs font-semibold whitespace-nowrap">Обновление готово</span>
        <button
          type="button"
          onClick={handleApply}
          className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors active:scale-[0.97]"
        >
          Применить
        </button>
      </div>
    </motion.div>
  );
}

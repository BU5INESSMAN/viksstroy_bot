import { motion } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Grid icon picker. Renders a curated registry as a tap-able grid with
 * a clear blue selection state, 44×44 touch targets, and subtle
 * scale-down tap feedback (Emil micro-interaction).
 *
 * Props:
 *   value     current icon key (string | null)
 *   onChange  (key: string) => void
 *   icons     registry object { key: { component, label } }
 *   columns   grid columns (default 5)
 *   className container classes
 */
export default function IconPicker({ value, onChange, icons, columns = 5, className = '' }) {
    const entries = Object.entries(icons);
    const gridClass = {
        4: 'grid-cols-4',
        5: 'grid-cols-5',
        6: 'grid-cols-6',
    }[columns] || 'grid-cols-5';

    return (
        <div className={`grid ${gridClass} gap-2 ${className}`}>
            {entries.map(([key, { component: Icon, label }]) => {
                const selected = value === key;
                return (
                    <motion.button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        whileTap={prefersReducedMotion ? {} : { scale: 0.92 }}
                        transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
                        className={`flex flex-col items-center justify-center min-h-[56px] rounded-xl border px-1 py-2 transition-colors
                            ${selected
                                ? 'bg-blue-500/15 border-blue-500 ring-2 ring-blue-500/30'
                                : 'bg-gray-50 dark:bg-white/[0.04] border-transparent hover:bg-gray-100 dark:hover:bg-white/[0.08]'}`}
                        title={label}
                    >
                        <Icon
                            className={`w-5 h-5 ${selected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-300'}`}
                            stroke={selected ? 2.4 : 2}
                        />
                        <span className={`mt-0.5 text-[10px] font-medium truncate max-w-full text-center
                            ${selected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            {label}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}

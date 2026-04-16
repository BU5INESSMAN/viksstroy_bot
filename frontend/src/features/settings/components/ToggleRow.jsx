import { motion } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One row in the Settings page: icon + label (+ optional description) + switch.
 *
 * Applies Emil motion principles — switch thumb translates with ease-out at
 * 150ms, row tap scales to 0.97, respects prefers-reduced-motion.
 */
export default function ToggleRow({
    icon: Icon,
    label,
    description,
    value,
    onChange,
    disabled = false,
}) {
    const handleClick = () => {
        if (disabled) return;
        onChange(!value);
    };

    return (
        <motion.button
            type="button"
            onClick={handleClick}
            disabled={disabled}
            whileTap={prefersReducedMotion || disabled ? {} : { scale: 0.98 }}
            className={`group w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-transparent text-left transition-colors
                ${disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:border-gray-100 dark:hover:border-gray-700/40'}`}
        >
            {Icon ? (
                <Icon className="w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-300 transition-colors" strokeWidth={2} />
            ) : null}

            <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{label}</div>
                {description ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{description}</div>
                ) : null}
            </div>

            <span
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ease-out
                    ${value ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
                <motion.span
                    aria-hidden
                    initial={false}
                    animate={prefersReducedMotion ? { x: value ? 20 : 2 } : { x: value ? 20 : 2 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.15, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-sm"
                />
            </span>
        </motion.button>
    );
}

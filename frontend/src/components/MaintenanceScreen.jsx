import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EASE_OUT = [0.23, 1, 0.32, 1];

/**
 * Full-screen maintenance overlay shown while the API is unreachable
 * (most commonly during a server update). Auto-dismisses when
 * useApiHealth detects recovery and reloads the page.
 */
export default function MaintenanceScreen() {
    return (
        <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col items-center justify-center gap-7 p-8">
            {/* Logo */}
            <motion.img
                src="/logo-white.png"
                alt="ВиКС"
                className="w-40 h-auto object-contain select-none"
                draggable={false}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
            />

            {/* Spinner */}
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, delay: 0.15, ease: EASE_OUT }}
                aria-hidden="true"
            >
                <motion.div
                    animate={prefersReducedMotion ? {} : { rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                >
                    <Loader2 className="w-7 h-7 text-blue-400" strokeWidth={2.5} />
                </motion.div>
            </motion.div>

            {/* Title + subtitle */}
            <motion.div
                className="text-center max-w-xs"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2, ease: EASE_OUT }}
            >
                <h1 className="text-xl font-semibold text-white tracking-tight">
                    Обновление системы
                </h1>
                <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                    Пожалуйста, подождите…
                </p>
            </motion.div>

            {/* Subtle reconnection hint — appears after a beat */}
            <motion.p
                className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[11px] font-medium text-gray-600 tracking-wide"
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1, ease: EASE_OUT }}
                role="status"
                aria-live="polite"
            >
                Автоматическое переподключение…
            </motion.p>
        </div>
    );
}

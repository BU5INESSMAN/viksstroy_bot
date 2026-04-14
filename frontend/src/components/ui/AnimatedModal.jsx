import { motion, AnimatePresence } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function AnimatedModal({ isOpen, onClose, children, className = '' }) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={`fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 backdrop-blur-sm ${className}`}
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
                >
                    <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24 overflow-y-auto">
                        <motion.div
                            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {children}
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-screen animated modal. Portals to document.body so the backdrop
 * always covers the whole viewport, regardless of ancestor
 * `transform` / `will-change` / `filter` values that would otherwise
 * create a new stacking/containing context for `position: fixed`.
 *
 * z-[9998] backdrop + z-[9999] content sit above the sidebar (z-50) and
 * BottomNav (z-40) so no header pokes through.
 */
export default function AnimatedModal({ isOpen, onClose, children, className = '' }) {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={`fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/60 backdrop-blur-sm ${className}`}
                    style={{ top: 0, left: 0, right: 0, bottom: 0 }}
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
                >
                    <div
                        className="fixed inset-0 z-[9999] flex min-h-full items-start justify-center p-4 pt-10 pb-24 overflow-y-auto"
                        style={{ top: 0, left: 0, right: 0, bottom: 0 }}
                    >
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
        </AnimatePresence>,
        document.body
    );
}

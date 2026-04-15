import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function SplashScreen({ onFinish }) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
            setTimeout(onFinish, prefersReducedMotion ? 0 : 500);
        }, 1500);
        return () => clearTimeout(timer);
    }, [onFinish]);

    if (prefersReducedMotion) {
        return visible ? (
            <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col items-center justify-center">
                <img src="/logo-white.png" alt="ВиКС" className="w-48 h-auto object-contain" />
                <div className="mt-8 w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <p className="absolute bottom-8 text-xs text-white/30">v2.2</p>
            </div>
        ) : null;
    }

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col items-center justify-center"
                >
                    <motion.img
                        src="/logo-white.png"
                        alt="ВиКС"
                        className="w-48 h-auto object-contain"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-8"
                    >
                        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </motion.div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.3 }}
                        transition={{ delay: 0.8 }}
                        className="absolute bottom-8 text-xs text-white/30"
                    >
                        v2.2
                    </motion.p>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

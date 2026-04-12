// Shared animation variants following Emil Kowalski's principles
// All animations: purposeful, subtle, fast (150-300ms)

export const fadeIn = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
};

export const slideUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 12 },
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
};

export const scaleIn = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
};

export const staggerContainer = {
    animate: {
        transition: { staggerChildren: 0.05 },
    },
};

export const staggerItem = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2 },
};

// Reduced motion wrapper
export const getMotionProps = (variants) => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return {};
    }
    return variants;
};

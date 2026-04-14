import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Generic confirmation modal with optional text input (for prompt-style dialogs).
 *
 * Props:
 *   isOpen        - boolean
 *   title         - string (header text)
 *   message       - string (body text)
 *   confirmText   - string (confirm button label, default "Подтвердить")
 *   cancelText    - string (cancel button label, default "Отмена")
 *   variant       - "danger" | "warning" | "info" (colors the confirm button)
 *   withInput      - boolean (show a text input, returns its value on confirm)
 *   inputPlaceholder - string
 *   onConfirm     - (inputValue?: string) => void
 *   onCancel      - () => void
 */
export default function ConfirmModal({
    isOpen, title, message,
    confirmText = 'Подтвердить', cancelText = 'Отмена',
    variant = 'danger', withInput = false, inputPlaceholder = '',
    onConfirm, onCancel
}) {
    const [inputValue, setInputValue] = useState('');

    const variantStyles = {
        danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
        warning: 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400',
        info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    };

    const handleConfirm = () => {
        const val = inputValue;
        setInputValue('');
        onConfirm(withInput ? val : undefined);
    };

    const handleCancel = () => {
        setInputValue('');
        onCancel();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="!fixed !inset-0 !top-0 !left-0 !w-full !h-[100dvh] z-[99990] bg-black/50 m-0 p-0 flex items-center justify-center"
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={handleCancel}
                >
                    <motion.div
                        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-4 p-6 pb-4">
                            <div className={`p-2.5 rounded-xl flex-shrink-0 ${variant === 'danger' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : variant === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{message}</p>
                            </div>
                            <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {withInput && (
                            <div className="px-6 pb-2">
                                <input
                                    type="text"
                                    autoFocus
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    placeholder={inputPlaceholder}
                                    className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl outline-none text-sm font-medium dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                                    onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                                />
                            </div>
                        )}

                        <div className="flex gap-3 p-6 pt-4">
                            <button onClick={handleCancel} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 px-4 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all active:scale-[0.98]">
                                {cancelText}
                            </button>
                            <button onClick={handleConfirm} className={`flex-1 text-white py-3 px-4 rounded-xl font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98] focus:ring-2 focus:ring-offset-2 ${variantStyles[variant]}`}>
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

import { useEffect } from 'react';

/**
 * Fire `onSubmit` when the user presses Enter anywhere outside a
 * textarea / contentEditable / Shift-Enter / IME composition. Useful
 * for modal forms that don't wrap their fields in a <form>.
 *
 *   useEnterToSubmit(isOpen, handleSave);
 *
 * The `enabled` flag is usually `isOpen` or a derived condition so
 * the listener is attached only while the modal is visible.
 */
export default function useEnterToSubmit(enabled, onSubmit) {
    useEffect(() => {
        if (!enabled || typeof onSubmit !== 'function') return undefined;
        const handler = (e) => {
            if (e.key !== 'Enter') return;
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.isComposing || e.nativeEvent?.isComposing) return;
            const t = e.target;
            if (!t) return;
            const tag = t.tagName;
            if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
            if (t.isContentEditable) return;
            // Skip if the focused element is already inside a <form> — its
            // own submit handler will fire.
            if (t.form) return;
            e.preventDefault();
            onSubmit();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [enabled, onSubmit]);
}

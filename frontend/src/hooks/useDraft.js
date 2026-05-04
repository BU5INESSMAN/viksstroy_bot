import { useEffect, useRef } from 'react';
import { saveDraft, clearDraft } from '../utils/draftStorage';

/**
 * Auto-saves form data to localStorage with debounce.
 *
 * @param {string} formKey - unique form identifier (e.g. 'create-app', 'smr:123')
 * @param {object} data - current form state (any JSON-serializable shape)
 * @param {object} [options]
 * @param {number} [options.debounceMs=800]
 * @param {boolean} [options.enabled=true] - disable to pause saving (e.g. after submit)
 * @param {(data: object) => boolean} [options.shouldSave] - skip save when predicate returns false
 */
export function useDraft(formKey, data, options = {}) {
    const { debounceMs = 800, enabled = true, shouldSave } = options;
    const timerRef = useRef(null);

    useEffect(() => {
        if (!enabled) return undefined;
        if (shouldSave && !shouldSave(data)) return undefined;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            saveDraft(formKey, data);
        }, debounceMs);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [formKey, data, debounceMs, enabled]);
}

export { clearDraft };

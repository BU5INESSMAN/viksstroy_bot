import { useState, useCallback, useMemo } from 'react';
import ConfirmModal from '../components/ConfirmModal';

/**
 * Hook that provides a confirm() and prompt() replacement returning Promises.
 *
 * Usage:
 *   const { confirm, prompt, ConfirmUI } = useConfirm();
 *   // Render <ConfirmUI /> somewhere in JSX
 *   const ok = await confirm("Удалить?", { title: "Подтверждение" });
 *   const reason = await prompt("Причина:", { title: "Отклонение" });
 */
export default function useConfirm() {
    const [state, setState] = useState(null);

    const confirm = useCallback((message, opts = {}) => {
        return new Promise((resolve) => {
            setState({
                message,
                title: opts.title || 'Подтверждение',
                confirmText: opts.confirmText || 'Подтвердить',
                cancelText: opts.cancelText || 'Отмена',
                variant: opts.variant || 'danger',
                withInput: false,
                resolve,
            });
        });
    }, []);

    const prompt = useCallback((message, opts = {}) => {
        return new Promise((resolve) => {
            setState({
                message,
                title: opts.title || 'Введите значение',
                confirmText: opts.confirmText || 'Отправить',
                cancelText: opts.cancelText || 'Отмена',
                variant: opts.variant || 'info',
                withInput: true,
                inputPlaceholder: opts.placeholder || '',
                resolve,
            });
        });
    }, []);

    const handleConfirm = useCallback((inputValue) => {
        if (state) {
            state.resolve(state.withInput ? inputValue : true);
            setState(null);
        }
    }, [state]);

    const handleCancel = useCallback(() => {
        if (state) {
            state.resolve(state.withInput ? null : false);
            setState(null);
        }
    }, [state]);

    const ConfirmUI = useMemo(() => (
        <ConfirmModal
            isOpen={!!state}
            title={state?.title || ''}
            message={state?.message || ''}
            confirmText={state?.confirmText}
            cancelText={state?.cancelText}
            variant={state?.variant}
            withInput={state?.withInput}
            inputPlaceholder={state?.inputPlaceholder}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
        />
    ), [state, handleConfirm, handleCancel]);

    return { confirm, prompt, ConfirmUI };
}

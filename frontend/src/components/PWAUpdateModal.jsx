import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AnimatedModal from './ui/AnimatedModal';
import { applyUpdate } from '../utils/pwaUpdate';

/**
 * Modal that appears when the service worker has a new version ready.
 * Auto-applies the update after a 30-second countdown unless the user
 * dismisses it (→ onDefer) or applies it immediately.
 */
export default function PWAUpdateModal({ worker, isOpen, onDefer }) {
  const [countdown, setCountdown] = useState(30);
  const appliedRef = useRef(false);

  // Reset countdown each time the modal re-opens
  useEffect(() => {
    if (isOpen) {
      setCountdown(30);
      appliedRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          if (!appliedRef.current) {
            appliedRef.current = true;
            applyUpdate(worker);
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, worker]);

  const handleApplyNow = () => {
    appliedRef.current = true;
    applyUpdate(worker);
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onDefer}>
      <div className="w-[92vw] max-w-sm rounded-2xl border border-white/10 bg-white dark:bg-gray-800 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
            Доступна новая версия
          </h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Перезагрузите приложение для получения обновления. Автоматическая перезагрузка через{' '}
          <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {countdown}
          </span>{' '}
          сек.
        </p>

        <div className="flex items-center gap-2 mt-5">
          <button
            type="button"
            onClick={onDefer}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors active:scale-[0.98]"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={handleApplyNow}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors active:scale-[0.98] shadow-sm"
          >
            Обновить сейчас
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}

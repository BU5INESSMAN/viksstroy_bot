import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import InstallInstructions from './InstallInstructions';
import {
  isStandalone,
  wasInstalledBefore,
  wasReopenDismissed,
  shouldShowBannerToday,
  markBannerShownToday,
  getBrowserSupport,
} from '../utils/pwaInstall';

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Bottom-anchored install prompt. Visibility rules:
 *  - standalone → never show (user already in the app)
 *  - wasInstalledBefore && !wasReopenDismissed → show REOPEN reminder
 *  - else if shouldShowBannerToday → show INSTALL banner (variant per browser)
 */
export default function PWAInstallBanner() {
  const [visible, setVisible] = useState(false);

  const evaluate = useCallback(() => {
    if (isStandalone()) {
      setVisible(false);
      return;
    }
    if (wasInstalledBefore() && !wasReopenDismissed()) {
      setVisible(true);
      return;
    }
    if (shouldShowBannerToday()) {
      const { mode } = getBrowserSupport();
      // Skip unknown/unsupported — don't pester users with no install path.
      if (mode === 'unsupported') {
        setVisible(false);
        return;
      }
      setVisible(true);
      return;
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    evaluate();
    const onAvailable = () => evaluate();
    const onInstalled = () => setVisible(false);
    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, [evaluate]);

  const handleClose = () => {
    markBannerShownToday();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="pwa-banner"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.3,
            ease: [0.23, 1, 0.32, 1],
          }}
          style={{
            position: 'fixed',
            bottom:
              'calc(var(--bottomnav-height, 64px) + env(safe-area-inset-bottom) + 12px)',
            left: 16,
            right: 16,
            maxWidth: '28rem',
            marginLeft: 'auto',
            marginRight: 'auto',
            zIndex: 40,
          }}
        >
          <div
            className="relative rounded-2xl border border-white/10 dark:border-white/[0.06] bg-white/80 dark:bg-gray-800/70 backdrop-blur-xl shadow-2xl shadow-black/20 p-3.5 pr-10"
          >
            <InstallInstructions variant="banner" onDismiss={() => setVisible(false)} />

            {/* Close button — corner, soft hit target */}
            <button
              type="button"
              aria-label="Скрыть"
              onClick={handleClose}
              className="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors active:scale-[0.94]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

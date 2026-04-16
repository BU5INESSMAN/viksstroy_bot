const SHOWN_KEY = 'pwa_install_prompt_last_shown';
const INSTALLED_KEY = 'pwa_installed';
const REOPEN_DISMISSED_KEY = 'pwa_reopen_dismissed';

let deferredPrompt = null;

export function initPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALLED_KEY, 'true');
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

export function getBrowserSupport() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);

  if (deferredPrompt) return { supported: true, mode: 'native' };
  if (isIOS && isSafari) return { supported: true, mode: 'ios-safari' };
  if (isIOS) return {
    supported: false, mode: 'ios-other',
    message: 'Откройте сайт в Safari для установки приложения',
    actionLabel: 'Открыть в Safari',
    actionUrl: `x-safari-https://${window.location.host}${window.location.pathname}`,
  };
  if (isAndroid && isFirefox) return {
    supported: false, mode: 'android-firefox',
    message: 'Установите Chrome или Яндекс Браузер для установки приложения',
    actionLabel: 'Установить Chrome',
    actionUrl: 'https://play.google.com/store/apps/details?id=com.android.chrome',
  };
  return { supported: false, mode: 'unsupported' };
}

export async function triggerInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function shouldShowBannerToday() {
  if (isStandalone()) return false;
  const today = new Date().toISOString().slice(0, 10);
  return localStorage.getItem(SHOWN_KEY) !== today;
}

export function markBannerShownToday() {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(SHOWN_KEY, today);
}

export function wasInstalledBefore() {
  return localStorage.getItem(INSTALLED_KEY) === 'true';
}

export function wasReopenDismissed() {
  return localStorage.getItem(REOPEN_DISMISSED_KEY) === 'true';
}

export function markReopenDismissed() {
  localStorage.setItem(REOPEN_DISMISSED_KEY, 'true');
}

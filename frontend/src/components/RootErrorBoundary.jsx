import React from 'react';

export function BootSignal() {
  // Signal as soon as React commits its first frame. useLayoutEffect runs
  // before ordinary effects and avoids treating a busy mobile main thread as
  // a failed application download.
  React.useLayoutEffect(() => {
    window.__VIKS_BOOTED__ = true;
    try { window.dispatchEvent(new CustomEvent('viks:booted')); } catch { /* old WebView */ }
  }, []);
  return null;
}

export default class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[ui] root render failed:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-bold mb-2">Не удалось открыть приложение</h1>
        <p className="max-w-sm text-sm text-gray-400 mb-5">
          Возможно, на устройстве сохранилась устаревшая версия интерфейса.
        </p>
        <button
          type="button"
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold"
          onClick={() => window.__VIKS_RECOVER__?.('react-error', true)}
        >
          Восстановить и открыть
        </button>
      </div>
    );
  }
}

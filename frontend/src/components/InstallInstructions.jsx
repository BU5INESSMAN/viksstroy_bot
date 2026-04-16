import { Download, ExternalLink } from 'lucide-react';
import {
  isStandalone,
  getBrowserSupport,
  triggerInstall,
  wasInstalledBefore,
  wasReopenDismissed,
  markReopenDismissed,
} from '../utils/pwaInstall';

/**
 * Shared body used by the install banner (bottom) and the install modal
 * (sidebar button). Keeps copy + actions in one place.
 *
 *   variant: 'banner' | 'modal'
 *   onDismiss: called after user clicks an action or close
 */
export default function InstallInstructions({ variant = 'modal', onDismiss }) {
  const support = getBrowserSupport();
  const standalone = isStandalone();
  const showReopen = !standalone && wasInstalledBefore() && !wasReopenDismissed();

  // ── Reopen reminder ─────────────────────────────────────────────
  if (showReopen) {
    const handleReopen = () => {
      markReopenDismissed();
      onDismiss?.();
    };
    return (
      <InstructionBody
        variant={variant}
        title="Приложение уже установлено"
        message="Откройте его с главного экрана для лучшего опыта"
        primary={{ label: 'Понятно', onClick: handleReopen }}
      />
    );
  }

  // ── Native install prompt available ─────────────────────────────
  if (support.mode === 'native') {
    const handleInstall = async () => {
      await triggerInstall();
      onDismiss?.();
    };
    return (
      <InstructionBody
        variant={variant}
        title="Установите ВиКС Расписание"
        message="для быстрого доступа и уведомлений"
        primary={{ label: 'Установить', icon: Download, onClick: handleInstall }}
      />
    );
  }

  // ── iOS Safari (Add to Home Screen manual flow) ─────────────────
  if (support.mode === 'ios-safari') {
    return (
      <InstructionBody
        variant={variant}
        title="Установите приложение"
        message="Нажмите значок Поделиться, затем «На экран Домой»"
      />
    );
  }

  // ── Unsupported / need different browser ────────────────────────
  if (support.message) {
    return (
      <InstructionBody
        variant={variant}
        title="Установка приложения"
        message={support.message}
        primary={support.actionUrl ? {
          label: support.actionLabel || 'Открыть',
          href: support.actionUrl,
          icon: ExternalLink,
          onClick: onDismiss,
        } : undefined}
      />
    );
  }

  return (
    <InstructionBody
      variant={variant}
      title="Установка недоступна"
      message="Попробуйте открыть сайт в другом браузере"
    />
  );
}

function InstructionBody({ variant, title, message, primary }) {
  const logo = (
    <img
      src="/icon-192.png"
      alt=""
      className="w-8 h-8 rounded-lg flex-shrink-0 select-none"
      draggable="false"
    />
  );

  const text = (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
        {title}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
        {message}
      </p>
    </div>
  );

  const action = primary ? (
    primary.href ? (
      <a
        href={primary.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={primary.onClick}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors active:scale-[0.97] shadow-sm flex-shrink-0"
      >
        {primary.icon ? <primary.icon className="w-3.5 h-3.5" strokeWidth={2.5} /> : null}
        {primary.label}
      </a>
    ) : (
      <button
        type="button"
        onClick={primary.onClick}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors active:scale-[0.97] shadow-sm flex-shrink-0"
      >
        {primary.icon ? <primary.icon className="w-3.5 h-3.5" strokeWidth={2.5} /> : null}
        {primary.label}
      </button>
    )
  ) : null;

  if (variant === 'modal') {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl select-none" draggable="false" />
        <div className="text-center">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{message}</p>
        </div>
        {action && <div className="w-full flex justify-center pt-1">{action}</div>}
      </div>
    );
  }

  // banner
  return (
    <div className="flex items-center gap-3">
      {logo}
      {text}
      {action}
    </div>
  );
}

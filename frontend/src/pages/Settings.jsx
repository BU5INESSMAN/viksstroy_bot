import { createElement, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion as Motion } from 'framer-motion';
import { Settings as SettingsIcon, Smartphone, Bell, EyeOff, KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import ToggleRow from '../features/settings/components/ToggleRow';
import { subscribeToPush } from '../utils/pushSubscription';
import { registerPasskey, passkeysSupported } from '../utils/passkeys';
import { ensureLoginDevice, getDeviceName, getLoginDeviceId, getLoginDeviceToken, forgetLoginDevice } from '../utils/loginDevice';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS = {
    notify_max: true,
    notify_pwa: true,
    hide_smr_debtors: false,
    notify_new_apps: true,
    notify_smr_debtors: true,
    notify_object_requests: true,
    notify_exchanges: true,
};

export default function Settings() {
    const [settings, setSettings] = useState(DEFAULTS);
    const [loading, setLoading] = useState(true);
    const [pwaAvailable, setPwaAvailable] = useState(false);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [notificationEvents, setNotificationEvents] = useState([]);
    const [passkeys, setPasskeys] = useState([]);
    const [loginDevices, setLoginDevices] = useState([]);
    const [securityBusy, setSecurityBusy] = useState(false);

    // Detect if PWA push is usable: standalone app OR active subscription
    useEffect(() => {
        const standalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        setPwaAvailable(standalone || ('PushManager' in window));
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready
                .then((r) => r.pushManager.getSubscription())
                .then((sub) => {
                    setPushSubscribed(!!sub);
                    if (sub) setPwaAvailable(true);
                })
                .catch(() => setPushSubscribed(false));
        }
    }, []);

    // Fetch current user settings
    useEffect(() => {
        Promise.all([
            axios.get('/api/users/me'),
            axios.get('/api/users/me/notification-events'),
            axios.get('/api/auth/passkeys'),
            axios.get('/api/auth/devices'),
        ])
            .then(([res, eventRes, passkeyRes, deviceRes]) => {
                const s = res.data?.user?.settings || {};
                setSettings({ ...DEFAULTS, ...s });
                setNotificationEvents(eventRes.data?.events || []);
                setPasskeys(passkeyRes.data?.passkeys || []);
                setLoginDevices(deviceRes.data?.devices || []);
                setLoading(false);
            })
            .catch(() => {
                toast.error('Не удалось загрузить настройки');
                setLoading(false);
            });
    }, []);

    const setKey = async (key, value) => {
        const prev = settings[key];
        setSettings((s) => ({ ...s, [key]: value })); // optimistic
        try {
            await axios.patch('/api/users/me/settings', { [key]: value });
        } catch (e) {
            setSettings((s) => ({ ...s, [key]: prev }));
            toast.error(e?.response?.data?.detail || 'Ошибка сохранения');
        }
    };

    const setEvent = async (key, value) => {
        const previous = notificationEvents;
        const next = notificationEvents.map((event) => (
            event.key === key ? { ...event, enabled: value } : event
        ));
        setNotificationEvents(next);
        const overrides = { ...(settings.notification_events || {}), [key]: value };
        setSettings((current) => ({ ...current, notification_events: overrides }));
        try {
            await axios.patch('/api/users/me/settings', { notification_events: overrides });
        } catch (e) {
            setNotificationEvents(previous);
            toast.error(e?.response?.data?.detail || 'Ошибка сохранения');
        }
    };

    const enablePushOnDevice = async () => {
        setPushBusy(true);
        const subscribed = await subscribeToPush({ requestPermission: true });
        setPushBusy(false);
        setPushSubscribed(subscribed);
        if (subscribed) {
            await setKey('notify_pwa', true);
            toast.success('Push-уведомления включены на этом устройстве');
        } else {
            toast.error('Не удалось включить Push. Проверьте разрешения приложения.');
        }
    };

    const addPasskey = async () => {
        setSecurityBusy(true);
        try {
            const created = await registerPasskey(getDeviceName());
            setPasskeys((current) => [created.passkey, ...current]);
            await ensureLoginDevice().catch(() => '');
            toast.success('Ключ доступа создан. Теперь вход возможен по отпечатку, лицу или PIN устройства.');
        } catch (e) {
            if (e?.name !== 'NotAllowedError') {
                toast.error(e?.response?.data?.detail || e?.message || 'Не удалось создать ключ доступа');
            }
        } finally {
            setSecurityBusy(false);
        }
    };

    const removePasskey = async (credentialId) => {
        try {
            await axios.delete(`/api/auth/passkeys/${encodeURIComponent(credentialId)}`);
            setPasskeys((current) => current.filter((item) => item.credential_id !== credentialId));
            toast.success('Ключ доступа удалён');
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Не удалось удалить ключ доступа');
        }
    };

    const removeLoginDevice = async (deviceId) => {
        try {
            await axios.delete(`/api/auth/devices/${deviceId}`);
            setLoginDevices((current) => current.filter((item) => item.id !== deviceId));
            if (getLoginDeviceId() === deviceId) forgetLoginDevice();
            toast.success('Доверенное устройство удалено');
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Не удалось удалить устройство');
        }
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
                <div className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800/40 animate-pulse" />
                <div className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800/40 animate-pulse" />
                <div className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800/40 animate-pulse" />
            </div>
        );
    }

    return (
        <Motion.div
            className="max-w-3xl mx-auto p-4 pb-24 space-y-4"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
            {/* Header */}
            <div className="flex items-center gap-3 pt-4 pb-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <SettingsIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Настройки</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Уведомления и предпочтения интерфейса</p>
                </div>
            </div>

            <GlassCard className="p-5">
                <SectionTitle>Безопасность и быстрый вход</SectionTitle>
                <div className="mt-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.06] p-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                            <ShieldCheck className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Ключ доступа</p>
                            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                Вход одним касанием: по отпечатку пальца, лицу или PIN-коду устройства. Пароль и код из MAX не нужны.
                            </p>
                            <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                <li><span className="mr-1.5 font-bold text-blue-500">1.</span>Нажмите кнопку создания ключа ниже.</li>
                                <li><span className="mr-1.5 font-bold text-blue-500">2.</span>Подтвердите действие на телефоне или компьютере.</li>
                                <li><span className="mr-1.5 font-bold text-blue-500">3.</span>При следующем входе выберите «Войти по ключу доступа».</li>
                            </ol>
                        </div>
                    </div>
                    {passkeysSupported() ? (
                        <button
                            type="button"
                            disabled={securityBusy}
                            onClick={addPasskey}
                            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 active:scale-[0.98]"
                        >
                            <KeyRound className="h-4 w-4" />
                            {securityBusy ? 'Создаём ключ…' : 'Создать ключ доступа'}
                        </button>
                    ) : (
                        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">На этом устройстве ключи доступа не поддерживаются.</p>
                    )}
                </div>

                {passkeys.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <p className="px-1 text-xs font-bold text-gray-700 dark:text-gray-200">Ваши ключи</p>
                        {passkeys.map((item) => (
                            <SecurityRow
                                key={item.credential_id}
                                icon={KeyRound}
                                title={item.name || 'Ключ доступа'}
                                subtitle={formatSecurityDate(item.last_used_at || item.created_at)}
                                onRemove={() => removePasskey(item.credential_id)}
                            />
                        ))}
                    </div>
                )}

                {loginDevices.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <p className="px-1 text-xs font-bold text-gray-700 dark:text-gray-200">Вход через MAX разрешён на устройствах</p>
                        {loginDevices.map((item) => (
                            <SecurityRow
                                key={item.id}
                                icon={Smartphone}
                                title={item.name || 'Устройство'}
                                badge={getLoginDeviceId() === item.id ? 'Это устройство' : ''}
                                subtitle={formatSecurityDate(item.last_used_at || item.created_at)}
                                onRemove={() => removeLoginDevice(item.id)}
                            />
                        ))}
                    </div>
                )}

                {!getLoginDeviceToken() && (
                    <p className="mt-3 text-[11px] text-gray-400">Это устройство будет автоматически привязано после следующего входа.</p>
                )}
            </GlassCard>

            {/* 1. Уведомления */}
            <GlassCard className="p-5">
                <SectionTitle>Уведомления</SectionTitle>
                <div className="space-y-1 mt-2">
                    <ToggleRow
                        icon={Smartphone}
                        label="MAX"
                        description="Получать уведомления в MAX"
                        value={settings.notify_max}
                        onChange={(v) => setKey('notify_max', v)}
                    />
                    {pwaAvailable && (
                        <>
                            <ToggleRow
                                icon={Bell}
                                label="Push-уведомления (приложение)"
                                description={pushSubscribed ? 'Подключены на этом устройстве' : 'Требуется подключить на новом адресе'}
                                value={settings.notify_pwa && pushSubscribed}
                                onChange={(value) => {
                                    if (value && !pushSubscribed) enablePushOnDevice();
                                    else setKey('notify_pwa', value);
                                }}
                            />
                            {!pushSubscribed && (
                                <button
                                    type="button"
                                    disabled={pushBusy}
                                    onClick={enablePushOnDevice}
                                    className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 active:scale-[0.98]"
                                >
                                    {pushBusy ? 'Подключаем…' : 'Включить Push на этом устройстве'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </GlassCard>

            {notificationEvents.length > 0 && (
                <GlassCard className="p-5">
                    <SectionTitle>Какие события получать</SectionTitle>
                    <p className="text-xs text-gray-500 dark:text-gray-400 px-1 mt-2 mb-3">
                        Здесь показаны только уведомления, относящиеся к вашей роли.
                    </p>
                    <div className="space-y-4">
                        {[...new Set(notificationEvents.map((event) => event.group))].map((group) => (
                            <div key={group}>
                                <p className="px-1 mb-1 text-xs font-bold text-gray-700 dark:text-gray-200">{group}</p>
                                <div className="space-y-1">
                                    {notificationEvents.filter((event) => event.group === group).map((event) => (
                                        <ToggleRow
                                            key={event.key}
                                            icon={Bell}
                                            label={event.label}
                                            value={event.enabled}
                                            onChange={(value) => setEvent(event.key, value)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* 3. Интерфейс */}
            <GlassCard className="p-5">
                <SectionTitle>Интерфейс</SectionTitle>
                <div className="space-y-1 mt-2">
                    <ToggleRow
                        icon={EyeOff}
                        label="Скрыть виджет должников СМР на главной"
                        value={settings.hide_smr_debtors}
                        onChange={(v) => setKey('hide_smr_debtors', v)}
                    />
                </div>
            </GlassCard>
        </Motion.div>
    );
}

function SectionTitle({ children }) {
    return (
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-1">
            {children}
        </h2>
    );
}

function SecurityRow({ icon, title, subtitle, badge, onRemove }) {
    return (
        <div className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.025]">
            {createElement(icon, { className: 'h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400' })}
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
                    {badge && <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">{badge}</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">{subtitle}</p>
            </div>
            <button
                type="button"
                onClick={onRemove}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                aria-label={`Удалить: ${title}`}
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );
}

function formatSecurityDate(value) {
    if (!value) return 'Ещё не использовался';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
    return `Последняя активность: ${date.toLocaleDateString('ru-RU')}`;
}

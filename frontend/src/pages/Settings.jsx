import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Send, Smartphone, Bell, EyeOff } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import ToggleRow from '../features/settings/components/ToggleRow';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS = {
    notify_telegram: true,
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
    const [notificationEvents, setNotificationEvents] = useState([]);

    // Detect if PWA push is usable: standalone app OR active subscription
    useEffect(() => {
        const standalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        if (standalone) {
            setPwaAvailable(true);
            return;
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready
                .then((r) => r.pushManager.getSubscription())
                .then((sub) => setPwaAvailable(!!sub))
                .catch(() => setPwaAvailable(false));
        }
    }, []);

    // Fetch current user settings
    useEffect(() => {
        Promise.all([
            axios.get('/api/users/me'),
            axios.get('/api/users/me/notification-events'),
        ])
            .then(([res, eventRes]) => {
                const s = res.data?.user?.settings || {};
                setSettings({ ...DEFAULTS, ...s });
                setNotificationEvents(eventRes.data?.events || []);
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
        <motion.div
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

            {/* 1. Уведомления */}
            <GlassCard className="p-5">
                <SectionTitle>Уведомления</SectionTitle>
                <div className="space-y-1 mt-2">
                    <ToggleRow
                        icon={Send}
                        label="Telegram"
                        description="Получать уведомления в Telegram"
                        value={settings.notify_telegram}
                        onChange={(v) => setKey('notify_telegram', v)}
                    />
                    <ToggleRow
                        icon={Smartphone}
                        label="MAX"
                        description="Получать уведомления в MAX"
                        value={settings.notify_max}
                        onChange={(v) => setKey('notify_max', v)}
                    />
                    {pwaAvailable && (
                        <ToggleRow
                            icon={Bell}
                            label="Push-уведомления (приложение)"
                            description="Работает только если приложение установлено"
                            value={settings.notify_pwa}
                            onChange={(v) => setKey('notify_pwa', v)}
                        />
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
        </motion.div>
    );
}

function SectionTitle({ children }) {
    return (
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-1">
            {children}
        </h2>
    );
}

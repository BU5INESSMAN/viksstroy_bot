import { useEffect, useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    Lock, Settings, Save, Mail, Rocket, Send, MessageSquare,
    Shield, Users, FileText, ChevronUp, ChevronDown, Search,
    ToggleLeft, Clock, CalendarDays, CheckCircle, Terminal,
    RefreshCw, Database, Bell, AlertTriangle, Zap, ClipboardCheck,
    X, UserCheck, Megaphone, Monitor
} from 'lucide-react';

// ============================================================
// GLASS CARD COMPONENT
// ============================================================
function GlassCard({ children, className = '', glow = '' }) {
    return (
        <div className={`relative rounded-2xl border border-white/10 dark:border-white/[0.06] bg-white/70 dark:bg-gray-800/60 backdrop-blur-xl shadow-lg shadow-black/[0.03] dark:shadow-black/20 transition-all duration-300 ${glow} ${className}`}>
            {children}
        </div>
    );
}

// ============================================================
// SECTION HEADER
// ============================================================
function SectionHeader({ icon: Icon, iconColor, title, subtitle }) {
    return (
        <div className="mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2.5 text-gray-800 dark:text-gray-100">
                <div className={`p-2 rounded-xl ${iconColor} bg-opacity-10 dark:bg-opacity-20`}>
                    <Icon className="w-5 h-5" />
                </div>
                {title}
            </h2>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 ml-[42px] font-medium">{subtitle}</p>}
        </div>
    );
}

// ============================================================
// TOGGLE SWITCH
// ============================================================
function Toggle({ name, checked, onChange, color = 'blue' }) {
    const colors = {
        blue: 'peer-checked:bg-blue-600 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800',
        orange: 'peer-checked:bg-orange-500 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800',
        emerald: 'peer-checked:bg-emerald-500 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800',
        violet: 'peer-checked:bg-violet-500 peer-focus:ring-violet-300 dark:peer-focus:ring-violet-800',
    };
    return (
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" name={name} checked={checked} onChange={onChange} className="sr-only peer" />
            <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 ${colors[color]}`}></div>
        </label>
    );
}

// ============================================================
// ROLE CONFIG
// ============================================================
const ROLE_ORDER = ['superadmin', 'boss', 'moderator', 'foreman', 'brigadier', 'worker', 'driver'];
const ROLE_NAMES = {
    superadmin: 'Супер-Админ', boss: 'Руководитель', moderator: 'Модератор',
    foreman: 'Прораб', brigadier: 'Бригадир', worker: 'Рабочий', driver: 'Водитель', 'Гость': 'Гость'
};
const ROLE_COLORS = {
    superadmin: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50',
    boss: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50',
    moderator: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50',
    foreman: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
    brigadier: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50',
    worker: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/30 dark:text-gray-400 dark:border-gray-600/50',
    driver: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800/50',
};
const ROLE_ICON_COLORS = {
    superadmin: 'text-red-500', boss: 'text-amber-500', moderator: 'text-blue-500',
    foreman: 'text-emerald-500', brigadier: 'text-violet-500', worker: 'text-gray-400', driver: 'text-cyan-500',
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function System() {
    const { openProfile } = useOutletContext();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';

    // --- State ---
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [serverLogs, setServerLogs] = useState([]);
    const [serverLogsLoading, setServerLogsLoading] = useState(false);
    const [settings, setSettings] = useState({
        auto_publish_time: '', auto_publish_enabled: false,
        auto_start_orders_time: '',
        report_request_time: '',
        foreman_reminder_time: '', foreman_reminder_weekends: false,
        auto_complete_time: '',
        auto_backup_enabled: false,
        office_reminder_enabled: false, office_reminder_time: '',
    });
    const isAdmin = ['superadmin', 'boss'].includes(role);
    const [testPlatform, setTestPlatform] = useState('all');
    const [logsExpanded, setLogsExpanded] = useState(false);
    const [userSearch, setUserSearch] = useState('');

    // Broadcast state
    const [broadcastText, setBroadcastText] = useState('');
    const [broadcastLoading, setBroadcastLoading] = useState(false);
    const [dmModalOpen, setDmModalOpen] = useState(false);
    const [dmMode, setDmMode] = useState('roles'); // 'roles' | 'users'
    const [dmSelectedRoles, setDmSelectedRoles] = useState([]);
    const [dmSelectedUsers, setDmSelectedUsers] = useState([]);

    // --- Data Fetch ---
    useEffect(() => {
        axios.get('/api/users').then(res => setUsers(res.data || [])).catch(() => {});
        axios.get('/api/logs').then(res => setLogs(res.data || [])).catch(() => {});

        if (['superadmin', 'boss', 'moderator'].includes(role)) {
            axios.get('/api/settings').then(res => {
                const b = (k) => res.data[k] === '1' || res.data[k] === 'true';
                setSettings({
                    auto_publish_time: res.data.auto_publish_time || '',
                    auto_publish_enabled: b('auto_publish_enabled'),
                    auto_start_orders_time: res.data.auto_start_orders_time || '',
                    report_request_time: res.data.report_request_time || '',
                    foreman_reminder_time: res.data.foreman_reminder_time || '',
                    foreman_reminder_weekends: b('foreman_reminder_weekends'),
                    auto_complete_time: res.data.auto_complete_time || '',
                    auto_backup_enabled: b('auto_backup_enabled'),
                    office_reminder_enabled: b('office_reminder_enabled'),
                    office_reminder_time: res.data.office_reminder_time || '',
                });
            }).catch(() => {});
        }
    }, [role]);

    // --- Handlers ---
    const handleSettingChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const saveSettings = async () => {
        try {
            await axios.post('/api/settings/update', {
                auto_publish_time: settings.auto_publish_time,
                auto_publish_enabled: settings.auto_publish_enabled ? '1' : '0',
                auto_start_orders_time: settings.auto_start_orders_time,
                report_request_time: settings.report_request_time,
                foreman_reminder_time: settings.foreman_reminder_time,
                foreman_reminder_weekends: settings.foreman_reminder_weekends ? '1' : '0',
                auto_complete_time: settings.auto_complete_time,
                auto_backup_enabled: settings.auto_backup_enabled ? '1' : '0',
                office_reminder_enabled: settings.office_reminder_enabled ? '1' : '0',
                office_reminder_time: settings.office_reminder_time,
                tg_id: tgId
            }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            toast.success('Настройки успешно сохранены!');
        } catch { toast.error('Ошибка при сохранении настроек.'); }
    };

    const testNotification = async () => {
        try {
            const formData = new FormData();
            formData.append('tg_id', tgId);
            formData.append('platform', testPlatform);
            await axios.post('/api/system/test_notification', formData);
            toast.success("Тестовые уведомления успешно отправлены!");
        } catch { toast.error("Ошибка отправки теста."); }
    };

    const testExtended = async (testType) => {
        try {
            const formData = new FormData();
            formData.append('tg_id', tgId);
            formData.append('test_type', testType);
            formData.append('platform', testPlatform);
            await axios.post('/api/system/test_notification_extended', formData);
            toast.success(`Тест "${testType}" отправлен!`);
        } catch { toast.error("Ошибка отправки теста."); }
    };

    const handleRoleSimulation = (targetRole) => {
        if (!localStorage.getItem('real_role')) localStorage.setItem('real_role', role);
        localStorage.setItem('user_role', targetRole);
        window.location.href = '/dashboard';
    };

    const fetchServerLogs = useCallback(async () => {
        setServerLogsLoading(true);
        try {
            const res = await axios.get(`/api/system/server-logs?tg_id=${tgId}`);
            setServerLogs(res.data.lines || []);
        } catch { setServerLogs(['[Ошибка загрузки логов]']); }
        setServerLogsLoading(false);
    }, [tgId]);

    // Broadcast
    const sendBroadcastGroup = async () => {
        if (!broadcastText.trim()) return;
        setBroadcastLoading(true);
        try {
            await axios.post('/api/system/broadcast/group', { tg_id: parseInt(tgId), message: broadcastText });
            toast.success('Сообщение отправлено в группу!');
            setBroadcastText('');
        } catch { toast.error('Ошибка отправки.'); }
        setBroadcastLoading(false);
    };

    const sendBroadcastDM = async () => {
        setBroadcastLoading(true);
        try {
            await axios.post('/api/system/broadcast/dm', {
                tg_id: parseInt(tgId),
                message: broadcastText,
                mode: dmMode,
                roles: dmMode === 'roles' ? dmSelectedRoles : undefined,
                user_ids: dmMode === 'users' ? dmSelectedUsers : undefined,
            });
            toast.success('Рассылка в ЛС отправлена!');
            setDmModalOpen(false);
            setBroadcastText('');
        } catch { toast.error('Ошибка рассылки.'); }
        setBroadcastLoading(false);
    };

    // --- Computed ---
    const formatLogTime = (timestamp) => {
        if (!timestamp) return '';
        let safe = timestamp;
        if (typeof timestamp === 'string' && !timestamp.includes('Z') && !timestamp.includes('+'))
            safe = timestamp.replace(' ', 'T') + 'Z';
        try {
            return new Date(safe).toLocaleString('ru-RU', { timeZone: 'Asia/Barnaul', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch { return new Date(timestamp).toLocaleString('ru-RU'); }
    };

    const filteredUsers = useMemo(() => {
        if (!userSearch.trim()) return users;
        const q = userSearch.toLowerCase();
        return users.filter(u =>
            (u.fio && u.fio.toLowerCase().includes(q)) ||
            String(u.user_id).includes(q)
        );
    }, [users, userSearch]);

    const groupedUsers = useMemo(() => {
        const groups = {};
        ROLE_ORDER.forEach(r => { groups[r] = []; });
        filteredUsers.forEach(u => {
            const r = u.role || 'worker';
            if (!groups[r]) groups[r] = [];
            groups[r].push(u);
        });
        return groups;
    }, [filteredUsers]);

    const displayedLogs = logsExpanded ? logs : logs.slice(0, 10);

    // --- Access Gate ---
    if (!['superadmin', 'boss', 'moderator'].includes(role)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400 dark:text-gray-500">
                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-6 shadow-inner">
                    <Lock className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-xl font-bold">Доступ закрыт</p>
                <p className="text-sm mt-2">У вас нет прав для просмотра этого раздела.</p>
            </div>
        );
    }

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6 pb-24">

            {/* ====== AUTOMATION SETTINGS (hidden from moderators) ====== */}
            {role !== 'moderator' && (
            <GlassCard className="p-6 sm:p-8">
                <SectionHeader icon={Settings} iconColor="text-blue-500 bg-blue-500" title="Настройки автоматизации" />
                <div className="space-y-5">

                    {/* Auto-publish toggle + time */}
                    <div className={`p-5 rounded-xl border transition-colors ${settings.auto_publish_enabled ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50' : 'bg-gray-50/80 dark:bg-gray-700/20 border-gray-100 dark:border-gray-700/50'}`}>
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                    <Rocket className={`w-4 h-4 ${settings.auto_publish_enabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} /> Авто-публикация заявок
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Одобренные заявки автоматически публикуются в беседу в указанное время.</p>
                            </div>
                            <Toggle name="auto_publish_enabled" checked={settings.auto_publish_enabled} onChange={handleSettingChange} />
                        </div>
                        {settings.auto_publish_enabled && (
                            <input type="time" name="auto_publish_time" value={settings.auto_publish_time} onChange={handleSettingChange}
                                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-blue-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                        )}
                    </div>

                    {/* Auto-start orders */}
                    <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-amber-500" /> Авто-старт нарядов
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Все одобренные заявки на текущий день переводятся в статус "В работе".</p>
                        <input type="time" name="auto_start_orders_time" value={settings.auto_start_orders_time} onChange={handleSettingChange}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-amber-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                    </div>

                    {/* Report request */}
                    <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                            <ClipboardCheck className="w-4 h-4 text-indigo-500" /> Запрос отчётов
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Бот запросит у прорабов заполнение табеля/отчёта по активным нарядам.</p>
                        <input type="time" name="report_request_time" value={settings.report_request_time} onChange={handleSettingChange}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                    </div>

                    {/* Auto-complete */}
                    <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-500" /> Авто-завершение нарядов
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Активные наряды переводятся в "Ожидает отчета".</p>
                        <input type="time" name="auto_complete_time" value={settings.auto_complete_time} onChange={handleSettingChange}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-emerald-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                    </div>

                    {/* Foreman reminder */}
                    <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                    <Mail className="w-4 h-4 text-orange-500" /> Напоминание прорабам
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Бот напомнит прорабам заполнить заявки на следующий день.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Выходные</span>
                                <Toggle name="foreman_reminder_weekends" checked={settings.foreman_reminder_weekends} onChange={handleSettingChange} color="orange" />
                            </div>
                        </div>
                        <input type="time" name="foreman_reminder_time" value={settings.foreman_reminder_time} onChange={handleSettingChange}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-orange-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                    </div>

                    {/* Auto-backup */}
                    <div className={`p-5 rounded-xl border transition-colors ${settings.auto_backup_enabled ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50' : 'bg-gray-50/80 dark:bg-gray-700/20 border-gray-100 dark:border-gray-700/50'}`}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                    <Database className={`w-4 h-4 ${settings.auto_backup_enabled ? 'text-emerald-500' : 'text-gray-400'}`} /> Авто-бэкап базы данных
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Ежедневное автоматическое резервное копирование базы данных.</p>
                            </div>
                            <Toggle name="auto_backup_enabled" checked={settings.auto_backup_enabled} onChange={handleSettingChange} color="emerald" />
                        </div>
                    </div>

                    {/* Office reminders */}
                    <div className={`p-5 rounded-xl border transition-colors ${settings.office_reminder_enabled ? 'bg-violet-50/50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800/50' : 'bg-gray-50/80 dark:bg-gray-700/20 border-gray-100 dark:border-gray-700/50'}`}>
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                    <Bell className={`w-4 h-4 ${settings.office_reminder_enabled ? 'text-violet-500' : 'text-gray-400'}`} /> Напоминание офису
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Уведомит офис, если отчёты не проверены к указанному времени.</p>
                            </div>
                            <Toggle name="office_reminder_enabled" checked={settings.office_reminder_enabled} onChange={handleSettingChange} color="violet" />
                        </div>
                        {settings.office_reminder_enabled && (
                            <input type="time" name="office_reminder_time" value={settings.office_reminder_time} onChange={handleSettingChange}
                                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-violet-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                        )}
                    </div>

                    <button onClick={saveSettings}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl text-sm py-3.5 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                        <Save className="w-4 h-4" /> Сохранить настройки
                    </button>
                </div>
            </GlassCard>
            )}

            {/* ====== TESTING & ROLES ROW (hidden from moderators) ====== */}
            {role !== 'moderator' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Notification Testing */}
                <GlassCard className="p-6">
                    <SectionHeader icon={Zap} iconColor="text-indigo-500 bg-indigo-500" title="Отладка уведомлений" />
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-widest">Платформа</label>
                            <select value={testPlatform} onChange={(e) => setTestPlatform(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 p-3 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none">
                                <option value="all">Все (MAX + Telegram)</option>
                                <option value="max">Только MAX</option>
                                <option value="tg">Только Telegram</option>
                            </select>
                        </div>

                        {/* Main test */}
                        <button onClick={testNotification}
                            className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40 font-bold rounded-xl text-sm py-3 border border-indigo-200 dark:border-indigo-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                            <Rocket className="w-4 h-4" /> Полный тест
                        </button>

                        {/* Extended tests */}
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => testExtended('brigadier')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/30">
                                <UserCheck className="w-3.5 h-3.5" /> Бригадир
                            </button>
                            <button onClick={() => testExtended('resource_freed')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
                                <Zap className="w-3.5 h-3.5" /> Ресурс свободен
                            </button>
                            <button onClick={() => testExtended('schedule_published')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                                <CalendarDays className="w-3.5 h-3.5" /> Расписание
                            </button>
                            <button onClick={() => testExtended('kp_review')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                                <ClipboardCheck className="w-3.5 h-3.5" /> Проверка СМР
                            </button>
                            <button onClick={() => testExtended('system_error')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 col-span-2">
                                <AlertTriangle className="w-3.5 h-3.5" /> Системная ошибка
                            </button>
                        </div>
                    </div>
                </GlassCard>

                {/* Role Simulation */}
                <GlassCard className="p-6">
                    <SectionHeader icon={Shield} iconColor="text-purple-500 bg-purple-500" title="Симуляция ролей"
                        subtitle="Временно переключите аккаунт на другую роль." />
                    <div className="grid grid-cols-2 gap-2.5">
                        {Object.entries(ROLE_NAMES).filter(([k]) => k !== 'Гость').map(([rKey, rName]) => (
                            <button key={rKey} onClick={() => handleRoleSimulation(rKey)}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-sm border active:scale-95 flex items-center justify-center gap-1.5 ${
                                    role === rKey
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-200 dark:ring-purple-900'
                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                }`}>
                                {role === rKey && <ToggleLeft className="w-3.5 h-3.5" />} {rName}
                            </button>
                        ))}
                    </div>
                </GlassCard>
            </div>
            )}

            {/* ====== BROADCAST (Рассылка) ====== */}
            <GlassCard className="p-6 sm:p-8">
                <SectionHeader icon={Megaphone} iconColor="text-pink-500 bg-pink-500" title="Рассылка"
                    subtitle="Отправьте сообщение в групповой чат или персональные сообщения." />

                <textarea
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    placeholder="Введите текст рассылки..."
                    rows={4}
                    className="w-full bg-gray-50/80 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-xl p-4 text-sm text-gray-900 dark:text-white font-medium placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-pink-500 outline-none resize-none mb-4"
                />

                <div className="flex gap-3">
                    <button onClick={sendBroadcastGroup} disabled={broadcastLoading || !broadcastText.trim()}
                        className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm py-3 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md">
                        <Send className="w-4 h-4" /> Отправить в группу
                    </button>
                    <button onClick={() => setDmModalOpen(true)} disabled={!broadcastText.trim()}
                        className="flex-1 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200 font-bold rounded-xl text-sm py-3 border border-gray-200 dark:border-gray-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm">
                        <MessageSquare className="w-4 h-4" /> Отправить в ЛС
                    </button>
                </div>
            </GlassCard>

            {/* ====== DM BROADCAST MODAL ====== */}
            {dmModalOpen && (
                <div className="fixed inset-0 w-screen h-[100dvh] z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDmModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-pink-500" /> Рассылка в ЛС
                            </h3>
                            <button onClick={() => setDmModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Mode tabs */}
                        <div className="flex border-b border-gray-100 dark:border-gray-700">
                            <button onClick={() => setDmMode('roles')}
                                className={`flex-1 py-3 text-sm font-bold transition ${dmMode === 'roles' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                                По ролям
                            </button>
                            <button onClick={() => setDmMode('users')}
                                className={`flex-1 py-3 text-sm font-bold transition ${dmMode === 'users' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                                По пользователям
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto max-h-[50vh]">
                            {dmMode === 'roles' ? (
                                <div className="space-y-2">
                                    {ROLE_ORDER.map(r => (
                                        <label key={r} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition">
                                            <input type="checkbox" checked={dmSelectedRoles.includes(r)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setDmSelectedRoles(p => [...p, r]);
                                                    else setDmSelectedRoles(p => p.filter(x => x !== r));
                                                }}
                                                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                                            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border ${ROLE_COLORS[r]}`}>
                                                {ROLE_NAMES[r]}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {ROLE_ORDER.map(r => {
                                        const roleUsers = users.filter(u => u.role === r);
                                        if (!roleUsers.length) return null;
                                        return (
                                            <div key={r}>
                                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{ROLE_NAMES[r]}</p>
                                                <div className="space-y-1">
                                                    {roleUsers.map(u => (
                                                        <label key={u.user_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition">
                                                            <input type="checkbox" checked={dmSelectedUsers.includes(u.user_id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setDmSelectedUsers(p => [...p, u.user_id]);
                                                                    else setDmSelectedUsers(p => p.filter(x => x !== u.user_id));
                                                                }}
                                                                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{u.fio}</span>
                                                            <span className="text-[10px] text-gray-400 ml-auto font-mono">{u.user_id > 0 ? 'TG' : 'MAX'}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-5 border-t border-gray-100 dark:border-gray-700">
                            <button onClick={sendBroadcastDM} disabled={broadcastLoading || (dmMode === 'roles' ? !dmSelectedRoles.length : !dmSelectedUsers.length)}
                                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm py-3 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md">
                                <Send className="w-4 h-4" /> Отправить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== USERS TABLE (Grouped by Role) ====== */}
            <GlassCard className="p-6 sm:p-8 overflow-hidden">
                <SectionHeader icon={Users} iconColor="text-emerald-500 bg-emerald-500" title="Пользователи"
                    subtitle="Нажмите на пользователя для редактирования." />

                {/* Search bar */}
                <div className="relative mb-5">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Поиск по ФИО, MAX ID, TG ID..."
                        className="w-full pl-10 pr-4 py-3 bg-gray-50/80 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {userSearch && (
                        <button onClick={() => setUserSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                            <X className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                    )}
                </div>

                {/* Role groups */}
                <div className="space-y-5">
                    {ROLE_ORDER.map(r => {
                        const group = groupedUsers[r];
                        if (!group || !group.length) return null;
                        return (
                            <div key={r}>
                                <div className="flex items-center gap-2 mb-2.5">
                                    <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg border ${ROLE_COLORS[r]}`}>
                                        {ROLE_NAMES[r]}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{group.length}</span>
                                </div>
                                <div className="-mx-2 sm:mx-0 overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                                <th className="px-4 py-2 font-bold">ФИО</th>
                                                <th className="px-4 py-2 font-bold">ID</th>
                                                <th className="px-4 py-2 font-bold">Платформа</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100/80 dark:divide-gray-700/30">
                                            {group.map(u => (
                                                <tr key={u.user_id} onClick={() => openProfile(u.user_id)}
                                                    className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors group">
                                                    <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                        {u.fio}
                                                        {u.is_blacklisted === 1 && <span className="ml-2 text-[9px] font-extrabold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">BAN</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-mono text-gray-400">{u.user_id}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${u.user_id > 0 ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' : 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400'}`}>
                                                            {u.user_id > 0 ? 'Telegram' : 'MAX'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                    {filteredUsers.length === 0 && (
                        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8 font-medium">Пользователи не найдены</p>
                    )}
                </div>
            </GlassCard>

            {/* ====== ACTION LOGS (hidden from moderators) ====== */}
            {role !== 'moderator' && (
            <GlassCard className="p-6 sm:p-8 overflow-hidden">
                <SectionHeader icon={FileText} iconColor="text-orange-500 bg-orange-500" title="Журнал действий" />
                <div className="-mx-2 sm:mx-0 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/50">
                                <th className="px-4 py-3 font-bold w-28">Время</th>
                                <th className="px-4 py-3 font-bold w-40">Пользователь</th>
                                <th className="px-4 py-3 font-bold">Действие</th>
                                <th className="px-4 py-3 font-bold w-24">Контекст</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/80 dark:divide-gray-700/30">
                            {displayedLogs.map((log) => {
                                const isError = log.action && (log.action.includes('Ошибка') || log.action.includes('ошибка') || log.action.includes('ERROR'));
                                return (
                                    <tr key={log.id} className={`transition-colors ${isError ? 'bg-red-50/50 dark:bg-red-900/10' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'}`}>
                                        <td className="px-4 py-3 whitespace-nowrap text-[11px] font-mono text-gray-400">{formatLogTime(log.timestamp)}</td>
                                        <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap text-xs">{log.fio || 'Система'}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                                            {isError && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline mr-1.5 -mt-0.5" />}
                                            {log.action}
                                        </td>
                                        <td className="px-4 py-3 text-[11px] font-mono text-gray-400">
                                            {log.tg_id ? `#${log.tg_id}` : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {logs.length > 10 && (
                    <div className="mt-5 text-center">
                        <button onClick={() => setLogsExpanded(!logsExpanded)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold text-xs transition-all active:scale-95 py-2.5 px-5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 flex items-center justify-center gap-1.5 mx-auto">
                            {logsExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Свернуть</> : <><ChevronDown className="w-3.5 h-3.5" /> Все записи ({logs.length})</>}
                        </button>
                    </div>
                )}
            </GlassCard>
            )}

            {/* ====== SERVER LOGS TERMINAL (hidden from moderators) ====== */}
            {role !== 'moderator' && (
            <GlassCard className="overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700/50">
                    <SectionHeader icon={Terminal} iconColor="text-green-500 bg-green-500" title="Серверные логи" />
                    <button onClick={fetchServerLogs} disabled={serverLogsLoading}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 bg-gray-100 hover:bg-green-50 dark:bg-gray-700 dark:hover:bg-green-900/20 px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 transition-all active:scale-95 disabled:opacity-50 -mt-5">
                        <RefreshCw className={`w-3.5 h-3.5 ${serverLogsLoading ? 'animate-spin' : ''}`} />
                        {serverLogsLoading ? 'Загрузка...' : 'Обновить'}
                    </button>
                </div>
                <div className="bg-slate-900 p-4 sm:p-5 max-h-80 overflow-y-auto custom-scrollbar font-mono text-xs leading-relaxed">
                    {serverLogs.length === 0 ? (
                        <p className="text-slate-500">Нажмите "Обновить" для загрузки серверных логов...</p>
                    ) : (
                        serverLogs.map((line, i) => {
                            const isErr = line.includes('ERROR') || line.includes('Exception') || line.includes('Traceback');
                            const isWarn = line.includes('WARNING') || line.includes('WARN');
                            return (
                                <div key={i} className={`py-0.5 ${isErr ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-slate-300'}`}>
                                    <span className="text-slate-600 select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>
                                    {line}
                                </div>
                            );
                        })
                    )}
                </div>
            </GlassCard>
            )}
        </div>
    );
}

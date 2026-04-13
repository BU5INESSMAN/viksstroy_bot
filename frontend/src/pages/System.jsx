import { useEffect, useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Lock, Users, Search, X, Settings } from 'lucide-react';

import { GlassCard, SectionHeader, ROLE_ORDER, ROLE_NAMES, ROLE_COLORS } from '../features/system/components/UIHelpers';
import SystemSettings from '../features/system/components/SystemSettings';
import NotificationTesting from '../features/system/components/NotificationTesting';
import BroadcastPanel from '../features/system/components/BroadcastPanel';
import LogViewer from '../features/system/components/LogViewer';

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
        smr_unlock_time: '',
        equip_base_time_start: '08:00', equip_base_time_end: '18:00',
        exchange_enabled: true,
        log_retention_days: '90',
        support_tg_link: '',
        support_max_link: '',
        gemini_api_key: '',
    });
    const [testPlatform, setTestPlatform] = useState('all');
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
                    smr_unlock_time: res.data.smr_unlock_time || '',
                    equip_base_time_start: res.data.equip_base_time_start || '08:00',
                    equip_base_time_end: res.data.equip_base_time_end || '18:00',
                    exchange_enabled: b('exchange_enabled'),
                    log_retention_days: res.data.log_retention_days || '90',
                    support_tg_link: res.data.support_tg_link || '',
                    support_max_link: res.data.support_max_link || '',
                    gemini_api_key: res.data.gemini_api_key || '',
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
                smr_unlock_time: settings.smr_unlock_time,
                equip_base_time_start: settings.equip_base_time_start,
                equip_base_time_end: settings.equip_base_time_end,
                exchange_enabled: settings.exchange_enabled ? '1' : '0',
                log_retention_days: settings.log_retention_days,
                support_tg_link: settings.support_tg_link,
                support_max_link: settings.support_max_link,
                gemini_api_key: settings.gemini_api_key,
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
    const filteredUsers = useMemo(() => {
        let result = users.filter(u => u.role !== 'linked');
        if (!userSearch.trim()) return result;
        const q = userSearch.toLowerCase();
        return result.filter(u =>
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
        <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">

            {/* Header */}
            <div className="flex justify-between items-center pt-6">
                <h2 className="text-2xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                    <Settings className="w-7 h-7 text-blue-500 mr-2" /> Система
                </h2>
            </div>

            {/* Automation Settings — hidden from moderators */}
            {role !== 'moderator' && (
                <SystemSettings
                    settings={settings}
                    handleSettingChange={handleSettingChange}
                    saveSettings={saveSettings}
                    role={role}
                />
            )}

            {/* Notification Testing + Role Simulation — hidden from moderators */}
            {role !== 'moderator' && (
                <NotificationTesting
                    tgId={tgId}
                    testPlatform={testPlatform}
                    setTestPlatform={setTestPlatform}
                    testNotification={testNotification}
                    testExtended={testExtended}
                    role={role}
                    handleRoleSimulation={handleRoleSimulation}
                />
            )}

            {/* Broadcast */}
            <BroadcastPanel
                users={users}
                broadcastText={broadcastText}
                setBroadcastText={setBroadcastText}
                broadcastLoading={broadcastLoading}
                sendBroadcastGroup={sendBroadcastGroup}
                dmModalOpen={dmModalOpen}
                setDmModalOpen={setDmModalOpen}
                dmMode={dmMode}
                setDmMode={setDmMode}
                dmSelectedRoles={dmSelectedRoles}
                setDmSelectedRoles={setDmSelectedRoles}
                dmSelectedUsers={dmSelectedUsers}
                setDmSelectedUsers={setDmSelectedUsers}
                sendBroadcastDM={sendBroadcastDM}
            />

            {/* Users Table (Grouped by Role) */}
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
                                    <table className="w-full text-sm text-left table-fixed">
                                        <thead>
                                            <tr className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                                <th className="px-4 py-2 font-bold w-[45%]">ФИО</th>
                                                <th className="px-4 py-2 font-bold w-[25%]">ID</th>
                                                <th className="px-4 py-2 font-bold w-[30%]">Платформа</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100/80 dark:divide-gray-700/30">
                                            {group.map(u => (
                                                <tr key={u.user_id} onClick={() => openProfile(u.user_id)}
                                                    className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors group">
                                                    <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                                                        {u.fio}
                                                        {u.is_blacklisted === 1 && <span className="ml-2 text-[9px] font-extrabold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">BAN</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-mono text-gray-400 truncate">{u.user_id}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(u.platforms || [u.user_id > 0 ? 'TG' : 'MAX']).map(p => (
                                                                <span key={p} className={`text-[10px] font-bold px-2 py-0.5 rounded ${p === 'TG' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' : 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400'}`}>
                                                                    {p === 'TG' ? 'Telegram' : 'MAX'}
                                                                </span>
                                                            ))}
                                                        </div>
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

            {/* Logs — hidden from moderators */}
            {role !== 'moderator' && (
                <LogViewer
                    logs={logs}
                    serverLogs={serverLogs}
                    fetchServerLogs={fetchServerLogs}
                    serverLogsLoading={serverLogsLoading}
                />
            )}
        </div>
    );
}

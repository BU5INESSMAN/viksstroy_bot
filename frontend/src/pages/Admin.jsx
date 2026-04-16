import { useEffect, useState, useMemo, useCallback } from 'react';
import { useOutletContext, useSearchParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ShieldAlert } from 'lucide-react';

import SystemSettings from '../features/system/components/SystemSettings';
import NotificationTesting from '../features/system/components/NotificationTesting';
import BroadcastPanel from '../features/system/components/BroadcastPanel';
import LogViewer from '../features/system/components/LogViewer';
import { SystemSkeleton } from '../components/ui/PageSkeletons';
import UsersTable from '../features/admin/components/UsersTable';

const ADMIN_ROLES = ['boss', 'superadmin'];

export default function Admin() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { openProfile } = useOutletContext();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pendingSection, setPendingSection] = useState(() => searchParams.get('section') || '');

    useEffect(() => {
        const section = searchParams.get('section');
        if (section) {
            setPendingSection(section);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams]);

    useEffect(() => {
        if (pendingSection && users.length > 0) {
            const el = document.getElementById(`admin-${pendingSection}`);
            if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            setPendingSection('');
        }
    }, [pendingSection, users]);

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

    const [broadcastText, setBroadcastText] = useState('');
    const [broadcastLoading, setBroadcastLoading] = useState(false);
    const [dmModalOpen, setDmModalOpen] = useState(false);
    const [dmMode, setDmMode] = useState('roles');
    const [dmSelectedRoles, setDmSelectedRoles] = useState([]);
    const [dmSelectedUsers, setDmSelectedUsers] = useState([]);

    const fetchUsers = useCallback(() => {
        axios.get('/api/users')
            .then((res) => setUsers(res.data || []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetchUsers();
        axios.get('/api/logs').then((res) => setLogs(res.data || [])).catch(() => {});

        axios.get('/api/settings').then((res) => {
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
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [fetchUsers]);

    const handleSettingChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSettings((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
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
            }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            toast.success('Настройки успешно сохранены!');
        } catch { toast.error('Ошибка при сохранении настроек.'); }
    };

    const testNotification = async () => {
        try {
            const formData = new FormData();
            formData.append('platform', testPlatform);
            await axios.post('/api/system/test_notification', formData);
            toast.success('Тестовые уведомления успешно отправлены!');
        } catch { toast.error('Ошибка отправки теста.'); }
    };

    const testExtended = async (testType) => {
        try {
            const formData = new FormData();
            formData.append('test_type', testType);
            formData.append('platform', testPlatform);
            await axios.post('/api/system/test_notification_extended', formData);
            toast.success(`Тест "${testType}" отправлен!`);
        } catch { toast.error('Ошибка отправки теста.'); }
    };

    const handleRoleSimulation = (targetRole) => {
        if (!localStorage.getItem('real_role')) localStorage.setItem('real_role', role);
        localStorage.setItem('user_role', targetRole);
        window.location.href = '/dashboard';
    };

    const fetchServerLogs = useCallback(async () => {
        setServerLogsLoading(true);
        try {
            const res = await axios.get('/api/system/server-logs');
            setServerLogs(res.data.lines || []);
        } catch { setServerLogs(['[Ошибка загрузки логов]']); }
        setServerLogsLoading(false);
    }, [tgId]);

    const sendBroadcastGroup = async () => {
        if (!broadcastText.trim()) return;
        setBroadcastLoading(true);
        try {
            await axios.post('/api/system/broadcast/group', { message: broadcastText });
            toast.success('Сообщение отправлено в группу!');
            setBroadcastText('');
        } catch { toast.error('Ошибка отправки.'); }
        setBroadcastLoading(false);
    };

    const sendBroadcastDM = async () => {
        setBroadcastLoading(true);
        try {
            await axios.post('/api/system/broadcast/dm', {
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

    // Access gate: boss / superadmin only
    if (!ADMIN_ROLES.includes(role)) {
        return <Navigate to="/" replace />;
    }

    if (loading) return <SystemSkeleton />;

    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3 pt-6">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" strokeWidth={2.5} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-tight">Админка</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Управление пользователями, рассылки, логи</p>
                </div>
            </div>

            {/* Users section — new Stage 2 table */}
            <div id="admin-users">
                <UsersTable
                    users={users}
                    currentRole={role}
                    onProfileOpen={(uid) => openProfile(uid)}
                    onReload={fetchUsers}
                />
            </div>

            {/* Automation Settings */}
            <SystemSettings
                settings={settings}
                handleSettingChange={handleSettingChange}
                saveSettings={saveSettings}
                role={role}
            />

            {/* Notification Testing + Role Simulation */}
            <NotificationTesting
                tgId={tgId}
                testPlatform={testPlatform}
                setTestPlatform={setTestPlatform}
                testNotification={testNotification}
                testExtended={testExtended}
                role={role}
                handleRoleSimulation={handleRoleSimulation}
            />

            {/* Broadcast */}
            <div id="admin-broadcast" data-tour="admin-broadcast" />
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

            {/* Logs */}
            <div id="admin-logs" />
            <LogViewer
                logs={logs}
                serverLogs={serverLogs}
                fetchServerLogs={fetchServerLogs}
                serverLogsLoading={serverLogsLoading}
            />
        </div>
    );
}

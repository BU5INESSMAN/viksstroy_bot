import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
    Lock, Settings, Save, Mail, Rocket,
    Shield, Users, FileText, ChevronUp, ChevronDown,
    ToggleLeft, Clock, CalendarDays, CheckCircle
} from 'lucide-react';

export default function System() {
    const { openProfile } = useOutletContext();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';

    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [settings, setSettings] = useState({
        auto_publish_time: '',
        auto_publish_enabled: false,
        foreman_reminder_time: '',
        foreman_reminder_weekends: false,
        auto_complete_time: ''
    });

    const [testPlatform, setTestPlatform] = useState('all');
    const [logsExpanded, setLogsExpanded] = useState(false);

    const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'brigadier': 'Бригадир', 'worker': 'Рабочий', 'driver': 'Водитель', 'Гость': 'Гость' };

    useEffect(() => {
        axios.get('/api/users').then(res => setUsers(res.data || [])).catch(() => {});
        axios.get('/api/logs').then(res => setLogs(res.data || [])).catch(() => {});

        if (['superadmin', 'boss', 'moderator'].includes(role)) {
            axios.get('/api/settings').then(res => {
                setSettings({
                    auto_publish_time: res.data.auto_publish_time || '',
                    auto_publish_enabled: res.data.auto_publish_enabled === '1' || res.data.auto_publish_enabled === 'true',
                    foreman_reminder_time: res.data.foreman_reminder_time || '',
                    foreman_reminder_weekends: res.data.foreman_reminder_weekends === '1' || res.data.foreman_reminder_weekends === 'true',
                    auto_complete_time: res.data.auto_complete_time || ''
                });
            }).catch(() => {});
        }
    }, [role]);

    const handleSettingChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const saveSettings = async () => {
        try {
            await axios.post('/api/settings/update', {
                auto_publish_time: settings.auto_publish_time,
                auto_publish_enabled: settings.auto_publish_enabled ? '1' : '0',
                foreman_reminder_time: settings.foreman_reminder_time,
                foreman_reminder_weekends: settings.foreman_reminder_weekends ? '1' : '0',
                auto_complete_time: settings.auto_complete_time,
                tg_id: tgId
            }, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            alert('Настройки успешно сохранены!');
        } catch (error) {
            alert('Ошибка при сохранении настроек.');
        }
    };

    const testNotification = async () => {
        try {
            const formData = new FormData();
            formData.append('tg_id', tgId);
            formData.append('platform', testPlatform);
            await axios.post('/api/system/test_notification', formData);
            alert("Тестовые уведомления успешно отправлены!");
        } catch (err) {
            alert("Ошибка отправки теста.");
        }
    };

    const handleRoleSimulation = (targetRole) => {
        if (!localStorage.getItem('real_role')) {
            localStorage.setItem('real_role', role);
        }
        localStorage.setItem('user_role', targetRole);
        window.location.href = '/dashboard';
    };

    const formatLogTime = (timestamp) => {
        if (!timestamp) return '';
        let safeTimestamp = timestamp;
        if (typeof timestamp === 'string' && !timestamp.includes('Z') && !timestamp.includes('+')) {
            safeTimestamp = timestamp.replace(' ', 'T') + 'Z';
        }
        try {
            return new Date(safeTimestamp).toLocaleString('ru-RU', { timeZone: 'Asia/Barnaul', hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'2-digit' });
        } catch (e) {
            return new Date(timestamp).toLocaleString('ru-RU');
        }
    };

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

    const displayedLogs = logsExpanded ? logs : logs.slice(0, 10);

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6 pb-24">
            {/* БЛОК АВТОМАТИЗАЦИИ */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-xl font-bold mb-6 flex items-center text-gray-800 dark:text-gray-100">
                    <Settings className="w-6 h-6 text-blue-500 mr-2.5" /> Настройки автоматизации
                </h2>
                <div className="space-y-6">

                    <div className="space-y-4">
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-600 shadow-sm">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-blue-500" /> Авто-старт нарядов (Базовое время)
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-medium leading-relaxed">Укажите стандартное время начала работ для заявок без техники (например, 08:00).</p>
                            <input
                                type="time"
                                name="auto_publish_time"
                                value={settings.auto_publish_time}
                                onChange={handleSettingChange}
                                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-blue-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none transition-colors"
                            />
                        </div>

                        <div className={`p-5 rounded-2xl border shadow-sm transition-colors ${settings.auto_publish_enabled ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50' : 'bg-gray-50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-600'}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                                        <Rocket className={`w-4 h-4 ${settings.auto_publish_enabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} /> Авто-публикация заявок
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                                        Одобренные заявки на текущий день будут автоматически опубликованы в беседу ровно в то время, которое указано как начало их работы.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                                    <input type="checkbox" name="auto_publish_enabled" checked={settings.auto_publish_enabled} onChange={handleSettingChange} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-600 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-500" /> Авто-завершение нарядов
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-medium leading-relaxed">Система переведет активные наряды в статус "Ожидает отчета" и запросит табель у прораба.</p>
                        <input type="time" name="auto_complete_time" value={settings.auto_complete_time} onChange={handleSettingChange} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-blue-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none transition-colors" />
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-600 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                                    <Mail className="w-4 h-4 text-orange-500" /> Напоминание прорабам
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">Бот напомнит прорабам заполнить заявки на следующий день.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                <span className="mr-3 text-xs font-bold text-gray-700 dark:text-gray-300">По выходным</span>
                                <input type="checkbox" name="foreman_reminder_weekends" checked={settings.foreman_reminder_weekends} onChange={handleSettingChange} className="sr-only peer" />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500"></div>
                            </label>
                        </div>
                        <input type="time" name="foreman_reminder_time" value={settings.foreman_reminder_time} onChange={handleSettingChange} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-blue-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none transition-colors" />
                    </div>

                    <button onClick={saveSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm py-4 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                        <Save className="w-4 h-4" /> Сохранить настройки
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* БЛОК ТЕСТИРОВАНИЯ УВЕДОМЛЕНИЙ */}
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                    <h2 className="text-lg font-bold mb-5 flex items-center text-gray-800 dark:text-gray-100">
                        <Mail className="w-6 h-6 text-indigo-500 mr-2.5" /> Отладка уведомлений
                    </h2>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Платформа</label>
                            <select value={testPlatform} onChange={(e) => setTestPlatform(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 block p-3.5 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none shadow-inner transition-colors">
                                <option value="all">Все (MAX + Telegram)</option>
                                <option value="max">Только MAX</option>
                                <option value="telegram">Только Telegram</option>
                            </select>
                        </div>
                        <button onClick={testNotification} className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40 font-bold rounded-xl text-sm py-4 border border-indigo-200 dark:border-indigo-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm">
                            <Rocket className="w-4 h-4" /> Запустить тест
                        </button>
                    </div>
                </div>

                {/* БЛОК СИМУЛЯЦИИ РОЛЕЙ */}
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                    <h2 className="text-lg font-bold mb-3 flex items-center text-gray-800 dark:text-gray-100">
                        <Shield className="w-6 h-6 text-purple-500 mr-2.5" /> Симуляция ролей
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 font-medium leading-relaxed">
                        Временно переключите свой аккаунт на другую роль. Вернуться обратно можно через профиль.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        {Object.entries(roleNames).map(([rKey, rName]) => (
                            <button
                                key={rKey}
                                onClick={() => handleRoleSimulation(rKey)}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-sm border active:scale-95 flex items-center justify-center gap-1.5 ${
                                    role === rKey 
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-200 dark:ring-purple-900' 
                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                }`}
                            >
                                {role === rKey && <ToggleLeft className="w-3.5 h-3.5" />} {rName}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 transition-colors duration-200 overflow-hidden">
                <h2 className="text-xl font-bold mb-2 flex items-center text-gray-800 dark:text-gray-100">
                    <Users className="w-6 h-6 text-emerald-500 mr-2.5" /> Пользователи
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium">Нажмите на пользователя, чтобы изменить его роль или заблокировать.</p>
                <div className="-mx-6 sm:mx-0 overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-700/50 border-y border-gray-100 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-4 font-bold tracking-wider">ФИО</th>
                                <th className="px-6 py-4 font-bold tracking-wider">Роль</th>
                                <th className="px-6 py-4 font-bold tracking-wider">Платформа</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {users.map((u) => (
                                <tr key={u.user_id} onClick={() => openProfile(u.user_id)} className="cursor-pointer bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors group">
                                    <td className="px-6 py-4 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap group-hover:text-blue-600 dark:group-hover:text-blue-400">{u.fio}</td>
                                    <td className="px-6 py-4">
                                        <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border border-emerald-100 dark:border-emerald-800/50">
                                            {roleNames[u.role] || u.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 px-2.5 py-1 rounded-md border border-gray-100 dark:border-gray-600/50">
                                            {u.user_id > 0 ? 'Telegram' : 'MAX'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ЖУРНАЛ ДЕЙСТВИЙ */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 transition-colors duration-200 overflow-hidden">
                <h2 className="text-xl font-bold mb-6 flex items-center text-gray-800 dark:text-gray-100">
                    <FileText className="w-6 h-6 text-orange-500 mr-2.5" /> Журнал действий
                </h2>
                <div className="-mx-6 sm:mx-0 overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-700/50 border-y border-gray-100 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-4 font-bold tracking-wider w-32">Время</th>
                                <th className="px-6 py-4 font-bold tracking-wider w-48">Пользователь</th>
                                <th className="px-6 py-4 font-bold tracking-wider">Действие</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {displayedLogs.map((log) => (
                                <tr key={log.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-400">{formatLogTime(log.timestamp)}</td>
                                    <td className="px-6 py-4 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">{log.fio || 'Неизвестно'}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{log.action}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {logs.length > 10 && (
                    <div className="mt-6 text-center">
                        <button
                            onClick={() => setLogsExpanded(!logsExpanded)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold text-sm transition-all active:scale-95 py-3 px-6 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 flex items-center justify-center gap-2 mx-auto"
                        >
                            {logsExpanded ? <><ChevronUp className="w-4 h-4" /> Свернуть журнал</> : <><ChevronDown className="w-4 h-4" /> Показать все записи ({logs.length})</>}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';

export default function System() {
    const { openProfile } = useOutletContext(); // ВОЗВРАЩЕНО: Контекст для открытия модалки редактирования пользователя
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';

    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [settings, setSettings] = useState({
        auto_publish_time: '',
        foreman_reminder_time: '',
        foreman_reminder_weekends: false,
        auto_complete_time: ''
    });

    const [testPlatform, setTestPlatform] = useState('all');

    const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель', 'Гость': 'Гость' };

    useEffect(() => {
        axios.get('/api/users').then(res => setUsers(res.data || [])).catch(() => {});
        axios.get('/api/logs').then(res => setLogs(res.data || [])).catch(() => {});

        if (['superadmin', 'boss', 'moderator'].includes(role)) {
            axios.get('/api/settings').then(res => {
                setSettings({
                    auto_publish_time: res.data.auto_publish_time || '',
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
            alert("Тестовые уведомления (анкета и проверка ролей) успешно отправлены!");
        } catch (err) {
            alert("Ошибка отправки теста.");
        }
    };

    if (!['superadmin', 'boss', 'moderator'].includes(role)) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <span className="text-4xl mb-4">🔒</span><p>У вас нет доступа к этому разделу.</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            {/* БЛОК АВТОМАТИЗАЦИИ */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100">
                    <span className="text-2xl mr-2">⚙️</span> Настройки автоматизации
                </h2>

                <div className="space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Авто-старт нарядов</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Система автоматически начнет работу по нарядам на этот день и уведомит рабочих.</p>
                        <input type="time" name="auto_publish_time" value={settings.auto_publish_time} onChange={handleSettingChange} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Авто-завершение нарядов</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Система переведет активные наряды в статус "Ожидает отчета" и запросит табель у прораба.</p>
                        <input type="time" name="auto_complete_time" value={settings.auto_complete_time} onChange={handleSettingChange} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>

                    <hr className="border-gray-200 dark:border-gray-700" />

                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Напоминание прорабам</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Бот напомнит прорабам заполнить заявки на следующий день.</p>
                        <input type="time" name="foreman_reminder_time" value={settings.foreman_reminder_time} onChange={handleSettingChange} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>

                    <div className="flex items-center">
                        <input type="checkbox" name="foreman_reminder_weekends" checked={settings.foreman_reminder_weekends} onChange={handleSettingChange} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600" />
                        <label className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Включить напоминания по выходным</label>
                    </div>

                    <button onClick={saveSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm px-5 py-3 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 transition-colors flex items-center justify-center gap-2">
                        <span>💾</span> Сохранить настройки автоматизации
                    </button>
                </div>
            </div>

            {/* ВОЗВРАЩЕНО: БЛОК ТЕСТИРОВАНИЯ АНКЕТ И РОЛЕЙ */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100">
                    <span className="text-2xl mr-2">🧪</span> Отладка и тестирование
                </h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Платформа для отправки тестов (анкет и ролей)</label>
                        <select value={testPlatform} onChange={(e) => setTestPlatform(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="all">Все платформы (MAX + Telegram)</option>
                            <option value="max">Только MAX</option>
                            <option value="telegram">Только Telegram</option>
                        </select>
                    </div>
                    <button onClick={testNotification} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg text-sm px-5 py-3 border border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                        <span>🚀</span> Запустить тест анкет и ролей (Уведомления)
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        * Нажатие на эту кнопку сгенерирует тестовую заявку-анкету и разошлет проверочные системные уведомления для ролей.
                    </p>
                </div>
            </div>

            {/* ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ (С ВОЗВРАЩЕННЫМ КЛИКОМ ДЛЯ РЕДАКТИРОВАНИЯ) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100">
                    <span className="text-2xl mr-2">👥</span> Пользователи системы
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Нажмите на пользователя, чтобы изменить его роль или заблокировать.</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700"><tr><th className="px-6 py-3">ФИО</th><th className="px-6 py-3">Роль</th><th className="px-6 py-3">Платформа</th></tr></thead>
                        <tbody>
                            {users.map((u) => (
                                /* ВОЗВРАЩЕНО: onClick={() => openProfile(u)} и класс cursor-pointer */
                                <tr key={u.user_id} onClick={() => openProfile(u)} className="cursor-pointer bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{u.fio}</td>
                                    <td className="px-6 py-4"><span className="bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">{roleNames[u.role] || u.role}</span></td>
                                    <td className="px-6 py-4">{u.user_id > 0 ? 'Telegram' : 'MAX'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ЖУРНАЛ ДЕЙСТВИЙ */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📜</span> Журнал действий системы</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700"><tr><th className="px-6 py-3">Время</th><th className="px-6 py-3">Пользователь</th><th className="px-6 py-3">Действие</th></tr></thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString('ru-RU') : ''}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{log.fio || 'Неизвестно'}</td>
                                    <td className="px-6 py-4">{log.action}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
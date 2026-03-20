import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';

export default function System() {
    const { openProfile } = useOutletContext();
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';

    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [settings, setSettings] = useState({ auto_publish_time: '', foreman_reminder_time: '', foreman_reminder_weekends: false });

    const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель', 'Гость': 'Гость' };

    useEffect(() => {
        axios.get('/api/users').then(res => setUsers(res.data || [])).catch(() => {});
        axios.get('/api/logs').then(res => setLogs(res.data || [])).catch(() => {});

        if (['superadmin', 'boss', 'moderator'].includes(role)) {
            axios.get('/api/settings').then(res => {
                setSettings({
                    auto_publish_time: res.data.auto_publish_time || '',
                    foreman_reminder_time: res.data.foreman_reminder_time || '',
                    foreman_reminder_weekends: res.data.foreman_reminder_weekends === '1'
                });
            }).catch(() => {});
        }
    }, [role]);

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('auto_publish_time', settings.auto_publish_time);
            fd.append('foreman_reminder_time', settings.foreman_reminder_time);
            fd.append('foreman_reminder_weekends', settings.foreman_reminder_weekends ? '1' : '0');
            fd.append('tg_id', tgId);
            await axios.post('/api/settings/update', fd);
            alert('Настройки сохранены!');
            const res = await axios.get('/api/logs');
            setLogs(res.data || []);
        } catch (e) {
            alert('Ошибка сохранения настроек');
        }
    };

    // ФУНКЦИЯ ДЛЯ ТЕСТИРОВАНИЯ УВЕДОМЛЕНИЙ (Telegram + MAX)
    const handleTestNotification = async () => {
        if (!window.confirm("Отправить тестовый наряд во все подключенные группы и личные сообщения?")) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post('/api/system/test_notification', fd);
            alert('✅ Тестовые уведомления успешно отправлены!');
        } catch (e) {
            alert(e.response?.data?.detail || 'Ошибка отправки тестового уведомления');
        }
    };

    if (!['superadmin', 'boss', 'moderator'].includes(role)) {
        return <div className="text-center mt-20 text-gray-500">У вас нет доступа к этому разделу.</div>;
    }

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Управление системой</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                        <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">👥</span> Пользователи бота</h2>
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {users.map(u => (
                                <div key={u.user_id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600 transition-colors">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 bg-cover bg-center shrink-0 flex items-center justify-center overflow-hidden" style={{ backgroundImage: u.avatar_url ? `url(${u.avatar_url})` : 'none' }}>
                                            {!u.avatar_url && <span className="text-xl opacity-50">👤</span>}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white flex items-center">
                                                {u.fio}
                                                {u.is_blacklisted === 1 && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Заблокирован</span>}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mt-0.5">{roleNames[u.role] || u.role}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => openProfile(u.user_id)} className="bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors">Профиль</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                        <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📜</span> Журнал действий системы</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700"><tr><th className="px-6 py-3">Время</th><th className="px-6 py-3">Пользователь</th><th className="px-6 py-3">Действие</th></tr></thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"><td className="px-6 py-4 whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString('ru-RU') : ''}</td><td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{log.fio}</td><td className="px-6 py-4">{log.action}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                        <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">⚙️</span> Системные настройки</h2>
                        <form onSubmit={handleSaveSettings} className="space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Время авто-публикации нарядов</label>
                                <input type="time" value={settings.auto_publish_time} onChange={e => setSettings({...settings, auto_publish_time: e.target.value})} className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-all" />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Система автоматически отправит все одобренные наряды в общий чат в это время.</p>
                            </div>
                            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Время напоминания прорабам</label>
                                <input type="time" value={settings.foreman_reminder_time} onChange={e => setSettings({...settings, foreman_reminder_time: e.target.value})} className="w-full p-3 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-all" />
                                <div className="flex items-center mt-3">
                                    <input type="checkbox" id="weekends" checked={settings.foreman_reminder_weekends} onChange={e => setSettings({...settings, foreman_reminder_weekends: e.target.checked})} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer" />
                                    <label htmlFor="weekends" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">Напоминать в выходные дни</label>
                                </div>
                            </div>
                            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-transform transform active:scale-95 flex justify-center items-center space-x-2"><span>💾</span><span>Сохранить настройки</span></button>
                        </form>

                        {/* БЛОК ДЛЯ ТЕСТИРОВАНИЯ (ВИДЕН ТОЛЬКО СУПЕРАДМИНУ) */}
                        {role === 'superadmin' && (
                            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 uppercase tracking-wider">Тестирование интеграций</h3>
                                <button
                                    onClick={handleTestNotification}
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3.5 rounded-xl font-bold transition-all shadow-md flex items-center justify-center space-x-2 active:scale-95"
                                >
                                    <span className="text-lg">🧪</span>
                                    <span>Отправить тестовый наряд</span>
                                </button>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">
                                    Создаст фейковый наряд и разошлет уведомления во все общие группы (Telegram и MAX), а также в ваши личные сообщения.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
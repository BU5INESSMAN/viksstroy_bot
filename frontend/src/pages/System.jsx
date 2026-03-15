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

    const handleTestRole = (testRole) => {
        if (!localStorage.getItem('real_role')) {
            localStorage.setItem('real_role', role);
        }
        localStorage.setItem('user_role', testRole);
        window.location.reload();
    };

    const saveSettings = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('auto_publish_time', settings.auto_publish_time);
            fd.append('foreman_reminder_time', settings.foreman_reminder_time);
            fd.append('foreman_reminder_weekends', settings.foreman_reminder_weekends ? '1' : '0');
            fd.append('tg_id', tgId);
            await axios.post('/api/settings/update', fd);
            alert("Настройки успешно сохранены!");
        } catch (err) { alert("Ошибка сохранения настроек"); }
    };

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

            {role === 'superadmin' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                    <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100 flex items-center"><span className="text-2xl mr-2">🎭</span> Тестирование ролей</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Выберите роль для имитации интерфейса. Чтобы вернуться, нажмите кнопку на желтом баннере сверху.</p>
                    <div className="flex flex-wrap gap-3">
                        <button onClick={() => handleTestRole('moderator')} className="px-4 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-lg font-bold">Модератор</button>
                        <button onClick={() => handleTestRole('foreman')} className="px-4 py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg font-bold">Прораб</button>
                        <button onClick={() => handleTestRole('worker')} className="px-4 py-2 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg font-bold">Рабочий бригады</button>
                        <button onClick={() => handleTestRole('driver')} className="px-4 py-2 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-lg font-bold">Водитель техники</button>
                    </div>
                </div>
            )}

            {['superadmin', 'boss', 'moderator'].includes(role) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                    <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">⚙️</span> Настройки автоматизации</h2>
                    <form onSubmit={saveSettings} className="space-y-5 max-w-lg">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Авто-публикация заявок</label>
                            <p className="text-xs text-gray-500 mb-2">Система будет автоматически публиковать заявки НА ЭТОТ ЖЕ ДЕНЬ в указанное время.</p>
                            <input type="time" value={settings.auto_publish_time} onChange={e => setSettings({...settings, auto_publish_time: e.target.value})} className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </div>
                        <div className="pt-2 border-t dark:border-gray-700">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Напоминание прорабам</label>
                            <p className="text-xs text-gray-500 mb-2">Бот напомнит прорабам заполнить заявки на следующий день.</p>
                            <input type="time" value={settings.foreman_reminder_time} onChange={e => setSettings({...settings, foreman_reminder_time: e.target.value})} className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-3" />

                            <div className="flex items-center">
                                <input type="checkbox" id="weekend_rem" checked={settings.foreman_reminder_weekends} onChange={e => setSettings({...settings, foreman_reminder_weekends: e.target.checked})} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                <label htmlFor="weekend_rem" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">Включить напоминания по выходным</label>
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-blue-700 transition">💾 Сохранить настройки</button>
                    </form>
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">👨‍💼</span> Пользователи системы</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {users.map(u => (
                        <div key={u.user_id} onClick={() => openProfile(u.user_id)} className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-md cursor-pointer transition bg-white dark:bg-gray-700 group hover:border-blue-300 dark:hover:border-blue-500">
                            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 mr-3 flex-shrink-0 overflow-hidden bg-cover bg-center" style={{ backgroundImage: u.avatar_url ? `url(${u.avatar_url})` : 'none' }}>{!u.avatar_url && <span className="flex items-center justify-center w-full h-full text-xl text-gray-400 dark:text-gray-300">👤</span>}</div>
                            <div className="overflow-hidden"><p className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{u.fio}</p><p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-0.5">{roleNames[u.role]}</p></div>
                        </div>
                    ))}
                </div>
            </div>

            {['boss', 'superadmin'].includes(role) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
                    <h2 className="text-lg font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100"><span className="text-2xl mr-2">📜</span> Журнал действий системы</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700"><tr><th className="px-6 py-3">Время</th><th className="px-6 py-3">Пользователь</th><th className="px-6 py-3">Действие</th></tr></thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"><td className="px-6 py-4 whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString('ru-RU') : ''}</td><td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">{log.fio}</td><td className="px-6 py-4 text-blue-600 dark:text-blue-400">{log.action}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </main>
    );
}
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';

export default function System() {
    const { openProfile } = useOutletContext();
    const role = localStorage.getItem('user_role') || 'Гость';
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'Гость': 'Гость' };

    useEffect(() => {
        axios.get('/api/users').then(res => setUsers(res.data || [])).catch(() => {});
        axios.get('/api/logs').then(res => setLogs(res.data || [])).catch(() => {});
    }, []);

    return (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
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
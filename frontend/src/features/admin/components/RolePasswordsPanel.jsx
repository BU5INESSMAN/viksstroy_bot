import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Check, Copy, Eye, EyeOff, KeyRound, Save } from 'lucide-react';

export default function RolePasswordsPanel({ role }) {
    const [items, setItems] = useState([]);
    const [visible, setVisible] = useState({});
    const [saving, setSaving] = useState('');

    useEffect(() => {
        if (role !== 'superadmin') return;
        axios.get('/api/admin/role-passwords')
            .then((response) => setItems(response.data || []))
            .catch(() => toast.error('Не удалось загрузить пароли ролей'));
    }, [role]);

    if (role !== 'superadmin') return null;

    const change = (targetRole, password) => {
        setItems((current) => current.map((item) => (
            item.role === targetRole ? { ...item, password } : item
        )));
    };

    const copy = async (password) => {
        try {
            await navigator.clipboard.writeText(password);
            toast.success('Пароль скопирован');
        } catch {
            toast.error('Не удалось скопировать пароль');
        }
    };

    const save = async (item) => {
        setSaving(item.role);
        try {
            await axios.put(`/api/admin/role-passwords/${item.role}`, { password: item.password });
            toast.success(`Пароль роли «${item.label}» изменён`);
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Ошибка сохранения');
        } finally {
            setSaving('');
        }
    };

    return (
        <section id="admin-role-passwords" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Пароли ролей</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Используются при первой регистрации через MAX. Доступны только супер-администратору.</p>
                </div>
            </div>
            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item.role} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2 sm:items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700">
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{item.label}</span>
                        <div className="relative min-w-0">
                            <input
                                type={visible[item.role] ? 'text' : 'password'}
                                value={item.password}
                                onChange={(event) => change(item.role, event.target.value)}
                                className="w-full h-11 pl-3 pr-20 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
                            />
                            <div className="absolute right-1 top-1 flex">
                                <button type="button" onClick={() => setVisible((current) => ({ ...current, [item.role]: !current[item.role] }))} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700" aria-label="Показать пароль">
                                    {visible[item.role] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button type="button" onClick={() => copy(item.password)} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-violet-600" aria-label="Скопировать пароль">
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <button type="button" onClick={() => save(item)} disabled={saving === item.role} className="h-11 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                            {saving === item.role ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} Сохранить
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}

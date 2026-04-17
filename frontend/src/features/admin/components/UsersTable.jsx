import { useState, useMemo, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Search, X, User, ChevronDown, Send, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '../../../components/ui/GlassCard';
import UserName from '../../../components/ui/UserName';
import { ROLE_NAMES, ROLE_COLORS, ROLE_ORDER } from '../../../utils/roleConfig';
import { displayFio } from '../../../utils/fioFormat';
import useConfirm from '../../../hooks/useConfirm';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Admin users table with inline role dropdown, search, and optimistic updates.
 *
 * Row click → open ProfileModal.
 * Role select (inside the role cell) stops propagation → ConfirmModal → PATCH.
 */
export default function UsersTable({ users, currentRole, onProfileOpen, onReload }) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [localUsers, setLocalUsers] = useState(users);
    const { confirm, ConfirmUI } = useConfirm();

    useEffect(() => { setLocalUsers(users); }, [users]);

    // Debounce search input (200ms)
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200);
        return () => clearTimeout(id);
    }, [search]);

    const availableRoles = useMemo(() => {
        if (currentRole === 'superadmin') return ROLE_ORDER;
        // boss: all except superadmin
        return ROLE_ORDER.filter((r) => r !== 'superadmin');
    }, [currentRole]);

    const filtered = useMemo(() => {
        let list = (localUsers || []).filter((u) => u.role !== 'linked');
        if (debouncedSearch) {
            list = list.filter((u) => {
                const fio = (displayFio(u) || '').toLowerCase();
                const spec = (u.specialty || '').toLowerCase();
                return fio.includes(debouncedSearch) || spec.includes(debouncedSearch);
            });
        }
        // v2.4 FIX 8: sort by role rank first, then alphabetically within role
        const ROLE_SORT_ORDER = {
            superadmin: 0, boss: 1, moderator: 2, foreman: 3,
            brigadier: 4, worker: 5, driver: 6,
        };
        list.sort((a, b) => {
            const roleA = ROLE_SORT_ORDER[a.role] ?? 99;
            const roleB = ROLE_SORT_ORDER[b.role] ?? 99;
            if (roleA !== roleB) return roleA - roleB;
            const al = (a.last_name || a.fio || '').toLowerCase();
            const bl = (b.last_name || b.fio || '').toLowerCase();
            const cmp = al.localeCompare(bl, 'ru');
            if (cmp !== 0) return cmp;
            return (a.first_name || '').localeCompare(b.first_name || '', 'ru');
        });
        return list;
    }, [localUsers, debouncedSearch]);

    const handleRoleChange = async (user, newRole) => {
        if (newRole === user.role) return;
        const oldRu = ROLE_NAMES[user.role] || user.role;
        const newRu = ROLE_NAMES[newRole] || newRole;
        const ok = await confirm(
            `Изменить роль ${displayFio(user)} с ${oldRu} на ${newRu}?`,
            { title: 'Изменение роли', confirmText: 'Изменить', variant: 'warning' },
        );
        if (!ok) return;

        // Optimistic
        setLocalUsers((prev) => prev.map((u) => u.user_id === user.user_id ? { ...u, role: newRole } : u));
        try {
            await axios.patch(`/api/users/${user.user_id}`, { role: newRole });
            toast.success(`Роль обновлена: ${newRu}`);
            onReload?.();
        } catch (e) {
            // Rollback
            setLocalUsers((prev) => prev.map((u) => u.user_id === user.user_id ? { ...u, role: user.role } : u));
            toast.error(e?.response?.data?.detail || 'Ошибка изменения роли');
        }
    };

    return (
        <>
            <GlassCard className="p-5 sm:p-6">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">Пользователи</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Нажмите на строку для редактирования профиля</p>
                    </div>
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums mt-1.5">{filtered.length}</span>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по ФИО или специальности..."
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-colors"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                    )}
                </div>

                {filtered.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8 font-medium">
                        Пользователи не найдены
                    </p>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block -mx-2 overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                        <th className="px-3 py-2.5 font-bold w-10">Аватар</th>
                                        <th className="px-3 py-2.5 font-bold">ФИО</th>
                                        <th className="px-3 py-2.5 font-bold w-48">Роль</th>
                                        <th className="px-3 py-2.5 font-bold w-56">Специальность</th>
                                        <th className="px-3 py-2.5 font-bold w-32">Платформы</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                                    {filtered.map((u) => (
                                        <UserRow
                                            key={u.user_id}
                                            user={u}
                                            availableRoles={availableRoles}
                                            onRoleChange={(newRole) => handleRoleChange(u, newRole)}
                                            onRowClick={() => onProfileOpen?.(u.user_id)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden space-y-2">
                            {filtered.map((u) => (
                                <UserCard
                                    key={u.user_id}
                                    user={u}
                                    availableRoles={availableRoles}
                                    onRoleChange={(newRole) => handleRoleChange(u, newRole)}
                                    onOpen={() => onProfileOpen?.(u.user_id)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </GlassCard>
            {ConfirmUI}
        </>
    );
}

/* ───── Desktop row ───── */
function UserRow({ user, availableRoles, onRoleChange, onRowClick }) {
    const fio = displayFio(user);

    return (
        <motion.tr
            onClick={onRowClick}
            whileTap={prefersReducedMotion ? {} : { scale: 0.995 }}
            className="cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
        >
            <td className="px-3 py-3">
                <Avatar url={user.avatar_url} fio={fio} size={32} />
            </td>
            <td className="px-3 py-3 font-bold text-gray-900 dark:text-gray-100 truncate">
                <UserName user={user} fallback="—" />
                {user.is_blacklisted === 1 && (
                    <span className="ml-2 text-[9px] font-extrabold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">BAN</span>
                )}
            </td>
            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <RoleDropdown user={user} availableRoles={availableRoles} onChange={onRoleChange} />
            </td>
            <td className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400 truncate">
                {user.specialty || <span className="text-gray-300 dark:text-gray-600">—</span>}
            </td>
            <td className="px-3 py-3">
                <PlatformPills platforms={user.platforms} userId={user.user_id} />
            </td>
        </motion.tr>
    );
}

/* ───── Mobile card ───── */
function UserCard({ user, availableRoles, onRoleChange, onOpen }) {
    return (
        <motion.div
            whileTap={prefersReducedMotion ? {} : { scale: 0.99 }}
            className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white/60 dark:bg-gray-800/40 p-3.5 flex items-start gap-3"
        >
            <button type="button" onClick={onOpen} className="flex-shrink-0">
                <Avatar url={user.avatar_url} fio={displayFio(user)} size={40} />
            </button>
            <div className="min-w-0 flex-1">
                <button type="button" onClick={onOpen} className="block text-left w-full">
                    <div className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">
                        <UserName user={user} fallback="—" />
                    </div>
                    {user.specialty ? (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{user.specialty}</div>
                    ) : null}
                </button>
                <div className="flex items-center justify-between gap-2 mt-2">
                    <div onClick={(e) => e.stopPropagation()} className="min-w-0">
                        <RoleDropdown user={user} availableRoles={availableRoles} onChange={onRoleChange} compact />
                    </div>
                    <PlatformPills platforms={user.platforms} userId={user.user_id} />
                </div>
            </div>
        </motion.div>
    );
}

/* ───── Role dropdown ───── */
function RoleDropdown({ user, availableRoles, onChange, compact }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const colorClass = ROLE_COLORS[user.role] || 'bg-gray-50 text-gray-600 border-gray-200';

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wide transition-colors active:scale-[0.97] ${colorClass} ${compact ? '' : ''}`}
            >
                <span className="truncate">{ROLE_NAMES[user.role] || user.role}</span>
                <ChevronDown className="w-3 h-3 flex-shrink-0" />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.ul
                        initial={prefersReducedMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute z-40 mt-1.5 min-w-[11rem] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden"
                    >
                        {availableRoles.map((r) => (
                            <li key={r}>
                                <button
                                    type="button"
                                    onClick={() => { setOpen(false); onChange(r); }}
                                    className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors
                                        ${r === user.role ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
                                >
                                    <span>{ROLE_NAMES[r] || r}</span>
                                    {r === user.role ? <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> : null}
                                </button>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ───── Platform pills ───── */
function PlatformPills({ platforms, userId }) {
    const list = platforms && platforms.length ? platforms : [userId > 0 ? 'TG' : 'MAX'];
    return (
        <div className="flex items-center gap-1.5">
            {list.includes('TG') ? (
                <span title="Telegram" className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                    <Send className="w-3 h-3" />
                </span>
            ) : (
                <span title="Telegram — не привязан" className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gray-50 text-gray-300 dark:bg-gray-800 dark:text-gray-600">
                    <Send className="w-3 h-3" />
                </span>
            )}
            {list.includes('MAX') ? (
                <span title="MAX" className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                    <Smartphone className="w-3 h-3" />
                </span>
            ) : (
                <span title="MAX — не привязан" className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gray-50 text-gray-300 dark:bg-gray-800 dark:text-gray-600">
                    <Smartphone className="w-3 h-3" />
                </span>
            )}
        </div>
    );
}

function Avatar({ url, fio, size = 32 }) {
    if (url) {
        return (
            <img
                src={url}
                alt=""
                draggable="false"
                style={{ width: size, height: size }}
                className="rounded-full object-cover bg-gray-100 dark:bg-gray-700"
            />
        );
    }
    const initials = (fio || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase();
    return (
        <div
            style={{ width: size, height: size }}
            className="rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[11px] font-bold text-gray-500 dark:text-gray-300 select-none"
        >
            {initials || '?'}
        </div>
    );
}

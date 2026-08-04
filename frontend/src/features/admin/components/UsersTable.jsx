import { useState, useMemo, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Search, X, User, ChevronDown, Smartphone, Ban, ShieldOff, RotateCcw, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '../../../components/ui/GlassCard';
import UserName from '../../../components/ui/UserName';
import { ROLE_NAMES, ROLE_COLORS, ROLE_ORDER } from '../../../utils/roleConfig';
import { displayFio } from '../../../utils/fioFormat';
import useConfirm from '../../../hooks/useConfirm';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MotionRow = motion.tr;
const MotionCard = motion.div;
const MotionList = motion.ul;

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
    const [statusFilter, setStatusFilter] = useState('active');
    const [banTarget, setBanTarget] = useState(null);
    const [banReason, setBanReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const { confirm, ConfirmUI } = useConfirm();
    const canChangeRoles = currentRole === 'superadmin' || currentRole === 'boss';
    const canManageUsers = canChangeRoles;

    const counts = useMemo(() => {
        const base = (localUsers || []).filter((u) => u.role !== 'linked');
        return {
            all: base.length,
            active: base.filter((u) => !u.is_blacklisted && !u.is_deleted).length,
            banned: base.filter((u) => u.is_blacklisted).length,
            deleted: base.filter((u) => u.is_deleted).length,
        };
    }, [localUsers]);

    useEffect(() => {
        // Server reloads are authoritative after an optimistic role update.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalUsers(users);
    }, [users]);

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
        if (statusFilter === 'active') list = list.filter((u) => !u.is_blacklisted && !u.is_deleted);
        if (statusFilter === 'banned') list = list.filter((u) => u.is_blacklisted);
        if (statusFilter === 'deleted') list = list.filter((u) => u.is_deleted);
        if (debouncedSearch) {
            list = list.filter((u) => {
                const fio = (displayFio(u) || '').toLowerCase();
                const spec = (u.specialty || '').toLowerCase();
                return fio.includes(debouncedSearch) || spec.includes(debouncedSearch);
            });
        }
        // v2.4 FIX 8: sort by role rank first, then alphabetically within role
        const ROLE_SORT_ORDER = {
            superadmin: 0, boss: 1, moderator: 2, hr: 3, foreman: 4,
            brigadier: 5, worker: 6, employee: 7, driver: 8,
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
    }, [localUsers, debouncedSearch, statusFilter]);

    const runUserAction = async (user, action) => {
        if (action === 'ban') {
            setBanTarget(user);
            setBanReason('');
            return;
        }
        const isRestore = action === 'restore';
        const ok = await confirm(
            isRestore
                ? `Восстановить пользователя ${displayFio(user)}?`
                : `Снять блокировку с пользователя ${displayFio(user)}?`,
            { title: isRestore ? 'Восстановление' : 'Снятие блокировки', confirmText: isRestore ? 'Восстановить' : 'Разблокировать' },
        );
        if (!ok) return;
        setActionLoading(true);
        try {
            if (isRestore) await axios.post(`/api/users/${user.user_id}/restore`);
            else await axios.delete(`/api/users/${user.user_id}/ban`);
            toast.success(isRestore ? 'Пользователь восстановлен' : 'Блокировка снята');
            onReload?.();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Не удалось выполнить действие');
        } finally {
            setActionLoading(false);
        }
    };

    const submitBan = async () => {
        if (!banTarget) return;
        setActionLoading(true);
        try {
            await axios.post(`/api/users/${banTarget.user_id}/ban`, { reason: banReason });
            toast.success('Пользователь заблокирован');
            setBanTarget(null);
            onReload?.();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Не удалось заблокировать пользователя');
        } finally {
            setActionLoading(false);
        }
    };

    const copyId = async (user) => {
        try {
            await navigator.clipboard.writeText(String(user.user_id));
            toast.success('ID скопирован');
        } catch { toast.error('Не удалось скопировать ID'); }
    };

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

                <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
                    {[
                        ['active', 'Активные'], ['banned', 'Заблокированные'],
                        ['deleted', 'Удалённые'], ['all', 'Все'],
                    ].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setStatusFilter(key)}
                            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${statusFilter === key ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
                            {label} <span className="ml-1 opacity-60">{counts[key]}</span>
                        </button>
                    ))}
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
                                        <th className="px-3 py-2.5 font-bold w-36 text-right">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                                    {filtered.map((u) => (
                                        <UserRow
                                            key={u.user_id}
                                            user={u}
                                            availableRoles={availableRoles}
                                            canChangeRole={canChangeRoles}
                                            onRoleChange={(newRole) => handleRoleChange(u, newRole)}
                                            onRowClick={() => onProfileOpen?.(u.user_id)}
                                            canManage={canManageUsers}
                                            onAction={(action) => runUserAction(u, action)}
                                            onCopy={() => copyId(u)}
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
                                    canChangeRole={canChangeRoles}
                                    onRoleChange={(newRole) => handleRoleChange(u, newRole)}
                                    onOpen={() => onProfileOpen?.(u.user_id)}
                                    canManage={canManageUsers}
                                    onAction={(action) => runUserAction(u, action)}
                                    onCopy={() => copyId(u)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </GlassCard>
            <AnimatePresence>
                {banTarget && (
                    <motion.div className="fixed inset-0 z-[120] bg-black/60 p-4 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !actionLoading && setBanTarget(null)}>
                        <motion.div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-2xl" initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }} onClick={(event) => event.stopPropagation()}>
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white">Заблокировать пользователя</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{displayFio(banTarget)}</p>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mt-5 mb-2">Причина блокировки</label>
                            <textarea value={banReason} onChange={(event) => setBanReason(event.target.value)} rows={3} autoFocus placeholder="Например: нарушение правил доступа" className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 p-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-red-500 resize-none" />
                            <div className="grid grid-cols-2 gap-2 mt-4">
                                <button type="button" onClick={() => setBanTarget(null)} disabled={actionLoading} className="h-11 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200">Отмена</button>
                                <button type="button" onClick={submitBan} disabled={actionLoading} className="h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50">Заблокировать</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {ConfirmUI}
        </>
    );
}

/* ───── Desktop row ───── */
function UserRow({ user, availableRoles, canChangeRole, onRoleChange, onRowClick, canManage, onAction, onCopy }) {
    const fio = displayFio(user);

    return (
        <MotionRow
            onClick={onRowClick}
            whileTap={prefersReducedMotion ? {} : { scale: 0.995 }}
            className={`cursor-pointer transition-colors ${user.is_blacklisted ? 'bg-red-50/70 dark:bg-red-950/15 hover:bg-red-100/70' : user.is_deleted ? 'bg-gray-100/70 dark:bg-gray-900/40 opacity-75' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40'}`}
        >
            <td className="px-3 py-3">
                <Avatar url={user.avatar_url} fio={fio} size={32} />
            </td>
            <td className="px-3 py-3 font-bold text-gray-900 dark:text-gray-100 truncate">
                <UserName user={user} fallback="—" />
                {user.is_blacklisted === 1 && (
                    <span className="ml-2 text-[9px] font-extrabold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">BAN</span>
                )}
                {user.is_deleted === 1 && (
                    <span className="ml-2 text-[9px] font-extrabold text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">УДАЛЁН</span>
                )}
                {user.is_blacklisted === 1 && user.ban_reason && <p className="text-[10px] text-red-500 font-medium mt-1 truncate max-w-xs">{user.ban_reason}</p>}
            </td>
            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <RoleDropdown user={user} availableRoles={availableRoles} canChange={canChangeRole} onChange={onRoleChange} />
            </td>
            <td className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400 truncate">
                {user.specialty || <span className="text-gray-300 dark:text-gray-600">—</span>}
            </td>
            <td className="px-3 py-3">
                <PlatformPills platforms={user.platforms} />
            </td>
            <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                <UserActions user={user} canManage={canManage} onAction={onAction} onCopy={onCopy} />
            </td>
        </MotionRow>
    );
}

/* ───── Mobile card ───── */
function UserCard({ user, availableRoles, canChangeRole, onRoleChange, onOpen, canManage, onAction, onCopy }) {
    return (
        <MotionCard
            whileTap={prefersReducedMotion ? {} : { scale: 0.99 }}
            className={`rounded-xl border p-3.5 flex items-start gap-3 ${user.is_blacklisted ? 'border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/15' : user.is_deleted ? 'border-gray-200 dark:border-gray-700 bg-gray-100/70 dark:bg-gray-900/40 opacity-80' : 'border-gray-100 dark:border-gray-800 bg-white/60 dark:bg-gray-800/40'}`}
        >
            <button type="button" onClick={onOpen} className="flex-shrink-0">
                <Avatar url={user.avatar_url} fio={displayFio(user)} size={40} />
            </button>
            <div className="min-w-0 flex-1">
                <button type="button" onClick={onOpen} className="block text-left w-full">
                    <div className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">
                        <UserName user={user} fallback="—" />
                        {user.is_blacklisted === 1 && <span className="ml-2 text-[9px] font-extrabold text-red-500">BAN</span>}
                        {user.is_deleted === 1 && <span className="ml-2 text-[9px] font-extrabold text-gray-500">УДАЛЁН</span>}
                    </div>
                    {user.is_blacklisted === 1 && user.ban_reason && <div className="text-[10px] text-red-500 mt-1 line-clamp-2">{user.ban_reason}</div>}
                    {user.specialty ? (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{user.specialty}</div>
                    ) : null}
                </button>
                <div className="flex items-center justify-between gap-2 mt-2">
                    <div onClick={(e) => e.stopPropagation()} className="min-w-0">
                        <RoleDropdown user={user} availableRoles={availableRoles} canChange={canChangeRole} onChange={onRoleChange} compact />
                    </div>
                    <PlatformPills platforms={user.platforms} />
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <UserActions user={user} canManage={canManage} onAction={onAction} onCopy={onCopy} />
                </div>
            </div>
        </MotionCard>
    );
}

/* ───── Role dropdown ───── */
function RoleDropdown({ user, availableRoles, canChange = true, onChange, compact }) {
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

    if (!canChange) {
        return (
            <span
                title="Сменить роль может руководитель или супер-администратор"
                className={`inline-flex items-center px-2.5 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wide ${colorClass}`}
            >
                <span className="truncate">{ROLE_NAMES[user.role] || user.role}</span>
            </span>
        );
    }

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
                    <MotionList
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
                    </MotionList>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ───── Platform pills ───── */
function PlatformPills({ platforms }) {
    const list = platforms || [];
    return (
        <div className="flex items-center gap-1.5">
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

function UserActions({ user, canManage, onAction, onCopy }) {
    return (
        <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={onCopy} title="Скопировать ID" className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-700 text-gray-500 hover:text-blue-600">
                <Copy className="w-4 h-4" />
            </button>
            {canManage && user.is_deleted === 1 && (
                <button type="button" onClick={() => onAction('restore')} title="Восстановить" className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600">
                    <RotateCcw className="w-4 h-4" />
                </button>
            )}
            {canManage && user.is_blacklisted === 1 && (
                <button type="button" onClick={() => onAction('unban')} title="Снять блокировку" className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600">
                    <ShieldOff className="w-4 h-4" />
                </button>
            )}
            {canManage && !user.is_blacklisted && !user.is_deleted && (
                <button type="button" onClick={() => onAction('ban')} title="Заблокировать" className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-600">
                    <Ban className="w-4 h-4" />
                </button>
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

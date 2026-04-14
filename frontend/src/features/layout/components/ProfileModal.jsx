import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    User, X, Camera, Trash2, Unplug, ShieldCheck,
    Send, Smartphone, MessageCircle, Bell, UserPlus, ClipboardList, FileText, AlertTriangle, RefreshCw, LogOut
} from 'lucide-react';
import useConfirm from '../../../hooks/useConfirm';
import { clearAuthData } from '../../../utils/tokenStorage';

import { ROLE_NAMES as roleNames } from '../../../utils/roleConfig';
import { motion } from 'framer-motion';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function ProfileModal({ profileData, setProfileData, editProfile, setEditProfile, setProfileModalOpen, canEditUsers, isMyProfile }) {
    const tgId = localStorage.getItem('tg_id');
    const [linkCode, setLinkCode] = useState('');
    const [showLinkSearch, setShowLinkSearch] = useState(false);
    const [linkSearchQuery, setLinkSearchQuery] = useState('');
    const [linkCandidates, setLinkCandidates] = useState([]);
    const [linkingInProgress, setLinkingInProgress] = useState(false);
    const { confirm, ConfirmUI } = useConfirm();

    const handleToggleNotify = (platform) => {
        setEditProfile(prev => {
            const newVal = !prev[platform];
            if (!newVal && ((platform === 'notify_tg' && !prev.notify_max) || (platform === 'notify_max' && !prev.notify_tg))) {
                toast.error("Хотя бы один мессенджер должен быть включен!");
                return prev;
            }
            return { ...prev, [platform]: newVal };
        });
    };

    const handleAvatarUpload = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            const fd = new FormData(); fd.append('avatar_base64', reader.result); fd.append('tg_id', tgId);
            try {
                const res = await axios.post(`/api/users/${profileData.user_id}/update_avatar`, fd);
                setProfileData({...profileData, avatar_url: res.data.avatar_url});
            } catch(e) { toast.error("Ошибка загрузки"); }
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async () => {
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('fio', editProfile.fio);
            fd.append('role', editProfile.role);
            fd.append('team_id', editProfile.team_id);
            fd.append('position', editProfile.position);
            fd.append('max_invite_link', editProfile.max_invite_link || '');
            fd.append('notify_tg', editProfile.notify_tg ? 1 : 0);
            fd.append('notify_max', editProfile.notify_max ? 1 : 0);
            fd.append('notify_new_users', editProfile.notify_new_users ? 1 : 0);
            fd.append('notify_orders', editProfile.notify_orders ? 1 : 0);
            fd.append('notify_reports', editProfile.notify_reports ? 1 : 0);
            fd.append('notify_errors', editProfile.notify_errors ? 1 : 0);
            fd.append('notify_exchange', editProfile.notify_exchange ? 1 : 0);

            await axios.post(`/api/users/${profileData.user_id}/update_profile`, fd);
            toast.success("Успешно!"); setProfileModalOpen(false); window.location.reload();
        } catch (e) { toast.error("Ошибка сохранения"); }
    };

    const handleDeleteUser = async () => {
        const ok = await confirm(`Вы уверены, что хотите полностью удалить пользователя ${profileData.fio}? Это действие нельзя отменить.`, { title: "Удаление пользователя", confirmText: "Удалить" });
        if (!ok) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            await axios.post(`/api/users/${profileData.user_id}/delete`, fd);
            toast.success("Пользователь успешно удален из системы.");
            setProfileModalOpen(false);
            window.location.reload();
        } catch (e) { toast.error("Ошибка удаления пользователя"); }
    };

    const handleLinkAccount = async () => {
        if (!linkCode) return;
        try {
            const res = await axios.post('/api/users/link-account', {
                current_user_id: profileData.user_id,
                link_code: linkCode
            });

            if (res.data.success) {
                localStorage.setItem('tg_id', String(res.data.primary_user_id));
                toast.success("Аккаунты успешно связаны!");

                if (res.data.role_conflict) {
                    toast('Обнаружен конфликт ролей. Модераторы уведомлены.', { icon: '⚠️', duration: 5000 });
                }

                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (e) {
            toast.error(e.response?.data?.detail || "Ошибка привязки. Проверьте правильность кода.");
        }
    };

    const handleUnlinkPlatform = async (platform) => {
        const platformName = platform === 'max' ? 'MAX' : 'Telegram';
        const ok = await confirm(`Вы уверены, что хотите отвязать мессенджер ${platformName}?`, { title: "Отвязка мессенджера", variant: "warning", confirmText: "Отвязать" });
        if (!ok) return;
        try {
            const fd = new FormData();
            fd.append('tg_id', tgId);
            fd.append('platform', platform);
            await axios.post('/api/users/unlink_platform', fd);
            toast.success(`Мессенджер ${platformName} успешно отвязан.`);
            window.location.reload();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Ошибка при отвязке.");
        }
    };

    const handleAdminLink = async (targetUserId) => {
        const ok = await confirm(
            `Связать аккаунт ${profileData.fio} с выбранным пользователем? Аккаунты будут объединены.`,
            { title: "Связывание аккаунтов", confirmText: "Связать", variant: "warning" }
        );
        if (!ok) return;

        setLinkingInProgress(true);
        try {
            const res = await axios.post('/api/users/admin-link', {
                admin_id: parseInt(tgId),
                user_id_1: profileData.user_id,
                user_id_2: targetUserId
            });

            if (res.data.success) {
                toast.success("Аккаунты успешно связаны!");
                if (res.data.role_conflict) {
                    toast('Конфликт ролей — выберите роль в уведомлении бота.', { icon: '⚠️', duration: 5000 });
                }
                setTimeout(() => { setProfileModalOpen(false); window.location.reload(); }, 1000);
            }
        } catch (e) {
            toast.error(e.response?.data?.detail || "Ошибка связывания аккаунтов");
        }
        setLinkingInProgress(false);
    };

    const searchLinkCandidates = async (query) => {
        setLinkSearchQuery(query);
        if (!query.trim() || query.length < 2) { setLinkCandidates([]); return; }
        try {
            const res = await axios.get('/api/users');
            const currentPlatform = profileData.user_id > 0 ? 'TG' : 'MAX';
            const candidates = (res.data || []).filter(u => {
                const otherPlatform = u.user_id > 0 ? 'TG' : 'MAX';
                return otherPlatform !== currentPlatform
                    && !u.linked_user_id
                    && u.role !== 'linked'
                    && (u.fio?.toLowerCase().includes(query.toLowerCase()) || String(u.user_id).includes(query));
            });
            setLinkCandidates(candidates.slice(0, 10));
        } catch { setLinkCandidates([]); }
    };

    return (
        <><motion.div
            className="fixed inset-0 w-full h-[100dvh] z-[100] bg-black/60 overflow-y-auto backdrop-blur-sm"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
        >
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <motion.div
                    className="bg-white dark:bg-gray-800 rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden transition-colors border border-gray-100 dark:border-gray-700"
                    initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                >

                    <div className="bg-gradient-to-br from-blue-600 to-indigo-800 dark:from-gray-800 dark:to-gray-900 px-6 py-10 text-white relative">
                        <button onClick={() => setProfileModalOpen(false)} className="absolute top-5 right-5 text-white/70 hover:text-white transition-colors bg-black/20 hover:bg-black/40 rounded-full p-2 backdrop-blur-sm active:scale-95">
                            <X className="w-6 h-6" />
                        </button>
                        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-5 sm:space-y-0 sm:space-x-6 relative z-10">
                            <label className="relative group cursor-pointer block">
                                <div className="w-28 h-28 rounded-3xl border-4 border-white/20 dark:border-gray-700 shadow-xl bg-gray-200 dark:bg-gray-800 bg-cover bg-center overflow-hidden transition-transform group-hover:scale-105" style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}>
                                    {!profileData.avatar_url && <User className="w-16 h-16 text-gray-400 dark:text-gray-600 m-auto mt-5" />}
                                </div>
                                {(!profileData.unregistered) && (
                                    <>
                                        <div className="absolute inset-0 bg-black/50 rounded-3xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Camera className="w-6 h-6 text-white mb-1" />
                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Фото</span>
                                        </div>
                                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                    </>
                                )}
                            </label>
                            <div className="text-center sm:text-left pt-2">
                                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">{profileData.fio}</h3>
                                <p className="text-blue-200 dark:text-gray-400 uppercase tracking-widest text-xs font-bold mt-2 bg-black/20 dark:bg-black/40 inline-block px-3 py-1 rounded-lg backdrop-blur-sm">{roleNames[profileData.role] || profileData.role}</p>
                            </div>
                        </div>
                    </div>

                    {profileData.unregistered ? (
                        <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 border-dashed mt-6 mx-6 mb-6">
                            <Unplug className="w-12 h-12 text-gray-400 mx-auto mb-4 opacity-50" />
                            <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Аккаунт не привязан</h4>
                            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">Этот сотрудник был добавлен в систему, но еще ни разу не авторизовался и не привязал свой мессенджер.</p>
                        </div>
                    ) : (
                        <div className="p-6 sm:p-8 space-y-8">
                            {/* КОНТАКТЫ ПОЛЬЗОВАТЕЛЯ */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className={`flex items-start p-4 rounded-2xl border transition-all ${profileData.links.has_tg ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50 hover:border-blue-300' : 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700 shadow-sm'}`}>
                                    <Send className={`w-6 h-6 mr-3 mt-0.5 ${profileData.links.has_tg ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <div className="w-full">
                                        <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-1">Telegram</p>
                                        {profileData.links.has_tg ? (
                                            <a href={`tg://user?id=${profileData.links.tg_account_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">Написать в ЛС</a>
                                        ) : (
                                            <p className="text-sm font-bold text-gray-400 dark:text-gray-500">Не привязан</p>
                                        )}
                                    </div>
                                </div>

                                <div className={`flex items-start p-4 rounded-2xl border transition-all ${profileData.links.has_max ? 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800/50 hover:border-indigo-300' : 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700 shadow-sm'}`}>
                                    <Smartphone className={`w-6 h-6 mr-3 mt-0.5 ${profileData.links.has_max ? 'text-indigo-500' : 'text-gray-400'}`} />
                                    <div className="w-full">
                                        <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-1">MAX</p>
                                        {profileData.links.has_max ? (
                                            <>
                                                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">ID: {profileData.links.max_account_id}</p>
                                                {profileData.max_invite_link ? (
                                                    <a href={profileData.max_invite_link} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> Чат</a>
                                                ) : (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Ссылка не привязана</p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-sm font-bold text-gray-400 dark:text-gray-500">Не привязан</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* УПРАВЛЕНИЕ ПРОФИЛЕМ */}
                            {(canEditUsers || isMyProfile) && (
                                <div className="space-y-5 bg-gray-50/50 dark:bg-gray-700/20 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm"><User className="w-4 h-4 text-gray-400" /> Данные профиля</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">ФИО</label>
                                            <input type="text" value={editProfile.fio} onChange={e => setEditProfile({...editProfile, fio: e.target.value})} disabled={!canEditUsers} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none font-medium disabled:opacity-70 focus:ring-2 focus:ring-blue-500 dark:text-white shadow-sm transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Специальность</label>
                                            <input type="text" value={editProfile.position} onChange={e => setEditProfile({...editProfile, position: e.target.value})} disabled={!canEditUsers} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none font-medium disabled:opacity-70 focus:ring-2 focus:ring-blue-500 dark:text-white shadow-sm transition-colors" />
                                        </div>

                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Ссылка-приглашение MAX (Для диалога)</label>
                                            <input type="text" placeholder="Например: https://max.ru/invite/..." value={editProfile.max_invite_link} onChange={e => setEditProfile({...editProfile, max_invite_link: e.target.value})} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500 transition-colors" />
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 font-medium">* Добавьте сюда вашу прямую ссылку, чтобы коллеги могли написать вам в мессенджер MAX.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* НАСТРОЙКИ УВЕДОМЛЕНИЙ */}
                            {(isMyProfile || canEditUsers) && (
                                <div className="space-y-4 bg-gray-50/50 dark:bg-gray-700/20 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/50 mt-4">
                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
                                        <span className="text-xl">🔔</span> Уведомления в ЛС
                                    </h4>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Send className="w-4 h-4 text-blue-500" /> В Telegram</span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" checked={editProfile.notify_tg} onChange={() => handleToggleNotify('notify_tg')} className="sr-only peer" />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Smartphone className="w-4 h-4 text-indigo-500" /> В MAX</span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" checked={editProfile.notify_max} onChange={() => handleToggleNotify('notify_max')} className="sr-only peer" />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                            </label>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">* Выберите, куда бот будет присылать вам наряды в личные сообщения.</p>

                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm mt-5 pt-4 border-t border-gray-200 dark:border-gray-600">
                                        <Bell className="w-4 h-4 text-gray-400" /> Категории уведомлений
                                    </h4>
                                    <div className="flex flex-col gap-3">
                                        {[
                                            { key: 'notify_new_users', label: 'Новые пользователи', icon: UserPlus, color: 'text-emerald-500' },
                                            { key: 'notify_orders', label: 'Наряды', icon: ClipboardList, color: 'text-blue-500' },
                                            { key: 'notify_reports', label: 'Отчеты СМР', icon: FileText, color: 'text-violet-500' },
                                            { key: 'notify_errors', label: 'Системные ошибки', icon: AlertTriangle, color: 'text-red-500' },
                                            { key: 'notify_exchange', label: 'Уведомления об обменах техники', icon: RefreshCw, color: 'text-cyan-500' },
                                        ].map(({ key, label, icon: Ico, color }) => (
                                            <div key={key} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Ico className={`w-4 h-4 ${color}`} /> {label}</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" checked={editProfile[key]} onChange={() => setEditProfile(prev => ({ ...prev, [key]: !prev[key] }))} className="sr-only peer" />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">* Отключите категории, уведомления по которым вам не нужны.</p>
                                </div>
                            )}

                            {/* ПРИВЯЗКА УСТРОЙСТВ */}
                            {isMyProfile && profileData.links && (
                                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                                    <h4 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2 text-sm mb-4"><ShieldCheck className="w-4 h-4 text-indigo-500" /> Привязка мессенджеров</h4>

                                    {!profileData.links.has_max && (
                                        <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            <span className="font-bold text-indigo-600 dark:text-indigo-400">MAX:</span> Для привязки отправьте <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono font-bold border border-gray-200 dark:border-gray-600">/web</code> в MAX боте и введите код ниже.
                                        </div>
                                    )}

                                    {!profileData.links.has_tg && (
                                        <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            <span className="font-bold text-blue-600 dark:text-blue-400">Telegram:</span> Для привязки отправьте <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono font-bold border border-gray-200 dark:border-gray-600">/web</code> в <a href="https://t.me/viksstroy_bot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-bold">Telegram боте</a> и введите код ниже.
                                        </div>
                                    )}

                                    {(!profileData.links.has_max || !profileData.links.has_tg) && (
                                        <div className="flex gap-2 mb-2">
                                            <input type="text" maxLength={6} value={linkCode} onChange={e => setLinkCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="w-full px-4 py-3.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl outline-none font-mono tracking-[0.3em] text-center shadow-inner focus:ring-2 focus:ring-indigo-500 transition-colors" />
                                            <button onClick={handleLinkAccount} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 whitespace-nowrap">Привязать</button>
                                        </div>
                                    )}

                                    {profileData.links.is_linked && (
                                        <div className="mt-5">
                                            <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 mb-2 uppercase tracking-wider">Привязанные устройства:</p>
                                            <div className="flex flex-col gap-2">
                                                {profileData.links.has_max && (
                                                    <div className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Smartphone className="w-4 h-4 text-indigo-500" /> MAX</span>
                                                        <button onClick={() => handleUnlinkPlatform('max')} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-red-100 dark:border-red-800/50 active:scale-95">Отвязать</button>
                                                    </div>
                                                )}
                                                {profileData.links.has_tg && (
                                                    <div className="flex justify-between items-center bg-white dark:bg-gray-800 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Send className="w-4 h-4 text-blue-500" /> Telegram</span>
                                                        <button onClick={() => handleUnlinkPlatform('tg')} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-red-100 dark:border-red-800/50 active:scale-95">Отвязать</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ПРИНУДИТЕЛЬНАЯ СВЯЗКА (только для модераторов, при просмотре ЧУЖОГО профиля) */}
                            {canEditUsers && !isMyProfile && !profileData.links?.is_linked && (
                                <div className="bg-amber-50/50 dark:bg-amber-900/10 p-5 rounded-2xl border border-amber-100 dark:border-amber-800/30">
                                    <h4 className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 text-sm mb-3">
                                        <UserPlus className="w-4 h-4 text-amber-500" /> Связать с аккаунтом другой платформы
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                        Найдите пользователя на {profileData.user_id > 0 ? 'MAX' : 'Telegram'} для объединения аккаунтов.
                                    </p>

                                    {!showLinkSearch ? (
                                        <button onClick={() => setShowLinkSearch(true)}
                                            className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 font-bold py-3 rounded-xl text-sm transition-all active:scale-95 border border-amber-200 dark:border-amber-700">
                                            Найти и связать аккаунт
                                        </button>
                                    ) : (
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                value={linkSearchQuery}
                                                onChange={(e) => searchLinkCandidates(e.target.value)}
                                                placeholder="Поиск по ФИО или ID..."
                                                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl outline-none text-sm focus:ring-2 focus:ring-amber-500"
                                                autoFocus
                                            />
                                            {linkCandidates.length > 0 && (
                                                <div className="max-h-48 overflow-y-auto space-y-1">
                                                    {linkCandidates.map(c => (
                                                        <button key={c.user_id} onClick={() => handleAdminLink(c.user_id)}
                                                            disabled={linkingInProgress}
                                                            className="w-full flex items-center justify-between p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-amber-400 dark:hover:border-amber-600 transition-all text-left disabled:opacity-50">
                                                            <div>
                                                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{c.fio}</span>
                                                                <span className="text-[10px] text-gray-400 ml-2 font-mono">ID: {c.user_id}</span>
                                                            </div>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.user_id > 0 ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' : 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400'}`}>
                                                                {c.user_id > 0 ? 'Telegram' : 'MAX'}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {linkSearchQuery.length >= 2 && linkCandidates.length === 0 && (
                                                <p className="text-xs text-gray-400 text-center py-2">Не найдено подходящих аккаунтов</p>
                                            )}
                                            <button onClick={() => { setShowLinkSearch(false); setLinkSearchQuery(''); setLinkCandidates([]); }}
                                                className="w-full text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 py-2 font-bold">
                                                Отмена
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* КНОПКИ СОХРАНЕНИЯ */}
                            {(canEditUsers || isMyProfile) && (
                                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                                    {canEditUsers && !isMyProfile && (
                                        <button onClick={handleDeleteUser} className="w-full sm:w-1/3 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 font-bold py-3.5 rounded-xl transition-all shadow-sm active:scale-95 flex justify-center items-center gap-2 border border-red-200 dark:border-red-800/50">
                                            <Trash2 className="w-4 h-4" /> Удалить
                                        </button>
                                    )}
                                    <button onClick={handleSaveProfile} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98] flex justify-center items-center">
                                        Сохранить изменения
                                    </button>
                                </div>
                            )}

                            {/* Logout — only on own profile */}
                            {isMyProfile && (
                                <button
                                    onClick={async () => {
                                        await clearAuthData();
                                        document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                                        window.location.href = '/';
                                    }}
                                    className="w-full mt-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
                                >
                                    <LogOut className="w-4 h-4" /> Выйти из аккаунта
                                </button>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </motion.div>{ConfirmUI}</>
    );
}

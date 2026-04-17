import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
    User, X, Camera, Trash2, Unplug, ShieldCheck,
    Send, Smartphone, MessageCircle, Bell, UserPlus, LogOut, ChevronRight
} from 'lucide-react';
import useConfirm from '../../../hooks/useConfirm';
import useEnterToSubmit from '../../../hooks/useEnterToSubmit';
import { logoutAndRedirect } from '../../../utils/tokenStorage';
import { unsubscribeFromPush } from '../../../utils/pushSubscription';
import { displayFio } from '../../../utils/fioFormat';
import { ROLE_NAMES as roleNames } from '../../../utils/roleConfig';
import { motion } from 'framer-motion';
import ModalPortal from '../../../components/ui/ModalPortal';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * ProfileModal — Stage 2 refactor.
 *
 * 3 separate FIO fields, specialty + max_invite_link, notification toggles
 * removed in favor of a link row → /settings. Uses PATCH /api/users/{id}
 * to send only a diff of changed fields.
 */
export default function ProfileModal({ profileData, setProfileData, editProfile, setEditProfile, setProfileModalOpen, canEditUsers, isMyProfile }) {
    const navigate = useNavigate();
    const tgId = localStorage.getItem('tg_id');
    const [linkCode, setLinkCode] = useState('');
    const [showLinkSearch, setShowLinkSearch] = useState(false);
    const [linkSearchQuery, setLinkSearchQuery] = useState('');
    const [linkCandidates, setLinkCandidates] = useState([]);
    const [linkingInProgress, setLinkingInProgress] = useState(false);
    const [saving, setSaving] = useState(false);
    const { confirm, ConfirmUI } = useConfirm();
    useEnterToSubmit(!profileData.unregistered && (canEditUsers || isMyProfile), () => handleSave());

    // Baseline for dirty-diff on save — captured once per opened profile
    const [initial, setInitial] = useState(() => ({
        last_name: profileData.last_name || '',
        first_name: profileData.first_name || '',
        middle_name: profileData.middle_name || '',
        specialty: profileData.specialty || editProfile?.specialty || '',
        max_invite_link: profileData.max_invite_link || editProfile?.max_invite_link || '',
    }));

    // Local editable state (separate from editProfile which carries platform notify keys)
    const [lastName, setLastName] = useState(initial.last_name);
    const [firstName, setFirstName] = useState(initial.first_name);
    const [middleName, setMiddleName] = useState(initial.middle_name);
    const [specialty, setSpecialty] = useState(initial.specialty);
    const [maxInviteLink, setMaxInviteLink] = useState(initial.max_invite_link);

    // When profile changes (e.g. admin opens a different user), reset baseline
    useEffect(() => {
        const baseline = {
            last_name: profileData.last_name || '',
            first_name: profileData.first_name || '',
            middle_name: profileData.middle_name || '',
            specialty: profileData.specialty || '',
            max_invite_link: profileData.max_invite_link || editProfile?.max_invite_link || '',
        };
        setInitial(baseline);
        setLastName(baseline.last_name);
        setFirstName(baseline.first_name);
        setMiddleName(baseline.middle_name);
        setSpecialty(baseline.specialty);
        setMaxInviteLink(baseline.max_invite_link);
    }, [profileData.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

    const fullFio = useMemo(
        () => displayFio({ last_name: lastName, first_name: firstName, middle_name: middleName, fio: profileData.fio }),
        [lastName, firstName, middleName, profileData.fio],
    );

    const handleAvatarUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            const fd = new FormData();
            fd.append('avatar_base64', reader.result);
            try {
                const res = await axios.post(`/api/users/${profileData.user_id}/update_avatar`, fd);
                setProfileData({ ...profileData, avatar_url: res.data.avatar_url });
            } catch (err) { toast.error('Ошибка загрузки'); }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const payload = {};
            if (lastName !== initial.last_name) payload.last_name = lastName.trim();
            if (firstName !== initial.first_name) payload.first_name = firstName.trim();
            if (middleName !== initial.middle_name) payload.middle_name = middleName.trim();
            if (specialty !== initial.specialty) payload.specialty = specialty.trim();
            if (maxInviteLink !== initial.max_invite_link) payload.max_invite_link = maxInviteLink.trim();

            if (Object.keys(payload).length === 0) {
                setProfileModalOpen(false);
                return;
            }

            const res = await axios.patch(`/api/users/${profileData.user_id}`, payload);
            const updated = res.data?.user || {};
            setProfileData({ ...profileData, ...updated });
            toast.success('Сохранено');
            setProfileModalOpen(false);
            // Small delay so the toast is visible before reload refreshes user lists
            setTimeout(() => window.location.reload(), 300);
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async () => {
        const ok = await confirm(
            `Вы уверены, что хотите полностью удалить пользователя ${fullFio}? Это действие нельзя отменить.`,
            { title: 'Удаление пользователя', confirmText: 'Удалить' },
        );
        if (!ok) return;
        try {
            await axios.post(`/api/users/${profileData.user_id}/delete`);
            toast.success('Пользователь успешно удален из системы.');
            setProfileModalOpen(false);
            window.location.reload();
        } catch (err) { toast.error('Ошибка удаления пользователя'); }
    };

    const handleLinkAccount = async () => {
        if (!linkCode) return;
        try {
            const res = await axios.post('/api/users/link-account', { link_code: linkCode });
            if (res.data.success) {
                localStorage.setItem('tg_id', String(res.data.primary_user_id));
                toast.success('Аккаунты успешно связаны!');
                if (res.data.role_conflict) {
                    toast('Обнаружен конфликт ролей. Модераторы уведомлены.', { icon: '⚠️', duration: 5000 });
                }
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка привязки. Проверьте правильность кода.');
        }
    };

    const handleUnlinkPlatform = async (platform) => {
        const platformName = platform === 'max' ? 'MAX' : 'Telegram';
        const ok = await confirm(`Вы уверены, что хотите отвязать мессенджер ${platformName}?`, {
            title: 'Отвязка мессенджера', variant: 'warning', confirmText: 'Отвязать',
        });
        if (!ok) return;
        try {
            const fd = new FormData();
            fd.append('platform', platform);
            await axios.post('/api/users/unlink_platform', fd);
            toast.success(`Мессенджер ${platformName} успешно отвязан.`);
            window.location.reload();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка при отвязке.');
        }
    };

    const handleAdminLink = async (targetUserId) => {
        const ok = await confirm(
            `Связать аккаунт ${fullFio} с выбранным пользователем? Аккаунты будут объединены.`,
            { title: 'Связывание аккаунтов', confirmText: 'Связать', variant: 'warning' },
        );
        if (!ok) return;

        setLinkingInProgress(true);
        try {
            const res = await axios.post('/api/users/admin-link', {
                user_id_1: profileData.user_id,
                user_id_2: targetUserId,
            });
            if (res.data.success) {
                toast.success('Аккаунты успешно связаны!');
                if (res.data.role_conflict) {
                    toast('Конфликт ролей — выберите роль в уведомлении бота.', { icon: '⚠️', duration: 5000 });
                }
                setTimeout(() => { setProfileModalOpen(false); window.location.reload(); }, 1000);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка связывания аккаунтов');
        }
        setLinkingInProgress(false);
    };

    const searchLinkCandidates = async (query) => {
        setLinkSearchQuery(query);
        if (!query.trim() || query.length < 2) { setLinkCandidates([]); return; }
        try {
            const res = await axios.get('/api/users');
            const currentPlatform = profileData.user_id > 0 ? 'TG' : 'MAX';
            const candidates = (res.data || []).filter((u) => {
                const otherPlatform = u.user_id > 0 ? 'TG' : 'MAX';
                const fio = displayFio(u) || '';
                return otherPlatform !== currentPlatform
                    && !u.linked_user_id
                    && u.role !== 'linked'
                    && (fio.toLowerCase().includes(query.toLowerCase()) || String(u.user_id).includes(query));
            });
            setLinkCandidates(candidates.slice(0, 10));
        } catch { setLinkCandidates([]); }
    };

    const goToSettings = () => {
        setProfileModalOpen(false);
        navigate('/settings');
    };

    return (
        <ModalPortal>
        <>
            <motion.div
                className="fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/60 overflow-y-auto backdrop-blur-sm"
                style={{ top: 0, left: 0, right: 0, bottom: 0 }}
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
                        {/* Header */}
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-800 dark:from-gray-800 dark:to-gray-900 px-6 py-8 text-white relative">
                            <button
                                onClick={() => setProfileModalOpen(false)}
                                className="absolute top-5 right-5 text-white/70 hover:text-white transition-colors bg-black/20 hover:bg-black/40 rounded-full p-2 backdrop-blur-sm active:scale-95"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 relative z-10">
                                <label className="relative group cursor-pointer block">
                                    <div
                                        className="w-20 h-20 rounded-full border-4 border-white/20 dark:border-gray-700 shadow-xl bg-gray-200 dark:bg-gray-800 bg-cover bg-center overflow-hidden transition-transform group-hover:scale-105"
                                        style={{ backgroundImage: profileData.avatar_url ? `url(${profileData.avatar_url})` : 'none' }}
                                    >
                                        {!profileData.avatar_url && <User className="w-10 h-10 text-gray-400 dark:text-gray-600 m-auto mt-5" />}
                                    </div>
                                    {isMyProfile && !profileData.unregistered && (
                                        <>
                                            <div className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Camera className="w-5 h-5 text-white" />
                                            </div>
                                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                        </>
                                    )}
                                </label>
                                <div className="text-center sm:text-left pt-1">
                                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight">{fullFio || profileData.fio}</h3>
                                    <p className="text-blue-200 dark:text-gray-400 uppercase tracking-widest text-[11px] font-bold mt-2 bg-black/20 dark:bg-black/40 inline-block px-3 py-1 rounded-lg backdrop-blur-sm">
                                        {roleNames[profileData.role] || profileData.role}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {profileData.unregistered ? (
                            <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 border-dashed mt-6 mx-6 mb-6">
                                <Unplug className="w-12 h-12 text-gray-400 mx-auto mb-4 opacity-50" />
                                <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Аккаунт не привязан</h4>
                                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                                    Этот сотрудник был добавлен в систему, но еще ни разу не авторизовался и не привязал свой мессенджер.
                                </p>
                            </div>
                        ) : (
                            <div className="p-6 sm:p-8 space-y-6">
                                {/* Platforms card */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className={`flex items-start p-3.5 rounded-2xl border transition-all ${profileData.links?.has_tg ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50' : 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700'}`}>
                                        <Send className={`w-5 h-5 mr-3 mt-0.5 ${profileData.links?.has_tg ? 'text-blue-500' : 'text-gray-400'}`} />
                                        <div className="w-full">
                                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-1">Telegram</p>
                                            {profileData.links?.has_tg ? (
                                                <a href={`tg://user?id=${profileData.links.tg_account_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">Написать в ЛС</a>
                                            ) : (
                                                <p className="text-sm font-bold text-gray-400 dark:text-gray-500">Не привязан</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className={`flex items-start p-3.5 rounded-2xl border transition-all ${profileData.links?.has_max ? 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800/50' : 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700'}`}>
                                        <Smartphone className={`w-5 h-5 mr-3 mt-0.5 ${profileData.links?.has_max ? 'text-indigo-500' : 'text-gray-400'}`} />
                                        <div className="w-full">
                                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-1">MAX</p>
                                            {profileData.links?.has_max ? (
                                                <>
                                                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">ID: {profileData.links.max_account_id}</p>
                                                    {maxInviteLink ? (
                                                        <a href={maxInviteLink} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                                                            <MessageCircle className="w-3.5 h-3.5" /> Чат
                                                        </a>
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

                                {/* Данные профиля */}
                                {(canEditUsers || isMyProfile) && (
                                    <div className="space-y-4 bg-gray-50/50 dark:bg-gray-700/20 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                                        <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
                                            <User className="w-4 h-4 text-gray-400" /> Данные профиля
                                        </h4>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <Field label="Фамилия" value={lastName} onChange={setLastName} disabled={!canEditUsers && !isMyProfile} />
                                            <Field label="Имя" value={firstName} onChange={setFirstName} disabled={!canEditUsers && !isMyProfile} />
                                            <Field label="Отчество" placeholder="необязательно" value={middleName} onChange={setMiddleName} disabled={!canEditUsers && !isMyProfile} />
                                        </div>

                                        {(() => {
                                            // Stage v2.4 FIX 7: specialty auto-syncs from team position
                                            // for worker/driver/brigadier — read-only hint instead of edit.
                                            const autoSynced = ['worker', 'driver', 'brigadier']
                                                .includes(profileData.role);
                                            return (
                                                <Field
                                                    label="Специальность"
                                                    value={specialty}
                                                    onChange={setSpecialty}
                                                    placeholder={autoSynced ? 'Определяется должностью в бригаде' : ''}
                                                    disabled={autoSynced || (!canEditUsers && !isMyProfile)}
                                                />
                                            );
                                        })()}

                                        <div>
                                            <Field
                                                label="Ссылка-приглашение MAX (для диалога)"
                                                value={maxInviteLink}
                                                onChange={setMaxInviteLink}
                                                placeholder="Например: https://max.ru/invite/..."
                                                disabled={!isMyProfile && !canEditUsers}
                                            />
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 font-medium">
                                                * Добавьте сюда вашу прямую ссылку, чтобы коллеги могли написать вам в мессенджер MAX.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Settings link (replaces inline notification toggles) */}
                                {isMyProfile && (
                                    <button
                                        type="button"
                                        onClick={goToSettings}
                                        className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-white/60 dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors active:scale-[0.99]"
                                    >
                                        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                            <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                                        </div>
                                        <div className="min-w-0 flex-1 text-left">
                                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">Настройки уведомлений</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Включить/отключить каналы и категории</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-400" />
                                    </button>
                                )}

                                {/* Привязка устройств */}
                                {isMyProfile && profileData.links && (
                                    <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                                        <h4 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2 text-sm mb-4">
                                            <ShieldCheck className="w-4 h-4 text-indigo-500" /> Привязка мессенджеров
                                        </h4>

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
                                                <input type="text" maxLength={6} value={linkCode} onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl outline-none font-mono tracking-[0.3em] text-center shadow-inner focus:ring-2 focus:ring-indigo-500 transition-colors" />
                                                <button onClick={handleLinkAccount} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 whitespace-nowrap">Привязать</button>
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

                                {/* Admin-link form for moderators on another user's profile */}
                                {canEditUsers && !isMyProfile && !profileData.links?.is_linked && (
                                    <div className="bg-amber-50/50 dark:bg-amber-900/10 p-5 rounded-2xl border border-amber-100 dark:border-amber-800/30">
                                        <h4 className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 text-sm mb-3">
                                            <UserPlus className="w-4 h-4 text-amber-500" /> Связать с аккаунтом другой платформы
                                        </h4>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                            Найдите пользователя на {profileData.user_id > 0 ? 'MAX' : 'Telegram'} для объединения аккаунтов.
                                        </p>

                                        {!showLinkSearch ? (
                                            <button
                                                onClick={() => setShowLinkSearch(true)}
                                                className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 font-bold py-3 rounded-xl text-sm transition-all active:scale-95 border border-amber-200 dark:border-amber-700"
                                            >
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
                                                        {linkCandidates.map((c) => (
                                                            <button key={c.user_id} onClick={() => handleAdminLink(c.user_id)} disabled={linkingInProgress}
                                                                className="w-full flex items-center justify-between p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-amber-400 dark:hover:border-amber-600 transition-all text-left disabled:opacity-50">
                                                                <div>
                                                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{displayFio(c)}</span>
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

                                {/* Footer: primary action only. Destructive actions
                                    live below as subtle text links (Emil restraint:
                                    destructive is accessible, not prominent). */}
                                {(canEditUsers || isMyProfile) && (
                                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98] flex justify-center items-center gap-2 disabled:opacity-60"
                                        >
                                            {saving ? (
                                                <>
                                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                    Сохранение...
                                                </>
                                            ) : 'Сохранить'}
                                        </button>
                                    </div>
                                )}

                                {/* Destructive: delete target user (admin view only) */}
                                {canEditUsers && !isMyProfile && (
                                    <button
                                        type="button"
                                        onClick={handleDeleteUser}
                                        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/5 dark:hover:bg-red-500/10 py-2 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Удалить аккаунт
                                    </button>
                                )}

                                {/* Logout — only on own profile */}
                                {isMyProfile && (
                                    <button
                                        onClick={async () => {
                                            try { await unsubscribeFromPush(); } catch { /* silent */ }
                                            logoutAndRedirect();
                                        }}
                                        className="w-full mt-2 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                        <LogOut className="w-4 h-4" /> Выйти из аккаунта
                                    </button>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>
            </motion.div>
            {ConfirmUI}
        </>
        </ModalPortal>
    );
}

function Field({ label, value, onChange, placeholder, disabled }) {
    return (
        <label className="block">
            <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">{label}</span>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full p-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl outline-none font-medium text-sm disabled:opacity-70 focus:ring-2 focus:ring-blue-500 dark:text-white shadow-sm transition-colors"
            />
        </label>
    );
}

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    Shield, Zap, Rocket, UserCheck, CalendarDays,
    ClipboardCheck, AlertTriangle, ToggleLeft, Image as ImageIcon, Send,
    Loader2, Search,
} from 'lucide-react';
import { GlassCard, SectionHeader, ROLE_NAMES } from './UIHelpers';

const NOTIFICATION_TYPES = [
    { value: 'app_approved',       label: 'Заявка одобрена' },
    { value: 'app_rejected',       label: 'Заявка отклонена' },
    { value: 'app_new',            label: 'Новая заявка' },
    { value: 'app_edited',         label: 'Заявка отредактирована' },
    { value: 'schedule_published', label: 'Расстановка опубликована' },
    { value: 'smr_debt',           label: 'Напоминание СМР' },
    { value: 'smr_review',         label: 'СМР на проверке' },
    { value: 'exchange_request',   label: 'Запрос обмена техникой' },
    { value: 'exchange_response',  label: 'Ответ по обмену' },
    { value: 'support_new',        label: 'Новое обращение' },
];

export default function NotificationTesting({
    tgId,
    testPlatform,
    setTestPlatform,
    testNotification,
    testExtended,
    role,
    handleRoleSimulation,
}) {
    // v2.4.10 precise tester state
    const [users, setUsers] = useState([]);
    const [targetId, setTargetId] = useState('');     // '' = self
    const [userSearch, setUserSearch] = useState('');
    const [chTelegram, setChTelegram] = useState(true);
    const [chMax, setChMax] = useState(true);
    const [chPwa, setChPwa] = useState(true);
    const [notifType, setNotifType] = useState('app_approved');
    const [customMsg, setCustomMsg] = useState('Тестовое уведомление');
    const [sending, setSending] = useState(false);
    const [results, setResults] = useState([]);
    const [testingSchedule, setTestingSchedule] = useState(false);
    const [scheduleResult, setScheduleResult] = useState('');

    useEffect(() => {
        axios.get('/api/users').then(res => {
            const list = (res.data || []).filter(u => u?.user_id && u?.fio);
            setUsers(list);
        }).catch(() => {});
    }, []);

    const filteredUsers = useMemo(() => {
        const q = userSearch.trim().toLowerCase();
        if (!q) return users;
        return users.filter(u =>
            (u.fio || '').toLowerCase().includes(q)
            || String(u.user_id).includes(q)
            || (u.role || '').toLowerCase().includes(q)
        );
    }, [users, userSearch]);

    const channels = useMemo(() => {
        const out = [];
        if (chTelegram) out.push('telegram');
        if (chMax) out.push('max');
        if (chPwa) out.push('pwa');
        return out;
    }, [chTelegram, chMax, chPwa]);

    const handleTestSend = async () => {
        if (channels.length === 0) {
            toast.error('Выберите хотя бы один канал');
            return;
        }
        setSending(true);
        setResults([]);
        try {
            const res = await axios.post('/api/system/test_notification', {
                target_user_id: targetId || null,
                channels,
                notification_type: notifType,
                custom_message: customMsg,
            });
            setResults(res.data?.results || []);
            toast.success('Тест отправлен');
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Ошибка отправки');
        } finally {
            setSending(false);
        }
    };

    const handleTestSchedule = async () => {
        setTestingSchedule(true);
        setScheduleResult('');
        try {
            const res = await axios.post('/api/system/test_schedule');
            if (res.data?.status === 'ok') {
                setScheduleResult(`Расстановка на ${res.data.date} отправлена вам в Telegram`);
                toast.success('Расстановка отправлена');
            } else {
                setScheduleResult(res.data?.message || 'Не удалось отправить');
            }
        } catch (e) {
            const msg = e?.response?.data?.detail || 'Ошибка';
            setScheduleResult(msg);
            toast.error(msg);
        } finally {
            setTestingSchedule(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* v2.4.10: Precise tester */}
            <GlassCard className="p-6">
                <SectionHeader icon={Send} iconColor="text-blue-500 bg-blue-500" title="Тестирование уведомлений"
                    subtitle="Выберите получателя, каналы, тип и отправьте тестовое сообщение." />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Recipient */}
                    <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-widest">
                            Получатель
                        </label>
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={userSearch}
                                    onChange={e => setUserSearch(e.target.value)}
                                    placeholder="Поиск по ФИО, ID, роли…"
                                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <select
                                value={targetId}
                                onChange={e => setTargetId(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm font-medium dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Я (текущий пользователь)</option>
                                {filteredUsers.map(u => (
                                    <option key={u.user_id} value={u.user_id}>
                                        {u.fio} · {ROLE_NAMES[u.role] || u.role || '—'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Channels */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-widest">
                            Каналы
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <ChannelToggle label="Telegram" active={chTelegram} onClick={() => setChTelegram(v => !v)} />
                            <ChannelToggle label="MAX" active={chMax} onClick={() => setChMax(v => !v)} />
                            <ChannelToggle label="Push" active={chPwa} onClick={() => setChPwa(v => !v)} />
                        </div>
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-widest">
                            Тип уведомления
                        </label>
                        <select
                            value={notifType}
                            onChange={e => setNotifType(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm font-medium dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {NOTIFICATION_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Message */}
                    <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-widest">
                            Сообщение
                        </label>
                        <textarea
                            rows={2}
                            value={customMsg}
                            onChange={e => setCustomMsg(e.target.value)}
                            placeholder="Тестовое уведомление"
                            className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm resize-none dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <button
                    onClick={handleTestSend}
                    disabled={sending || channels.length === 0}
                    className="w-full mt-4 py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                    {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Отправка…</> : <><Send className="w-4 h-4" /> Отправить тест</>}
                </button>

                {results.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl space-y-1">
                        {results.map((r, i) => (
                            <div key={i} className="text-xs font-mono text-gray-700 dark:text-gray-300">
                                {r}
                            </div>
                        ))}
                    </div>
                )}
            </GlassCard>

            {/* Test schedule */}
            <GlassCard className="p-6">
                <SectionHeader icon={ImageIcon} iconColor="text-emerald-500 bg-emerald-500"
                    title="Тестовая расстановка"
                    subtitle="Сгенерирует актуальную расстановку на завтра и отправит её вам в Telegram." />
                <button
                    onClick={handleTestSchedule}
                    disabled={testingSchedule}
                    className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                    {testingSchedule ? <><Loader2 className="w-4 h-4 animate-spin" /> Генерация…</> : <><ImageIcon className="w-4 h-4" /> Отправить тестовую расстановку</>}
                </button>
                {scheduleResult && (
                    <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">{scheduleResult}</p>
                )}
            </GlassCard>

            {/* Legacy extended tests + role sim — kept for superadmin quick checks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                    <SectionHeader icon={Zap} iconColor="text-indigo-500 bg-indigo-500" title="Быстрые сценарии" />
                    <div className="space-y-3">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-widest">Платформа</label>
                            <select value={testPlatform} onChange={(e) => setTestPlatform(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 p-3 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none">
                                <option value="all">Все (MAX + Telegram)</option>
                                <option value="max">Только MAX</option>
                                <option value="tg">Только Telegram</option>
                            </select>
                        </div>
                        <button onClick={testNotification}
                            className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40 font-bold rounded-xl text-sm py-3 border border-indigo-200 dark:border-indigo-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                            <Rocket className="w-4 h-4" /> Полный тест
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => testExtended('brigadier')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/30">
                                <UserCheck className="w-3.5 h-3.5" /> Бригадир
                            </button>
                            <button onClick={() => testExtended('resource_freed')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
                                <Zap className="w-3.5 h-3.5" /> Ресурс свободен
                            </button>
                            <button onClick={() => testExtended('schedule_published')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                                <CalendarDays className="w-3.5 h-3.5" /> Расписание
                            </button>
                            <button onClick={() => testExtended('kp_review')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                                <ClipboardCheck className="w-3.5 h-3.5" /> Проверка СМР
                            </button>
                            <button onClick={() => testExtended('system_error')}
                                className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 col-span-2">
                                <AlertTriangle className="w-3.5 h-3.5" /> Системная ошибка
                            </button>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="p-6">
                    <SectionHeader icon={Shield} iconColor="text-purple-500 bg-purple-500" title="Симуляция ролей"
                        subtitle="Временно переключите аккаунт на другую роль." />
                    <div className="grid grid-cols-2 gap-2.5">
                        {Object.entries(ROLE_NAMES).filter(([k]) => k !== 'Гость').map(([rKey, rName]) => (
                            <button key={rKey} onClick={() => handleRoleSimulation(rKey)}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-sm border active:scale-95 flex items-center justify-center gap-1.5 ${
                                    role === rKey
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-200 dark:ring-purple-900'
                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                }`}>
                                {role === rKey && <ToggleLeft className="w-3.5 h-3.5" />} {rName}
                            </button>
                        ))}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}

function ChannelToggle({ label, active, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors active:scale-95 ${
                active
                    ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
        >
            {label}
        </button>
    );
}

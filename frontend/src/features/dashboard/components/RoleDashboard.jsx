import { createElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity, AlertTriangle, CalendarDays, CheckCircle2,
    ClipboardCheck, FileText, HardHat, HeartPulse, ShieldCheck,
    UserCheck, Users, UserX, Wrench,
} from 'lucide-react';
import { ROLE_NAMES } from '../../../utils/roleConfig';

const STATUS_LABELS = { available: 'Доступен', vacation: 'Отпуск', sick: 'Больничный' };

function Metric({ icon, label, value, tone = 'blue' }) {
    const tones = {
        blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
        emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
        red: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
        violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
    };
    return (
        <div className="min-w-0 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tones[tone]}`}>{createElement(icon, { className: 'w-5 h-5' })}</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">{value ?? 0}</div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1 leading-tight">{label}</div>
        </div>
    );
}

function QuickAction({ label, path, onClick }) {
    const navigate = useNavigate();
    return (
        <button onClick={() => onClick ? onClick() : navigate(path)} className="min-h-11 px-4 py-2.5 rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all">
            {label}
        </button>
    );
}

export default function RoleDashboard({ role, summary, onCreateApplication }) {
    if (!summary) return null;
    const apps = summary.applications || {};
    const smr = summary.smr || {};
    const workforce = summary.workforce || {};
    const personal = summary.personal || {};
    const system = summary.system || {};

    const configs = {
        superadmin: {
            eyebrow: 'Контроль системы',
            title: 'Панель супер-администратора',
            subtitle: 'Состояние сервиса, пользователи и критичные очереди в одном месте.',
            metrics: [
                [Activity, 'Пользователей онлайн', system.online, 'emerald'],
                [UserCheck, 'Активных пользователей', system.active_users, 'blue'],
                [AlertTriangle, 'Открытых сбоев', system.open_alerts, system.open_alerts ? 'red' : 'emerald'],
                [UserX, 'Без назначенной роли', system.users_without_role, system.users_without_role ? 'red' : 'emerald'],
                [ClipboardCheck, 'Заявок на проверке', apps.waiting, 'amber'],
                [FileText, 'СМР на проверке', smr.to_review, 'violet'],
            ],
            actions: [['Админка', '/admin'], ['Проверить заявки', '/review'], ['Открыть СМР', '/kp']],
        },
        boss: {
            eyebrow: 'Управление производством', title: 'Главная директора',
            subtitle: 'Заявки, расстановка и контроль СМР.',
            metrics: [[ClipboardCheck, 'На проверке', apps.waiting, 'amber'], [CalendarDays, 'Расстановка на завтра', apps.approved_tomorrow, 'blue'], [HardHat, 'Сейчас в работе', apps.in_progress, 'emerald'], [AlertTriangle, 'Долги СМР', smr.debts, 'red']],
            actions: [['Проверить заявки', '/review'], ['Открыть СМР', '/kp'], ['Админка', '/admin']],
        },
        moderator: {
            eyebrow: 'Оперативная работа', title: 'Главная модератора',
            subtitle: 'Очередь заявок, расстановка и отчёты, требующие внимания.',
            metrics: [[ClipboardCheck, 'На проверке', apps.waiting, 'amber'], [CalendarDays, 'На завтра', apps.approved_tomorrow, 'blue'], [FileText, 'СМР на проверке', smr.to_review, 'violet'], [AlertTriangle, 'Долги СМР', smr.debts, 'red']],
            actions: [['Создать заявку', null, onCreateApplication], ['Проверить заявки', '/review'], ['Открыть СМР', '/kp']],
        },
        hr: {
            eyebrow: 'Состояние персонала', title: 'Главная кадров',
            subtitle: 'Доступность сотрудников и незакрытые кадровые задачи на сегодня.',
            metrics: [[Users, 'Сотрудников в бригадах', workforce.team_members, 'blue'], [Wrench, 'Водителей', workforce.drivers, 'violet'], [CheckCircle2, 'Бригад', workforce.teams, 'emerald'], [HeartPulse, 'На больничном', workforce.sick, workforce.sick ? 'red' : 'emerald'], [CalendarDays, 'В отпуске', workforce.vacation, 'amber'], [UserX, 'Не привязаны к аккаунту', workforce.unlinked, workforce.unlinked ? 'amber' : 'emerald']],
            actions: [['Сотрудники и бригады', '/resources?tab=teams'], ['Водители', '/resources?tab=drivers'], ['Отчёты СМР', '/kp']],
        },
        foreman: {
            eyebrow: 'Моя работа', title: 'Главная прораба', subtitle: 'Ваши выезды и ближайшие задачи.',
            metrics: [[HardHat, 'Заявок сегодня', personal.today, 'blue'], [CalendarDays, 'На ближайшие 7 дней', personal.upcoming, 'violet'], [FileText, 'СМР к заполнению', personal.smr_to_fill, 'amber'], [CheckCircle2, 'Завершено сегодня', personal.completed_today, 'emerald']],
            actions: [['Создать заявку', null, onCreateApplication], ['Мои заявки', '/my-apps'], ['Заполнить СМР', '/kp']],
        },
        brigadier: {
            eyebrow: 'Моя бригада', title: 'Главная бригадира', subtitle: 'Назначения и отчёты вашей бригады.',
            metrics: [[HardHat, 'Выездов сегодня', personal.today, 'blue'], [CalendarDays, 'В ближайшие 7 дней', personal.upcoming, 'violet'], [FileText, 'СМР к заполнению', personal.smr_to_fill, 'amber']],
            actions: [['Открыть СМР', '/kp'], ['Мои заявки', '/my-apps']],
        },
        worker: {
            eyebrow: 'Рабочий день', title: 'Моя главная', subtitle: 'Куда вы назначены сегодня и что запланировано дальше.',
            metrics: [[HardHat, 'Назначений сегодня', personal.today, 'blue'], [CalendarDays, 'В ближайшие 7 дней', personal.upcoming, 'violet'], [UserCheck, 'Статус', STATUS_LABELS[summary.personal_status?.status] || 'Доступен', 'emerald']],
            actions: [['Мои заявки', '/my-apps'], ['Открыть профиль', '/settings']],
        },
        employee: {
            eyebrow: 'Добро пожаловать', title: 'Главная сотрудника',
            subtitle: 'Базовый доступ к профилю, настройкам, уведомлениям и поддержке.',
            metrics: [],
            actions: [['Открыть профиль', '/settings'], ['Гайд', '/guide'], ['Поддержка', '/support']],
        },
        driver: {
            eyebrow: 'Рабочий день', title: 'Главная водителя', subtitle: 'Текущие и ближайшие назначения на технику.',
            metrics: [[HardHat, 'Назначений сегодня', personal.today, 'blue'], [CalendarDays, 'В ближайшие 7 дней', personal.upcoming, 'violet'], [UserCheck, 'Статус', STATUS_LABELS[summary.personal_status?.status] || 'Доступен', 'emerald']],
            actions: [['Мои заявки', '/my-apps'], ['Открыть профиль', '/settings']],
        },
    };
    const config = configs[role] || configs.worker;
    return (
        <section className="pt-5 space-y-4" aria-label={`Главная: ${ROLE_NAMES[role] || role}`}>
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 text-white p-6 sm:p-8 shadow-xl overflow-hidden relative">
                <ShieldCheck className="absolute -right-8 -bottom-10 w-40 h-40 opacity-[0.07]" />
                <div className="relative">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-blue-200 font-bold">{config.eyebrow}</p>
                    <h1 className="text-2xl sm:text-3xl font-black mt-2">{config.title}</h1>
                    <p className="text-sm text-blue-100/80 mt-2 max-w-2xl">{config.subtitle}</p>
                    <div className="flex flex-wrap gap-2 mt-5">
                        {config.actions.map(([label, path, handler]) => <QuickAction key={label} label={label} path={path} onClick={handler} />)}
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {config.metrics.map(([Icon, label, value, tone]) => <Metric key={label} icon={Icon} label={label} value={value} tone={tone} />)}
            </div>
        </section>
    );
}

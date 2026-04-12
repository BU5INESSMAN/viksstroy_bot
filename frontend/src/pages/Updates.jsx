import { motion } from 'framer-motion';
import {
    Rocket, Sparkles, ArrowRightLeft, Link2, Paintbrush,
    BellRing, Shield, Smartphone, Wrench, Calendar,
    LayoutGrid, FileText, Users, Bug, RefreshCw, Zap
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 } };

const badgeColors = {
    feat: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
    fix: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
    refactor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
};

function Badge({ type, label }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeColors[type] || badgeColors.feat}`}>
            {label}
        </span>
    );
}

function VersionBlock({ version, date, title, icon: Icon, iconColor, isCurrent, changes }) {
    return (
        <motion.div variants={prefersReducedMotion ? {} : fadeUp} transition={{ duration: 0.25 }}>
            <GlassCard className={`p-6 sm:p-7 ${isCurrent ? 'ring-2 ring-blue-500/30 dark:ring-blue-400/20' : ''}`}>
                <div className="flex items-start gap-4 mb-5">
                    <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconColor}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-lg font-extrabold text-gray-900 dark:text-white">{version}</span>
                            {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500 text-white">Текущая</span>
                            )}
                        </div>
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{title}</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">{date}</p>
                    </div>
                </div>
                <div className="space-y-2.5">
                    {changes.map((c, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                            <Badge type={c.type} label={c.type === 'feat' ? 'feat' : c.type === 'fix' ? 'fix' : 'refactor'} />
                            <span className="leading-relaxed">{c.text}</span>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </motion.div>
    );
}

const versions = [
    {
        version: 'v2.0',
        date: 'Апрель 2026',
        title: 'Глобальный лоск (Этап 6)',
        icon: Paintbrush,
        iconColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        isCurrent: true,
        changes: [
            { type: 'feat', text: 'Аудит фоновых уведомлений: асинхронная отправка, без блокировки UI (6.1)' },
            { type: 'feat', text: 'Паритет ботов TG ↔ MAX: команда /join, inline-кнопки, callbacks (6.2)' },
            { type: 'refactor', text: 'Декомпозиция: 11 сервисов, 20+ frontend-компонентов (6.3)' },
            { type: 'feat', text: 'Единая цветовая система: roleConfig.js, statusConfig.js, GlassCard (6.4)' },
            { type: 'feat', text: 'Анимации framer-motion: модалки, канбан, переходы страниц, FAB (6.5)' },
            { type: 'feat', text: 'Десктоп/мобильная адаптация: max-w-7xl, 2-колоночные формы (6.6)' },
            { type: 'feat', text: 'PWA: manifest.json, service worker, офлайн-режим, установка на телефон (6.7)' },
            { type: 'feat', text: 'Полное руководство и история обновлений (6.8)' },
            { type: 'feat', text: 'Полное логирование: 70 точек логов, настройка хранения (6.9)' },
        ],
    },
    {
        version: 'v1.3',
        date: 'Март 2026',
        title: 'Синхронизация профилей (Этап 5B)',
        icon: Link2,
        iconColor: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        isCurrent: false,
        changes: [
            { type: 'feat', text: 'Привязка аккаунтов Telegram ↔ MAX с единым профилем' },
            { type: 'feat', text: 'Автоопределение совпадений по ФИО при привязке' },
            { type: 'feat', text: 'Объединение заявок и истории при связывании аккаунтов' },
            { type: 'feat', text: 'Принудительная связка модератором из панели администрирования' },
            { type: 'feat', text: 'Уведомления о конфликтах ролей при связывании' },
        ],
    },
    {
        version: 'v1.2',
        date: 'Февраль 2026',
        title: 'Биржа техники (Этап 5A)',
        icon: ArrowRightLeft,
        iconColor: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
        isCurrent: false,
        changes: [
            { type: 'feat', text: 'P2P обмен техникой между прорабами' },
            { type: 'feat', text: 'Inline-кнопки в ботах: принять / отклонить обмен' },
            { type: 'feat', text: 'Автоматический таймаут 30 минут на ответ' },
            { type: 'feat', text: 'Модалка выбора: обмен или свободное время (тайм-слоты)' },
        ],
    },
    {
        version: 'v1.1',
        date: 'Январь 2026',
        title: 'Расстановки (Этап 4)',
        icon: Calendar,
        iconColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
        isCurrent: false,
        changes: [
            { type: 'feat', text: 'ScheduleModal с карточками дат для быстрого выбора' },
            { type: 'feat', text: 'Генератор PNG-картинок расписания (Pillow)' },
            { type: 'feat', text: 'Кнопка "На завтра" для мгновенной публикации' },
            { type: 'feat', text: 'Ручное управление статусами заявок прорабами (4.1)' },
        ],
    },
    {
        version: 'v1.0',
        date: 'Декабрь 2025',
        title: 'Фундамент (Этап 1-3)',
        icon: Rocket,
        iconColor: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
        isCurrent: false,
        changes: [
            { type: 'feat', text: 'Авторизация и 7 уровней ролевого доступа' },
            { type: 'feat', text: 'Канбан-доска заявок: 4 колонки со статусами' },
            { type: 'feat', text: 'Управление бригадами и техникой: CRUD, приглашения, пароли' },
            { type: 'feat', text: 'Управление объектами с загрузкой PDF-смет' },
            { type: 'feat', text: 'Генерация расстановки (PNG) и автопубликация в группы' },
            { type: 'feat', text: 'СМР: заполнение отчётов, проверка, экспорт в Excel' },
            { type: 'feat', text: 'Приватность: ролевой доступ ко всем данным' },
        ],
    },
    {
        version: 'Fixes',
        date: '2026',
        title: 'Исправления и улучшения',
        icon: Bug,
        iconColor: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
        isCurrent: false,
        changes: [
            { type: 'fix', text: 'Должники СМР висят до заполнения (не исчезают при завершении наряда)' },
            { type: 'fix', text: 'Кнопка "Напомнить" для модераторов по должникам СМР' },
            { type: 'fix', text: 'Архивация и восстановление СМР-отчётов' },
            { type: 'fix', text: 'Корректная работа кнопки "Свободен" при нескольких бригадах' },
        ],
    },
];

export default function Updates() {
    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            {/* Hero */}
            <div className="bg-gradient-to-br from-violet-600 to-purple-800 rounded-3xl shadow-xl p-8 md:p-10 text-white relative overflow-hidden">
                <div className="absolute -right-16 -top-16 w-56 h-56 bg-white opacity-10 rounded-full blur-3xl" />
                <div className="absolute left-8 -bottom-16 w-36 h-36 bg-purple-400 opacity-20 rounded-full blur-2xl" />
                <div className="relative z-10">
                    <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight flex items-center gap-3">
                        <Sparkles className="w-8 h-8 md:w-10 md:h-10" /> История обновлений
                    </h1>
                    <p className="text-purple-100 text-sm md:text-base font-medium max-w-xl leading-relaxed">
                        Все улучшения платформы "ВИКС Расписание" — от первого релиза до текущей версии.
                    </p>
                </div>
            </div>

            {/* Timeline */}
            <motion.div
                className="space-y-4"
                initial="initial"
                animate="animate"
                variants={prefersReducedMotion ? {} : stagger}
            >
                {versions.map(v => (
                    <VersionBlock key={v.version} {...v} />
                ))}
            </motion.div>
        </main>
    );
}

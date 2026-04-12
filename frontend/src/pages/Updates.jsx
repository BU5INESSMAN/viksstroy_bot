import { motion } from 'framer-motion';
import {
    Rocket, Sparkles, ArrowRightLeft, Link2, Paintbrush,
    BellRing, Smartphone, Wrench, Calendar, Shield,
    LayoutGrid, FileText, Users, Bug, RefreshCw, Zap, Code
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 } };

const badgeColors = {
    feat: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
    fix: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
    refactor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    chore: 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400 border-gray-200 dark:border-gray-600/50',
};

function Badge({ type }) {
    const labels = { feat: 'feat', fix: 'fix', refactor: 'refactor', chore: 'chore' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 ${badgeColors[type] || badgeColors.feat}`}>
            {labels[type] || type}
        </span>
    );
}

function VersionBlock({ version, date, title, icon: Icon, iconColor, isCurrent, changes }) {
    return (
        <motion.div variants={prefersReducedMotion ? {} : fadeUp} transition={{ duration: 0.25 }}>
            <GlassCard className={`p-5 sm:p-7 ${isCurrent ? 'ring-2 ring-blue-500/30 dark:ring-blue-400/20' : ''}`}>
                <div className="flex items-start gap-3 sm:gap-4 mb-5">
                    <div className={`p-2 sm:p-2.5 rounded-xl flex-shrink-0 ${iconColor}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white">{version}</span>
                            {isCurrent && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500 text-white">Текущая</span>}
                        </div>
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{title}</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">{date}</p>
                    </div>
                </div>
                <div className="space-y-2">
                    {changes.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[13px] text-gray-600 dark:text-gray-300">
                            <Badge type={c.type} />
                            <span className="leading-relaxed">{c.text}</span>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </motion.div>
    );
}

const TOTAL_COMMITS = 177;

const versions = [
    {
        version: 'v2.1', date: 'Апрель 2026', title: 'Финальные исправления',
        icon: Wrench, iconColor: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400', isCurrent: true,
        changes: [
            { type: 'fix', text: 'Удалена кнопка "Опубликовать" и модалка публикации из страницы Заявок (дублировала Расстановку)' },
            { type: 'fix', text: 'Мобильная адаптация: компактные кнопки "На завтра" и "Архив", стек настроек техники на узких экранах' },
            { type: 'fix', text: 'iPhone Safe Area: viewport-fit=cover, CSS-утилита .pb-safe для нижнего навбара' },
            { type: 'feat', text: 'СМР: грейс-период 24 часа (должники появляются через день после наряда)' },
            { type: 'feat', text: 'СМР: отображение количества дней просрочки с цветовой шкалой (жёлтый → оранжевый → красный)' },
            { type: 'feat', text: 'Нижнее меню: только иконки на мобильном, текст виден на sm+ экранах' },
        ],
    },
    {
        version: 'v2.0', date: 'Апрель 2026', title: 'Глобальный лоск (Этап 6)',
        icon: Paintbrush, iconColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', isCurrent: false,
        changes: [
            { type: 'fix', text: '6.1 — Все уведомления вынесены в asyncio.create_task, устранены дубли отправок' },
            { type: 'feat', text: '6.2 — Паритет ботов: /join + 4 callback-а в TG боте, ФИО-автодетект в обоих мессенджерах' },
            { type: 'refactor', text: '6.3 — Декомпозиция: utils.py 875→62 строки, 11 сервисов в web/services/, 20+ извлечённых frontend-компонентов' },
            { type: 'refactor', text: '6.3 — Frontend: Home 588→358, Objects 851→362, System 770→335, 3 общих селектора' },
            { type: 'feat', text: '6.4 — Единая цветовая система: roleConfig.js, statusConfig.js, GlassCard, семантические токены Tailwind' },
            { type: 'feat', text: '6.5 — Анимации framer-motion: 5 модалок, стаггер канбана, переходы страниц, FAB, коллапс секций' },
            { type: 'feat', text: '6.6 — Адаптация: max-w-7xl контейнеры, 2-колоночные формы, BottomNav max-w-5xl, Teams lg:grid-cols-3' },
            { type: 'feat', text: '6.7 — PWA: manifest.json, service worker с офлайн-режимом, установка на телефон' },
            { type: 'feat', text: '6.8 — Руководство (14 разделов) и полная история обновлений с changelog' },
            { type: 'feat', text: '6.9 — Полное логирование: 70+ точек аудита, target_type/target_id, настройка хранения' },
            { type: 'chore', text: 'graphify: граф знаний 797 узлов, Obsidian-хранилище 925 заметок, wiki 128 статей' },
        ],
    },
    {
        version: 'v1.3', date: 'Март 2026', title: 'Синхронизация профилей (Этап 5B)',
        icon: Link2, iconColor: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', isCurrent: false,
        changes: [
            { type: 'feat', text: 'Привязка аккаунтов Telegram ↔ MAX с единым профилем и объединением заявок' },
            { type: 'feat', text: 'Автоопределение совпадений по ФИО при привязке аккаунта' },
            { type: 'feat', text: 'Принудительная связка модератором из панели администрирования' },
            { type: 'feat', text: 'Уведомления о конфликтах ролей при связывании аккаунтов' },
            { type: 'feat', text: 'Скрытие дубликатов пользователей в таблице System после связывания' },
            { type: 'feat', text: 'Отображение обеих платформ (TG/MAX) на карточке пользователя' },
        ],
    },
    {
        version: 'v1.2', date: 'Февраль 2026', title: 'Биржа техники (Этап 5A)',
        icon: ArrowRightLeft, iconColor: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400', isCurrent: false,
        changes: [
            { type: 'feat', text: 'P2P обмен техникой между прорабами с inline-кнопками в ботах' },
            { type: 'feat', text: 'Автоматический таймаут 30 минут на ответ по обмену' },
            { type: 'feat', text: 'Модалка выбора: обмен или свободное время (тайм-слоты)' },
            { type: 'feat', text: 'Тайм-слоты техники: бронирование по часам с проверкой пересечений' },
            { type: 'feat', text: 'Модалка редактирования техники с полем госномера' },
            { type: 'fix', text: 'Защита от спама запросов обмена, изоляция диалога обмена от формы' },
            { type: 'fix', text: 'Отложенный обмен: запрос отправляется после создания заявки, а не до' },
        ],
    },
    {
        version: 'v1.1', date: 'Январь 2026', title: 'Мультиплатформа и расстановки (Этап 4)',
        icon: Calendar, iconColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400', isCurrent: false,
        changes: [
            { type: 'feat', text: 'ScheduleModal с карточками дат для быстрого выбора расстановки' },
            { type: 'feat', text: 'Генератор PNG-картинок расписания (Pillow, Excel-стиль)' },
            { type: 'feat', text: 'Кнопка "На завтра" для мгновенной публикации расстановки в группу' },
            { type: 'feat', text: 'Ручное управление статусами: прорабы переводят заявки в работу/завершение' },
            { type: 'feat', text: 'Бот MAX: авторизация через WebApp, FSM-регистрация, команда /setchat для групп' },
            { type: 'feat', text: 'Омниканальные уведомления: публикация нарядов и оповещения через MAX и Telegram' },
            { type: 'feat', text: 'Генерация кода /web для входа с компьютера через обоих ботов' },
            { type: 'fix', text: 'Правильная маршрутизация уведомлений: primary и secondary endpoint-ы пользователей' },
            { type: 'fix', text: 'MAX API: переход на нативные aiohttp-запросы вместо нестабильной библиотеки' },
        ],
    },
    {
        version: 'v1.0', date: 'Декабрь 2025', title: 'Фундамент (Этап 1-3)',
        icon: Rocket, iconColor: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', isCurrent: false,
        changes: [
            { type: 'feat', text: 'Авторизация: вход по ссылке-приглашению, 7 уровней ролевого доступа' },
            { type: 'feat', text: 'Канбан-доска: 4 колонки статусов, FAB-кнопка создания, фильтры по датам' },
            { type: 'feat', text: 'Заявки: выбор объекта, бригад с галочками, техники с временем работы' },
            { type: 'feat', text: 'Бригады: CRUD, приглашения по коду/ссылке, паролевая защита' },
            { type: 'feat', text: 'Техника: каталог по категориям, привязка водителей, статус "Свободен" с подтверждением' },
            { type: 'feat', text: 'Объекты: CRUD, ресурсы по умолчанию, загрузка PDF-смет, архивация' },
            { type: 'feat', text: 'СМР/КП: заполнение отчётов, проверка модератором, экспорт в Excel' },
            { type: 'feat', text: 'Система: APScheduler (авто-старт, завершение, напоминания), настройки, логи' },
            { type: 'feat', text: 'Telegram-бот: Mini App, уведомления, генерация картинок для групповых чатов' },
            { type: 'feat', text: 'Тёмная тема, адаптивный UI, профили пользователей с аватарками' },
            { type: 'refactor', text: 'Декомпозиция api_main.py на FastAPI-роутеры и модули ядра' },
            { type: 'fix', text: 'Миграции SQLite: автоматическое добавление недостающих столбцов при старте' },
        ],
    },
    {
        version: 'Fixes', date: '2025–2026', title: 'Исправления и улучшения',
        icon: Bug, iconColor: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400', isCurrent: false,
        changes: [
            { type: 'fix', text: 'Должники СМР висят до заполнения (не исчезают при завершении наряда)' },
            { type: 'feat', text: 'Кнопка "Напомнить" модераторам по должникам СМР' },
            { type: 'feat', text: 'Модераторы видят все незаполненные СМР, не только свои' },
            { type: 'feat', text: 'Архивация и восстановление СМР-отчётов отдельно от заявок' },
            { type: 'feat', text: 'Раздельное отображение статуса свободных бригад на карточках' },
            { type: 'fix', text: 'Миграция на Lucide React (SVG-иконки вместо emoji) + UI/UX Pro Max принципы' },
            { type: 'fix', text: 'Объединение "Бригады" и "Автопарк" в общую страницу "Ресурсы"' },
            { type: 'fix', text: 'Исправление белого экрана, бесконечной загрузки, наложения модалок' },
            { type: 'fix', text: 'Защита от двойных отправок: overlay с состоянием обработки' },
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
                    <p className="text-purple-200/60 text-xs font-medium mt-3 flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5" /> {TOTAL_COMMITS} коммитов в истории проекта
                    </p>
                </div>
            </div>

            {/* Timeline */}
            <motion.div className="space-y-4" initial="initial" animate="animate" variants={prefersReducedMotion ? {} : stagger}>
                {versions.map(v => <VersionBlock key={v.version} {...v} />)}
            </motion.div>
        </main>
    );
}

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, GitCommit, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stagger = { animate: { transition: { staggerChildren: 0.04 } } };
const fadeUp = prefersReducedMotion
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

const badgeColors = {
    feat: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
    fix: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
    refactor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    chore: 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400 border-gray-200 dark:border-gray-600/50',
};

const badgeLabels = { feat: 'feat', fix: 'fix', refactor: 'refactor', chore: 'chore' };

const versionColor = (v) => {
    const parts = v.split('.');
    if (parts[0] !== '0' && parts[1] === '0' && parts[2] === '0') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-800/50';
    if (parts[2] === '0') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-800/50';
    return 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400 border-gray-300 dark:border-gray-600/50';
};

const CHANGELOG = [
    {
        version: '2.1.2', date: '2026-04-13', title: 'Архив заявок и долги СМР', current: true,
        commits: 2,
        changes: [
            { type: 'feat', text: 'Восстановление заявок из архива — кнопка "Восстановить" в модалке архива' },
            { type: 'fix', text: 'Долги СМР сохраняются при архивации заявки — должники видны до заполнения отчёта' },
        ],
    },
    {
        version: '2.1.1', date: '2026-04-13', title: 'Навигация и единое оформление',
        commits: 4,
        changes: [
            { type: 'fix', text: 'Единое оформление заголовков страниц — убраны рамки, добавлены иконки и отступы' },
            { type: 'fix', text: 'Навигация Sidebar — Гайд, Обновления, Поддержка, Тема перемещены вниз' },
            { type: 'fix', text: 'Мобильный Header — логотип по центру, без смещения кнопками' },
            { type: 'feat', text: 'Переключение темы в мобильном меню (бургер 2×2 сетка)' },
        ],
    },
    {
        version: '2.1.0', date: '2026-04-13', title: 'Исправления и улучшения',
        commits: 4,
        changes: [
            { type: 'fix', text: 'Исправлена ошибка создания техники (405 Method Not Allowed)' },
            { type: 'fix', text: 'Уведомления в Telegram работают через SOCKS5-прокси (TG_PROXY_URL)' },
            { type: 'feat', text: 'Страница обновления при перезапуске сервера (Service Worker + React overlay)' },
            { type: 'feat', text: 'Сессия сохраняется в браузере на 30 дней (таблица sessions, автовосстановление)' },
            { type: 'fix', text: 'Service Worker: network-first для HTML, cache-first для hashed assets — нет 404 после деплоя' },
            { type: 'feat', text: 'Полный коммит-ориентированный changelog с семантическими версиями' },
            { type: 'feat', text: 'Блокировка доступа для неавторизованных пользователей' },
            { type: 'fix', text: 'Увеличены иконки и отступы в нижней навигации' },
            { type: 'fix', text: 'Гайд отображается в одну колонку' },
            { type: 'feat', text: 'Боковое меню на десктопе с возможностью свернуть' },
            { type: 'fix', text: 'Пропорциональные отступы в нижней навигации' },
            { type: 'feat', text: 'Плавные анимации переключения между страницами' },
        ],
    },
    {
        version: '2.0.0', date: '2026-04-12', title: 'Глобальный лоск (Этап 6)', commits: 19,
        changes: [
            { type: 'refactor', text: 'Декомпозиция web/utils.py: 875 строк в 11 сервисных модулей (Stage 6.3)' },
            { type: 'refactor', text: 'Извлечение exchange_service, app_service, user_service из роутеров' },
            { type: 'refactor', text: 'Декомпозиция фронтенда: общие компоненты, разделение крупных страниц' },
            { type: 'feat', text: 'Полное логирование: target_type/target_id, настройка хранения логов (Stage 6.9)' },
            { type: 'fix', text: 'Все уведомления перемещены в фоновые задачи, устранены дублирования (Stage 6.1)' },
            { type: 'feat', text: 'Паритет ботов TG и MAX: /join, 4 callback-обработчика, auto-detect ФИО (Stage 6.2)' },
            { type: 'feat', text: 'Единая цветовая система: семантические токены, roleConfig, statusConfig, GlassCard (Stage 6.4)' },
            { type: 'feat', text: 'Анимации: framer-motion модалки, stagger-канбан, fade-переходы (Stage 6.5)' },
            { type: 'feat', text: 'Адаптивная вёрстка: контейнеры, гриды, модалки, таблицы, навигация (Stage 6.6)' },
            { type: 'feat', text: 'PWA: манифест, Service Worker, установка приложения, офлайн-поддержка (Stage 6.7)' },
            { type: 'feat', text: 'Полный справочник Guide и страница Updates с timeline (Stage 6.8)' },
            { type: 'fix', text: 'Удалена кнопка "Опубликовать" из Review (дублировала Расстановку)' },
            { type: 'fix', text: 'Мобильная адаптация: компактные кнопки, стек настроек на узких экранах' },
            { type: 'fix', text: 'iPhone Safe Area: viewport-fit=cover, CSS-утилита .pb-safe' },
            { type: 'feat', text: 'СМР: грейс-период 24 часа, отображение дней просрочки с цветовой шкалой' },
            { type: 'feat', text: 'Нижнее меню: только иконки на мобильном, текст на широких экранах' },
        ],
    },
    {
        version: '1.3.1', date: '2026-04-12', title: 'Навыки и аналитика', commits: 2,
        changes: [
            { type: 'chore', text: 'Установка навыков graphify, UI/UX Pro Max' },
            { type: 'chore', text: 'Генерация Obsidian-хранилища, Wiki, обновление контекста проекта' },
        ],
    },
    {
        version: '1.3.0', date: '2026-04-11', title: 'Связывание аккаунтов (Этап 5B)', commits: 7,
        changes: [
            { type: 'feat', text: 'Бэкенд слияния аккаунтов: merge TG и MAX, определение конфликта ролей' },
            { type: 'feat', text: 'Авто-поиск совпадений ФИО при регистрации на другой платформе' },
            { type: 'feat', text: 'Фронтенд связывания: UI привязки, админ-принудительная привязка в профиле' },
            { type: 'feat', text: 'Скрытие объединённых пользователей в таблице Система, отображение двух платформ' },
            { type: 'fix', text: 'СМР-должники сохраняются до заполнения, кнопка "Напомнить" для модераторов' },
            { type: 'feat', text: 'Модераторы видят все незаполненные СМР на странице КП' },
            { type: 'feat', text: 'Архивирование СМР с восстановлением, отдельно от архива заявок' },
        ],
    },
    {
        version: '1.2.0', date: '2026-04-11', title: 'Обмен техникой (Этап 5A)', commits: 12,
        changes: [
            { type: 'feat', text: 'P2P-обмен техникой: запросы на обмен с inline-кнопками в ботах' },
            { type: 'feat', text: 'Автоматическое истечение обменов через 30 минут' },
            { type: 'fix', text: 'Защита от спама обменами, изоляция диалога от валидации формы' },
            { type: 'feat', text: 'Модалка редактирования техники с полем гос. номера' },
            { type: 'fix', text: 'Отложенный обмен: запрос после создания заявки, guard от множественных запросов' },
            { type: 'fix', text: 'Создание заявки без спорной техники, обработка свободной техники при обмене' },
            { type: 'fix', text: 'Уведомления об обмене через proxy-aware notify_users' },
            { type: 'feat', text: 'Расписание техники по временным слотам, UI свободных окон, настройки базовых часов' },
            { type: 'fix', text: 'Валидация перекрытия временных слотов (409 Conflict)' },
            { type: 'feat', text: 'Модалка выбора действия для занятой техники: свободный слот или обмен' },
        ],
    },
    {
        version: '1.1.1', date: '2026-04-11', title: 'Ручное управление статусами (Этап 4.1)', commits: 4,
        changes: [
            { type: 'feat', text: 'Ручное изменение статуса заявки модераторами через ViewAppModal' },
            { type: 'feat', text: 'Очистка СМР при откате статуса' },
            { type: 'feat', text: 'Объекты: загрузка PDF, целевые объёмы, статистика прогресса' },
            { type: 'feat', text: 'Автоматическое создание объектов из PDF' },
        ],
    },
    {
        version: '1.1.0', date: '2026-04-11', title: 'Умное расписание (Этап 4)', commits: 30,
        changes: [
            { type: 'feat', text: 'ScheduleModal: карточки по датам, групповое управление заявками' },
            { type: 'feat', text: 'Умная авто-публикация: 10-мин таймаут, трекинг должников' },
            { type: 'fix', text: 'Восстановление генератора изображений, исправление кнопок, запрет мутации статуса при публикации' },
            { type: 'feat', text: 'Тосты, сворачиваемая панель "Мои заявки", фильтрация логов' },
            { type: 'feat', text: 'Авто-канбан, 48ч архив, кастомный выбор объектов, модалки' },
            { type: 'fix', text: 'Бесконечная загрузка, модальный backdrop, синхронизация состояния редактирования' },
            { type: 'fix', text: 'Уведомления в фоне, валидация JSON техники, CSS модальный overlay' },
            { type: 'refactor', text: 'Отдельная модалка редактирования, глобальная блокировка ресурсов' },
            { type: 'feat', text: 'СМР: фильтры приватности, привязка ко времени, система напоминаний' },
            { type: 'feat', text: 'Объекты: PDF-загрузка, запросы на объекты, выделение допработ в СМР' },
            { type: 'feat', text: 'Генерация изображения расписания в стиле Excel для публикации' },
            { type: 'fix', text: 'Исправление двойной отправки расписания' },
            { type: 'feat', text: 'Перестройка админ-панели: рассылки и серверные логи' },
            { type: 'feat', text: 'Раздельные таймеры автоматизации, ролевой доступ к UI' },
            { type: 'feat', text: 'Поддержка SOCKS5 прокси для основного бота' },
            { type: 'fix', text: 'Регистрация ФИО в MAX-боте, контекст кнопки webapp в Telegram' },
            { type: 'fix', text: 'Добавление Telegram WebApp SDK, polling авторизации TMA' },
            { type: 'fix', text: 'Lazy loading, разблокировка ресурсов' },
            { type: 'fix', text: 'Синхронизация даты на кнопке отправки, UTC-баг' },
            { type: 'feat', text: 'Гранулярные настройки уведомлений' },
            { type: 'feat', text: 'Парсинг объектов из PDF' },
        ],
    },
    {
        version: '1.0.2', date: '2026-04-08', title: 'Объекты и КП-модуль', commits: 18,
        changes: [
            { type: 'feat', text: 'Объединение "Бригады" и "Автопарк" в общую страницу "Ресурсы"' },
            { type: 'refactor', text: 'Рефакторинг фронтенда: декомпозиция компонентов (части 1-2)' },
            { type: 'feat', text: 'Объекты: создание, управление, привязка к заявкам' },
            { type: 'feat', text: 'Страница управления объектами, ресурсы по умолчанию, UI назначения КП' },
            { type: 'feat', text: 'КП-отчётность: модерация, экспорт в Excel (Pandas)' },
            { type: 'feat', text: 'Excel-каталог КП с версионным хранилищем файлов' },
            { type: 'feat', text: 'Роль бригадира: симуляция, ограничение доступа к КП' },
            { type: 'fix', text: 'Канбан: только чтение на главной, ViewAppModal — отдельный компонент' },
            { type: 'feat', text: 'Нативная роль бригадира с обновлённым доступом' },
            { type: 'feat', text: 'КП: приватность, поток согласования, настройки UI' },
        ],
    },
    {
        version: '1.0.1', date: '2026-04-01', title: 'Исправления после релиза', commits: 15,
        changes: [
            { type: 'feat', text: 'Раздельное отображение статуса свободных бригад' },
            { type: 'feat', text: 'Миграция на lucide-react, применение UI/UX Pro Max' },
            { type: 'feat', text: 'Стилизация Layout, Guide, Updates — дизайн-система v1.3' },
            { type: 'fix', text: 'Исправления MAX-бота: /join, inline LinkButton' },
            { type: 'feat', text: 'Логика отвязки аккаунтов для бригад и техники' },
            { type: 'feat', text: 'Защита от дублирования при отправке заявок (overlay)' },
            { type: 'fix', text: 'Исправления прорабов: права, навигация, формы' },
            { type: 'feat', text: 'Уведомления: раздельная отправка по каналам' },
            { type: 'fix', text: 'Мобильные исправления: иконки, адаптация, отступы' },
        ],
    },
    {
        version: '1.0.0', date: '2026-03-16', title: 'Фундамент (Этапы 1-3)', commits: 86,
        changes: [
            { type: 'feat', text: 'Авторизация: Telegram Widget, TMA, код из бота, MAX WebApp' },
            { type: 'feat', text: 'Ролевая система: superadmin, boss, moderator, foreman, worker, driver' },
            { type: 'feat', text: 'Канбан-доска заявок: создание, модерация, статусы' },
            { type: 'feat', text: 'Управление бригадами: приглашения, пароли, привязка Telegram' },
            { type: 'feat', text: 'Автопарк: категории, приглашения водителей, статус техники' },
            { type: 'feat', text: 'Заявки: форма с датой, бригадой, техникой, временем; публикация в чат' },
            { type: 'feat', text: 'Генерация изображений для Telegram: стили сайта, перенос текста' },
            { type: 'feat', text: 'Автоматизация: APScheduler, авто-старт, авто-завершение, напоминания' },
            { type: 'feat', text: 'Публикация в MAX: нативные кнопки, медиа-вложения' },
            { type: 'feat', text: 'Декомпозиция API: монолит api_main.py в FastAPI-роутеры' },
            { type: 'feat', text: 'Связывание аккаунтов TG и MAX: коды /web, резолвер ID' },
            { type: 'feat', text: 'Профили пользователей: аватарки, логи, мессенджер-ссылки' },
            { type: 'feat', text: 'Система приглашений: deeplink-ссылки, QR-коды, копирование в буфер' },
            { type: 'feat', text: 'Гайд: пошаговые инструкции, команды ботов, ссылки' },
            { type: 'feat', text: 'Тёмная тема, адаптивный дизайн, гамбургер-меню' },
            { type: 'feat', text: 'Умная фильтрация канбана по датам, уведомления о сменах' },
            { type: 'fix', text: 'Миграции БД: авто-добавление недостающих колонок' },
            { type: 'fix', text: 'Белый экран: React lifecycle, undefined properties, модалки' },
            { type: 'refactor', text: 'Переписка Telegram-бота: чистая TMA точка входа + центр уведомлений' },
        ],
    },
    {
        version: '0.1.0', date: '2026-02-23', title: 'Прототип', commits: 10,
        changes: [
            { type: 'feat', text: 'Первый прототип бота: заявки, бригады, техника' },
            { type: 'feat', text: 'Базовая БД и структура проекта' },
            { type: 'feat', text: 'Резервное копирование базы данных' },
            { type: 'fix', text: 'Начальные исправления панелей и логики' },
        ],
    },
];

const TOTAL_COMMITS = CHANGELOG.reduce((sum, v) => sum + (v.commits || 0), 0);

export default function Updates() {
    const [search, setSearch] = useState('');
    const [expandedVersions, setExpandedVersions] = useState(
        () => new Set(CHANGELOG.filter(v => v.current).map(v => v.version))
    );

    const toggleVersion = (version) => {
        setExpandedVersions(prev => {
            const next = new Set(prev);
            if (next.has(version)) next.delete(version);
            else next.add(version);
            return next;
        });
    };

    const expandAll = () => setExpandedVersions(new Set(CHANGELOG.map(v => v.version)));
    const collapseAll = () => setExpandedVersions(new Set());

    const filtered = search.trim()
        ? CHANGELOG.map(v => ({
            ...v,
            changes: v.changes.filter(c =>
                c.text.toLowerCase().includes(search.toLowerCase()) ||
                v.version.includes(search) ||
                v.title.toLowerCase().includes(search.toLowerCase())
            ),
        })).filter(v => v.changes.length > 0)
        : CHANGELOG;

    return (
        <div className="max-w-3xl mx-auto px-4 pt-6 sm:pt-8 pb-24 space-y-6">
            {/* Hero */}
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-3"
            >
                <div className="flex items-center justify-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                        <GitCommit className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight dark:text-white">Changelog</h1>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    <span className="font-bold text-gray-700 dark:text-gray-200">{TOTAL_COMMITS}</span> коммитов &middot; <span className="font-bold text-gray-700 dark:text-gray-200">{CHANGELOG.length}</span> версий
                </p>
            </motion.div>

            {/* Search + controls */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Поиск по версии или описанию..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                </div>
                <div className="flex gap-2">
                    <button onClick={expandAll} className="px-3 py-2 text-xs font-bold bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Раскрыть все
                    </button>
                    <button onClick={collapseAll} className="px-3 py-2 text-xs font-bold bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Свернуть все
                    </button>
                </div>
            </div>

            {/* Version list */}
            <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">
                {filtered.map((ver) => {
                    const isExpanded = expandedVersions.has(ver.version);
                    return (
                        <motion.div key={ver.version} variants={fadeUp}>
                            <GlassCard className={`overflow-hidden transition-all ${ver.current ? 'ring-2 ring-blue-500/50 dark:ring-blue-400/30' : ''}`}>
                                {/* Header - clickable */}
                                <button
                                    onClick={() => toggleVersion(ver.version)}
                                    className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${versionColor(ver.version)}`}>
                                            <Tag className="w-3 h-3" />
                                            v{ver.version}
                                        </span>
                                        <div className="min-w-0">
                                            <span className="font-bold text-sm dark:text-white truncate block">{ver.title}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{ver.date} &middot; {ver.commits || ver.changes.length} коммитов &middot; {ver.changes.length} изменений</span>
                                        </div>
                                        {ver.current && (
                                            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 uppercase tracking-wider">
                                                текущая
                                            </span>
                                        )}
                                    </div>
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                </button>

                                {/* Changes */}
                                {isExpanded && (
                                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                                        {ver.changes.map((change, i) => (
                                            <div key={i} className="flex items-start gap-2.5 text-sm">
                                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border mt-0.5 flex-shrink-0 ${badgeColors[change.type] || badgeColors.chore}`}>
                                                    {badgeLabels[change.type] || change.type}
                                                </span>
                                                <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{change.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </GlassCard>
                        </motion.div>
                    );
                })}
            </motion.div>

            {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                    <p className="font-bold">Ничего не найдено</p>
                    <p className="text-sm mt-1">Попробуйте другой запрос</p>
                </div>
            )}
        </div>
    );
}

import { Rocket, Sparkles, MonitorSmartphone, Zap, Link, ShieldCheck, Paintbrush, BellRing, MessageSquare, Users, FileText, Briefcase } from 'lucide-react';

export default function Updates() {
    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 p-4 sm:p-6 rounded-2xl border border-blue-100 dark:border-gray-600">
                    <Rocket className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 mr-4 flex-shrink-0" />
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">История обновлений</h2>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">Список всех улучшений системы «ВИКС Расписание»</p>
                    </div>
                </div>

                <div className="space-y-12 relative before:absolute before:inset-0 before:ml-[1.4rem] md:before:ml-[50%] before:-translate-x-px md:before:translate-x-0 before:w-0.5 before:bg-gradient-to-b before:from-gray-200 before:via-gray-200 before:to-transparent dark:before:from-gray-700 dark:before:via-gray-700">

                    {/* Версия 1.2.0 */}
                    <div className="relative flex flex-col md:flex-row items-start md:items-center">
                        <div className="hidden md:block w-[45%] text-right pr-6">
                            <span className="text-blue-600 dark:text-blue-400 font-bold text-sm tracking-widest uppercase">Новое</span>
                        </div>
                        <div className="absolute left-[1.4rem] -translate-x-1/2 md:left-1/2 w-4 h-4 rounded-full bg-blue-500 border-4 border-white dark:border-gray-800 shadow-[0_0_10px_rgba(59,130,246,0.5)] z-10"></div>
                        <div className="ml-12 md:ml-0 md:w-[45%] pl-0 md:pl-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
                                <FileText className="w-5 h-5 text-emerald-500" /> Версия 1.2.0 (Объекты и КП)
                            </h3>
                            <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/50 text-sm text-gray-700 dark:text-gray-300 shadow-sm transition-all hover:shadow-md">
                                <ul className="list-disc pl-5 space-y-1.5 marker:text-blue-400">
                                    <li><b>Новый модуль «Объекты»:</b> создание объектов, настройка бригад и техники по умолчанию, назначение Планов работ из справочника.</li>
                                    <li><b>Модуль «Выполненные работы» (КП):</b> полноценный интерфейс для отчета об объемах работ, с функциями модерации (Одобрить / Вернуть).</li>
                                    <li><b>Экспорт в Excel:</b> массовая генерация Excel-отчетов по выполненным работам с подсчетом сумм (на базе Pandas).</li>
                                    <li><b>Импорт прайс-листов:</b> система «Excel как единственный источник правды» для обновления глобального справочника цен.</li>
                                    <li><b>Глубокий рефакторинг:</b> модульная архитектура бэкенда (доменные репозитории) и фронтенда (Feature-Based компоненты).</li>
                                    <li><b>Новая навигация:</b> симметричное нижнее меню (BottomNav) на 7 кнопок с всплывающим разделом «Сэндвич-меню».</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Версия 1.1.0 */}
                    <div className="relative flex flex-col md:flex-row items-start md:items-center">
                        <div className="hidden md:block w-[45%] text-right pr-6">
                            <span className="text-gray-400 dark:text-gray-500 font-bold text-sm tracking-widest uppercase">Релиз</span>
                        </div>
                        <div className="absolute left-[1.4rem] -translate-x-1/2 md:left-1/2 w-4 h-4 rounded-full bg-gray-400 border-4 border-white dark:border-gray-800"></div>
                        <div className="ml-12 md:ml-0 md:w-[45%] pl-0 md:pl-6">
                            <h3 className="text-lg font-bold text-gray-600 dark:text-gray-400 flex items-center gap-2 mb-2">
                                <MonitorSmartphone className="w-5 h-5" /> Версия 1.1.0 (Старт)
                            </h3>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                                <ul className="list-disc pl-5 space-y-1.5 marker:text-gray-400">
                                    <li>Запуск Telegram Mini App & MAX WebApp.</li>
                                    <li>Система планировщика APScheduler.</li>
                                    <li>Автоматическая генерация графических нарядов.</li>
                                    <li>Ролевая модель (Суперадмин, Босс, Прораб, Рабочий, Водитель).</li>
                                    <li>Интеграция инвайт-ссылок для присоединения в бригады.</li>
                                    <li>Темная тема и адаптивный дизайн на Tailwind CSS.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </main>
    );
}
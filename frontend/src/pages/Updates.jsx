import { Rocket, Sparkles, MonitorSmartphone, Zap, Link, ShieldCheck, Paintbrush } from 'lucide-react';

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

                <div className="space-y-10 relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-gray-700 before:to-transparent">

                    {/* ВЕРСИЯ 1.3.0 */}
                    <div className="relative flex items-start md:justify-between">
                        <div className="hidden md:block w-[45%] text-right pr-6">
                            <span className="text-gray-400 dark:text-gray-500 font-bold text-sm tracking-widest uppercase">Текущая версия</span>
                        </div>
                        <div className="absolute left-[1.4rem] -translate-x-1/2 md:left-1/2 w-6 h-6 rounded-full bg-emerald-500 border-4 border-white dark:border-gray-800 shadow-md"></div>
                        <div className="ml-12 md:ml-0 md:w-[45%] pl-0 md:pl-6">
                            <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2 mb-2">
                                <Sparkles className="w-5 h-5" /> Версия 1.3.0 (UI/UX Pro Max)
                            </h3>
                            <p className="md:hidden text-xs text-gray-500 font-bold uppercase tracking-wider mb-4">Текущая версия</p>

                            <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600 shadow-sm hover:shadow-md transition-shadow">
                                    <b className="text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                                        <Paintbrush className="w-4 h-4 text-pink-500" /> Глобальный визуальный рефакторинг:
                                    </b>
                                    <ul className="list-disc pl-5 space-y-1.5 marker:text-emerald-500">
                                        <li>Системные Emoji заменены на элегантные векторные иконки <b>Lucide React</b>. Интерфейс стал чище и одинаково красиво выглядит на iOS, Android и ПК.</li>
                                        <li>Увеличены области нажатия (Touch Targets) для всех кнопок и карточек, что делает работу с платформой на стройке (или в перчатках) гораздо удобнее.</li>
                                        <li>Добавлены мягкие тени, плавные анимации наведения и эффекты "нажатия" кнопок.</li>
                                    </ul>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600 shadow-sm hover:shadow-md transition-shadow">
                                    <b className="text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-blue-500" /> Раздельные бригады в нарядах:
                                    </b>
                                    <ul className="list-disc pl-5 space-y-1.5 marker:text-emerald-500">
                                        <li>В Канбан-доске и при модерации бригады больше не сливаются в один текстовый блок.</li>
                                        <li>Каждая бригада на объекте теперь отображается <b>с новой строки</b>.</li>
                                        <li>Статус "Свободна" (зачеркивание и зеленая галочка) теперь работает индивидуально для каждой конкретной бригады в наряде.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ВЕРСИЯ 1.2.0 */}
                    <div className="relative flex items-start md:justify-between opacity-90">
                        <div className="hidden md:block w-[45%] text-right pr-6">
                            <span className="text-gray-400 dark:text-gray-500 font-bold text-sm tracking-widest uppercase">Ранее</span>
                        </div>
                        <div className="absolute left-[1.4rem] -translate-x-1/2 md:left-1/2 w-4 h-4 rounded-full bg-indigo-400 border-4 border-white dark:border-gray-800"></div>
                        <div className="ml-12 md:ml-0 md:w-[45%] pl-0 md:pl-6">
                            <h3 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mb-2">
                                <ShieldCheck className="w-5 h-5" /> Версия 1.2.0 (Связанность и Контроль)
                            </h3>
                            <p className="md:hidden text-xs text-gray-500 font-bold uppercase tracking-wider mb-4">Ранее</p>

                            <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600">
                                    <b className="text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Link className="w-4 h-4 text-indigo-500" /> Интерактивные профили:</b>
                                    <ul className="list-disc pl-5 space-y-1.5 marker:text-indigo-400">
                                        <li>Имена прорабов, рабочих и названия техники в карточках нарядов стали ссылками.</li>
                                        <li>В профиле отображается статус привязки Telegram/MAX и прямая ссылка на диалог.</li>
                                    </ul>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600">
                                    <b className="text-gray-900 dark:text-white mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-indigo-500" /> Умный контроль:</b>
                                    <ul className="list-disc pl-5 space-y-1.5 marker:text-indigo-400">
                                        <li>Добавлена защита от случайных нажатий (ввод слова <code>СВОБОДЕН</code>).</li>
                                        <li>Освободившаяся техника стала наглядно зачеркиваться на Канбан-доске.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ВЕРСИЯ 1.1.1 */}
                    <div className="relative flex items-start md:justify-between opacity-80">
                        <div className="hidden md:block w-[45%] text-right pr-6">
                            <span className="text-gray-400 dark:text-gray-500 font-bold text-sm tracking-widest uppercase">Ранее</span>
                        </div>
                        <div className="absolute left-[1.4rem] -translate-x-1/2 md:left-1/2 w-4 h-4 rounded-full bg-blue-400 border-4 border-white dark:border-gray-800"></div>
                        <div className="ml-12 md:ml-0 md:w-[45%] pl-0 md:pl-6">
                            <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2 mb-2">
                                <Zap className="w-5 h-5" /> Версия 1.1.1 (Стабильность)
                            </h3>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                                <ul className="list-disc pl-5 space-y-1.5 marker:text-blue-400">
                                    <li>Внедрена система точного авто-старта нарядов, авто-завершения и напоминаний прорабам (APScheduler).</li>
                                    <li>Вход по коду приглашения без ввода ФИО (умная регистрация).</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* ВЕРСИЯ 1.1.0 */}
                    <div className="relative flex items-start md:justify-between opacity-70">
                        <div className="hidden md:block w-[45%] text-right pr-6">
                            <span className="text-gray-400 dark:text-gray-500 font-bold text-sm tracking-widest uppercase">Релиз</span>
                        </div>
                        <div className="absolute left-[1.4rem] -translate-x-1/2 md:left-1/2 w-4 h-4 rounded-full bg-gray-400 border-4 border-white dark:border-gray-800"></div>
                        <div className="ml-12 md:ml-0 md:w-[45%] pl-0 md:pl-6">
                            <h3 className="text-lg font-bold text-gray-600 dark:text-gray-400 flex items-center gap-2 mb-2">
                                <MonitorSmartphone className="w-5 h-5" /> Версия 1.1.0 (Омниканальность)
                            </h3>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                                <ul className="list-disc pl-5 space-y-1.5 marker:text-gray-400">
                                    <li>Telegram Mini App & MAX WebApp.</li>
                                    <li>Система связывания аккаунтов (команда <code>/web</code>).</li>
                                    <li>Генерация картинок-нарядов.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </main>
    );
}
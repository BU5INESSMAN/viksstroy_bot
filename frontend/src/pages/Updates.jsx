export default function Updates() {
    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-20">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center mb-6">
                    <span className="text-4xl mr-4">🚀</span>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">История обновлений</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Список всех улучшений системы «ВИКС Расписание»</p>
                    </div>
                </div>

                <div className="space-y-8 mt-8">
                    {/* ВЕРСИЯ 1.2.0 */}
                    <div className="relative pl-6 border-l-2 border-indigo-500">
                        <div className="absolute w-4 h-4 bg-indigo-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Версия 1.2.0 (Связанность и Контроль)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 mt-1">Текущая версия</p>

                        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">👤 Интерактивные профили и Навигация:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><b>Всё кликабельно:</b> Имена прорабов, рабочих и названия техники в карточках нарядов теперь являются ссылками. Нажатие открывает подробный профиль.</li>
                                    <li><b>Контакты коллег:</b> В профиле каждого пользователя отображается статус привязки его Telegram и MAX. Добавлена возможность указать прямую ссылку на диалог в MAX для быстрой связи.</li>
                                    <li>Даже если сотрудник еще ни разу не заходил в систему, для него генерируется "заглушка" профиля с его должностью.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">✅ Умный контроль статуса "Свободен":</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Добавлена <b>защита от случайных нажатий</b>. Для завершения работы прорабам и водителям необходимо вручную ввести слово <code>СВОБОДЕН</code> в появившемся окне.</li>
                                    <li><b>Визуализация в реальном времени:</b> Освободившаяся техника и бригады теперь наглядно зачеркиваются в карточках Канбан-доски и помечаются зеленой галочкой.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">📱 Улучшения интерфейса и Безопасность:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><b>Унифицированный вход:</b> Вход через веб-браузер теперь осуществляется исключительно по безопасному 6-значному коду из бота. Убран сторонний виджет Telegram.</li>
                                    <li><b>Мобильное меню:</b> Кнопка "Профиль" перенесена в удобный нижний навигационный бар.</li>
                                    <li>Добавлена специальная адаптация верхних отступов для Telegram Mini App, чтобы системная панель мессенджера не перекрывала кнопки платформы.</li>
                                    <li>Длинные списки заявок в разделе "Модерация" теперь по умолчанию скрыты под кат (по 10 штук).</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* ВЕРСИЯ 1.1.1 */}
                    <div className="relative pl-6 border-l-2 border-blue-500 opacity-80 hover:opacity-100 transition-opacity">
                        <div className="absolute w-4 h-4 bg-blue-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">Версия 1.1.1 (Стабильность и автоматизация)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 mt-1">Ранее</p>

                        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">⚙️ Автоматизация процессов (APScheduler):</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Внедрена система точного авто-старта нарядов, авто-завершения (перевод в ожидание отчета) и напоминаний прорабам строго по часовому поясу Барнаула.</li>
                                    <li>Идеальная маршрутизация ЛС в корпоративный мессенджер MAX.</li>
                                    <li>Вход по коду приглашения без ввода ФИО (умная регистрация).</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* ВЕРСИЯ 1.1.0 */}
                    <div className="relative pl-6 border-l-2 border-green-500 opacity-70 hover:opacity-100 transition-opacity">
                        <div className="absolute w-4 h-4 bg-green-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-green-600 dark:text-green-400">Версия 1.1.0 (Омниканальность)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 mt-1">Ранее</p>

                        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">📱 Базовый функционал:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Telegram Mini App & MAX WebApp.</li>
                                    <li>Система связывания аккаунтов (команда /web).</li>
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
export default function Updates() {
    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center mb-6">
                    <span className="text-4xl mr-4">🚀</span>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">История обновлений</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Список всех улучшений системы «ВИКС Расписание»</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* ВЕРСИЯ 1.0.0 */}
                    <div className="relative pl-6 border-l-2 border-blue-500">
                        <div className="absolute w-4 h-4 bg-blue-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">Версия 1.0.0 (Релиз)</h3>
                        <p className="text-xs text-gray-400 mb-3">Дата: Октябрь 2026</p>

                        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🤖 Автоматизация и Настройки:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Добавлен раздел «Система» для босса и модераторов.</li>
                                    <li><b>Авто-публикация:</b> Система сама публикует одобренные наряды на сегодня в заданное время.</li>
                                    <li><b>Умные напоминания:</b> Автоматические оповещения прорабам о сдаче нарядов (с возможностью отключения на выходные).</li>
                                    <li>Уведомления о <b>начале наряда</b> всем рабочим и водителям в 08:00.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">📋 Умная модерация заявок:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Возможность выбора <b>нескольких бригад</b> на один объект.</li>
                                    <li>Кнопка <b>редактирования</b> заявки до модерации.</li>
                                    <li>Окно модерации: кнопки перенесены внутрь детального окна заявки для удобства.</li>
                                    <li><b>Мульти-публикация:</b> Выбор заявок галочками и фильтрация по дате перед публикацией.</li>
                                    <li>Разделение заявок в Канбане на «Одобрено» (будущие) и «В работе» (сегодняшние).</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🎨 Улучшения Telegram-интерфейса:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Полностью переписан алгоритм генерации картинок-нарядов: идеальное выравнивание и перенос строк.</li>
                                    <li>Время работы техники на карточке вынесено на отдельную строку.</li>
                                    <li>Имя модератора, одобрившего заявку, теперь является <b>кликабельной ссылкой</b> на его Telegram.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🗑 Глобальное администрирование:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Возможность полного удаления бригады со снятием участников.</li>
                                    <li>Возможность удаления пользователей (сотрудников) из базы навсегда.</li>
                                    <li>Оптимизация БД для предотвращения "Ошибки 500" (SQLite Rollback).</li>
                                    <li>Сэндвич-меню в шапке сайта для экономии места на экране.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
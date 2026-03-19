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

                <div className="space-y-8 mt-8">
                    {/* ВЕРСИЯ 1.1.0 */}
                    <div className="relative pl-6 border-l-2 border-green-500">
                        <div className="absolute w-4 h-4 bg-green-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-green-600 dark:text-green-400">Версия 1.1.0 (Омниканальность)</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 font-mono">19 Марта 2026</p>

                        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🔗 Бесшовная интеграция MAX:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Реализована полноценная поддержка и авторизация в корпоративном мессенджере MAX.</li>
                                    <li>Добавлена функция связки аккаунтов (Telegram + MAX) через 6-значный код (команда <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">/web</code>).</li>
                                    <li>В профиле появилось управление устройствами: можно привязывать и отвязывать конкретные мессенджеры.</li>
                                    <li>Реализован вход в платформу через обычный браузер по коду из бота.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">💌 Улучшенные приглашения:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Генерация сразу 3-х вариантов инвайтов: Диплинк Telegram, команда для MAX и универсальная Web-ссылка.</li>
                                    <li>Добавлена удобная команда <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">/join</code> для MAX-бота для быстрого вступления в бригады и привязки техники.</li>
                                    <li>Новая кнопка «Скопировать всё сообщение» для удобной отправки инструкций рабочим.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🚜 Автопарк:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Внедрена система инвайт-кодов для привязки водителей напрямую к их машинам.</li>
                                    <li>Улучшен парсер массового добавления техники (теперь поддерживает считывание категорий через точку с запятой <code>;</code>).</li>
                                    <li>Новый UI карточек техники с аватарками и статусами привязки.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* ВЕРСИЯ 1.0.0 */}
                    <div className="relative pl-6 border-l-2 border-blue-500">
                        <div className="absolute w-4 h-4 bg-blue-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">Версия 1.0.0 (Релиз)</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 font-mono">15 Марта 2026</p>

                        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">✨ Улучшения UI-интерфейса:</b>
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
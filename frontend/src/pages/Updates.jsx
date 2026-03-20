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
                    {/* ВЕРСИЯ 1.1.1 */}
                    <div className="relative pl-6 border-l-2 border-blue-500">
                        <div className="absolute w-4 h-4 bg-blue-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">Версия 1.1.1 (Стабильность и маршрутизация)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 mt-1">20 Марта 2026</p>

                        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🤖 Интеграция с мессенджером MAX:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><b>Идеальные ЛС:</b> Бот теперь гарантированно доставляет личные сообщения (уведомления о добавлении в наряд) прямо в личку MAX.</li>
                                    <li><b>Чистый текст:</b> Из системных уведомлений убраны технические теги, теперь отображаются только аккуратные ФИО сотрудников.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">⚡️ Умная регистрация:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><b>Вход без паролей:</b> Рабочим и водителям при вводе команды <code>/join [код]</code> больше не нужно вводить системные пароли или ФИО. Бот берет имя из профиля и мгновенно регистрирует сотрудника.</li>
                                    <li><b>Веерная рассылка:</b> Если сотрудник привязал свой аккаунт и к Telegram, и к MAX, система автоматически доставит уведомление на обе платформы.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🛡 Оптимизация ядра:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Полностью устранены ошибки блокировки базы данных (Database is locked) при одновременных действиях пользователей.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* ВЕРСИЯ 1.1.0 */}
                    <div className="relative pl-6 border-l-2 border-green-500 opacity-80 hover:opacity-100 transition-opacity">
                        <div className="absolute w-4 h-4 bg-green-500 rounded-full -left-[9px] top-1 border-4 border-white dark:border-gray-800"></div>
                        <h3 className="text-xl font-bold text-green-600 dark:text-green-400">Версия 1.1.0 (Омниканальность)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 mt-1">Ранее</p>

                        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">📱 Telegram Mini App & MAX:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Возможность открывать платформу прямо внутри мессенджеров Telegram и MAX без необходимости логиниться на сайте.</li>
                                    <li>Система <b>связывания аккаунтов</b> (команда <code>/web</code>), позволяющая пользоваться платформой как с телефона, так и с компьютера под одним профилем.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🎨 Улучшения UI/UX:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Полностью переписан алгоритм генерации картинок-нарядов: идеальное выравнивание и перенос строк.</li>
                                    <li>Время работы техники на карточке вынесено на отдельную строку.</li>
                                    <li>Имя модератора, одобрившего заявку, теперь является <b>кликабельной ссылкой</b>.</li>
                                </ul>
                            </div>

                            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600">
                                <b className="text-gray-900 dark:text-gray-100 mb-1 block">🗑 Глобальное администрирование:</b>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>Возможность полного удаления бригады со снятием участников.</li>
                                    <li>Возможность удаления пользователей из базы навсегда.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
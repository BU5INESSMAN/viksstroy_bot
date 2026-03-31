import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    KeyRound, UserCircle, ClipboardEdit, Truck,
    Settings as SettingsIcon, Smartphone, CheckCircle,
    Send, MessageCircle, Search, BellRing, Link
} from 'lucide-react';

export default function Guide() {
    const navigate = useNavigate();
    const role = localStorage.getItem('user_role') || 'Гость';
    const [searchTerm, setSearchTerm] = useState('');

    const roleLevels = { 'superadmin': 4, 'boss': 4, 'moderator': 3, 'foreman': 2, 'worker': 1, 'driver': 1, 'Гость': 0 };
    const level = roleLevels[role] || 0;

    // Структурированные данные для работы поиска
    const guideData = [
        {
            title: "Регистрация и Вход в систему",
            icon: KeyRound,
            minLevel: 0,
            blocks: [
                {
                    title: "Для рабочих и водителей (Вход по ссылке)",
                    highlight: true,
                    searchText: "рабочих водителей вход по ссылке регистрация макс max telegram телеграм бот",
                    content: (
                        <>
                            <p>Руководитель должен прислать вам <b>ссылку-приглашение</b> (или код).</p>
                            <ol className="list-decimal pl-5 space-y-2 mt-3 text-gray-600 dark:text-gray-400">
                                <li>Перейдите по ссылке или отправьте команду <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">/join [код]</code> в бот:
                                    <ul className="list-disc pl-5 mt-2 space-y-1.5 font-medium">
                                        <li className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5 text-blue-500" /> Telegram: <a href="https://t.me/viksstroy_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">@viksstroy_bot</a></li>
                                        <li className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-indigo-500" /> MAX: <a href="https://max.ru/id222264297116_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Бот Расписания MAX</a></li>
                                    </ul>
                                </li>
                                <li className="text-indigo-700 dark:text-indigo-400 font-medium"><b>В мессенджере MAX:</b> Бот прямо в чате выдаст кнопки со списком профилей. Нажмите <b>«✅ Да, привязать»</b> под своим именем.</li>
                                <li className="text-blue-700 dark:text-blue-400 font-medium"><b>В Telegram:</b> Бот откроет мини-приложение для подтверждения.</li>
                            </ol>
                        </>
                    )
                },
                {
                    title: "Как войти на сайт с компьютера? (Код авторизации)",
                    highlight: false,
                    searchText: "как войти на сайт с компьютера код авторизации web браузер",
                    content: (
                        <>
                            <p>В целях безопасности вход через браузер на ПК осуществляется по одноразовому коду.</p>
                            <ol className="list-decimal pl-5 space-y-2 mt-3 font-medium text-gray-600 dark:text-gray-300">
                                <li>Откройте бота в MAX или Telegram на телефоне.</li>
                                <li>Отправьте боту команду <code className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded-md text-gray-800 dark:text-gray-200 shadow-sm font-mono text-sm">/web</code></li>
                                <li>Бот пришлет вам <b>6-значный код</b>.</li>
                                <li>Введите этот код на сайте. Готово!</li>
                            </ol>
                        </>
                    )
                }
            ]
        },
        {
            title: "Профиль и Уведомления",
            icon: UserCircle,
            minLevel: 1,
            blocks: [
                {
                    title: "Настройка уведомлений (Контроль спама)",
                    highlight: true,
                    searchText: "настройка уведомлений контроль спама тумблер выключить лс сообщения telegram max",
                    content: (
                        <>
                            <p>Если вы привязали к платформе сразу два мессенджера (MAX и Telegram), наряды будут приходить в оба. Вы можете <b>отключить</b> дублирование:</p>
                            <ul className="list-disc pl-5 space-y-2 mt-3 text-sm text-gray-600 dark:text-gray-300">
                                <li>Зайдите в раздел <b>«Профиль»</b> (нижнее меню).</li>
                                <li>Найдите блок <b className="text-gray-800 dark:text-gray-200 flex items-center gap-1 inline-flex"><BellRing className="w-4 h-4"/> Уведомления в ЛС</b>.</li>
                                <li>Используйте тумблеры, чтобы оставить уведомления только там, где вам удобно.</li>
                                <li className="text-orange-600 dark:text-orange-400 font-medium">Система не позволит вам выключить оба тумблера одновременно, чтобы вы не пропустили вызов на работу!</li>
                            </ul>
                        </>
                    )
                },
                {
                    title: "Как привязать второй мессенджер?",
                    highlight: false,
                    searchText: "привязать второй мессенджер связать аккаунты telegram max",
                    content: (
                        <>
                            <p>Вы можете открывать приложение из любого мессенджера.</p>
                            <ol className="list-decimal pl-5 space-y-2 mt-3 text-sm text-gray-600 dark:text-gray-300">
                                <li>Перейдите в <b>«Профиль»</b> -> блок <b className="text-gray-800 dark:text-gray-200">«Привязка мессенджеров»</b>.</li>
                                <li>Зайдите в <i>новый</i> мессенджер и отправьте боту команду <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">/web</code>.</li>
                                <li>Впишите код в поле профиля и нажмите <b>«Привязать»</b>.</li>
                            </ol>
                        </>
                    )
                }
            ]
        },
        {
            title: "Работа с заявками (Для прорабов)",
            icon: ClipboardEdit,
            minLevel: 2,
            blocks: [
                {
                    title: "Создание новой заявки",
                    highlight: true,
                    searchText: "создание новой заявки прораб наряд люди техника",
                    content: (
                        <>
                            <p>Нажмите круглую синюю кнопку <b>«+» (Создать)</b> в нижнем меню.</p>
                            <ol className="list-decimal pl-5 space-y-3 mt-3 text-sm text-gray-700 dark:text-gray-300">
                                <li>Укажите дату работ и адрес (бот предложит последние 5 адресов).</li>
                                <li>Выберите бригаду и <i>отметьте галочками</i> тех, кто реально выйдет на объект.</li>
                                <li>В категории техники выберите машины и <b>укажите время работы</b> (с 08:00 до 17:00).</li>
                                <li>Нажмите <b className="text-blue-600 dark:text-blue-400">«Отправить»</b>.</li>
                            </ol>
                        </>
                    )
                },
                {
                    title: "Освобождение бригады (Статус «Свободен»)",
                    highlight: false,
                    searchText: "освобождение бригады статус свободен закончили работу",
                    content: (
                        <>
                            <p>Когда работы завершены, прораб <b>обязан</b> освободить бригаду.</p>
                            <ul className="list-none space-y-3 mt-3 text-sm bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border-l-4 border-emerald-500">
                                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /> На главной странице в блоке «Текущие наряды» нажмите <b>«Освободить»</b> под нужной бригадой.</li>
                                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /> Введите слово <code className="font-bold text-gray-900 dark:text-white uppercase bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">свободен</code>.</li>
                            </ul>
                        </>
                    )
                }
            ]
        },
        {
            title: "Автопарк (Для водителей)",
            icon: Truck,
            minLevel: 3, // Для водителей и выше
            blocks: [
                {
                    title: "Как работает статус «Свободен»?",
                    highlight: false,
                    searchText: "автопарк водитель статус свободен техника машина",
                    content: (
                        <>
                            <p>Как только вы выполнили работу на объекте, отчитайтесь диспетчеру:</p>
                            <ul className="list-disc pl-5 space-y-2 mt-3 text-sm text-gray-600 dark:text-gray-300">
                                <li>Найдите карточку объекта на Главной странице.</li>
                                <li>Нажмите зеленую кнопку <b className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">✅ Свободен</b>.</li>
                                <li>Система попросит ввести проверочное слово <code>свободен</code>. Машина в наряде зачеркнется.</li>
                            </ul>
                        </>
                    )
                }
            ]
        },
        {
            title: "Офис и Модерация",
            icon: SettingsIcon,
            minLevel: 3,
            blocks: [
                {
                    title: "Управление заявками и Уведомления",
                    highlight: true,
                    searchText: "модерация офис управление заявками публикация уведомления",
                    content: (
                        <>
                            <p>Вкладка <b>«Заявки»</b> — это ваш пульт управления. Уведомления участникам рассылаются в 2 этапа:</p>
                            <ul className="list-disc pl-5 space-y-3 mt-3 text-sm text-gray-700 dark:text-gray-300">
                                <li><b className="text-gray-900 dark:text-gray-100">1. Одобрение (Бронь):</b> При нажатии «Одобрить» всем рабочим и водителям приходит PUSH-сообщение <i>«Вас добавили в наряд. Ожидайте публикации»</i>.</li>
                                <li><b className="text-gray-900 dark:text-gray-100">2. Публикация (Старт):</b> Выделите нужные наряды и нажмите «Опубликовать». Система сгенерирует картинку-наряд и разошлет её участникам (в зависимости от их настроек тумблеров).</li>
                            </ul>
                        </>
                    )
                }
            ]
        },
        {
            title: "Установка на телефон (Приложение)",
            icon: Smartphone,
            minLevel: 1,
            blocks: [
                {
                    title: "Как установить PWA на экран",
                    highlight: false,
                    searchText: "установка на телефон приложение pwa ios android iphone скачать",
                    content: (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-3">
                            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                <h4 className="font-bold text-gray-900 dark:text-white mb-2">🍎 Apple (iPhone)</h4>
                                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                                    <li>Откройте сайт в <b>Safari</b>.</li>
                                    <li>Нажмите <b>«Поделиться»</b>.</li>
                                    <li>Выберите <b>«На экран "Домой"»</b>.</li>
                                </ol>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                <h4 className="font-bold text-gray-900 dark:text-white mb-2">🤖 Android</h4>
                                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                                    <li>Откройте сайт в <b>Chrome</b>.</li>
                                    <li>Нажмите на <b>Три точки (⋮)</b>.</li>
                                    <li>Выберите <b>«Добавить на гл. экран»</b>.</li>
                                </ol>
                            </div>
                        </div>
                    )
                }
            ]
        }
    ];

    // Функция фильтрации
    const query = searchTerm.toLowerCase().trim();
    const filteredData = guideData.map(section => {
        // Проверяем уровень доступа
        if (level < section.minLevel && !(role === 'driver' && section.icon === Truck)) return null;

        // Фильтруем блоки внутри секции
        const matchedBlocks = section.blocks.filter(block =>
            block.title.toLowerCase().includes(query) ||
            block.searchText.toLowerCase().includes(query)
        );

        if (matchedBlocks.length === 0) return null;
        return { ...section, blocks: matchedBlocks };
    }).filter(Boolean); // Убираем null

    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">

            {/* ВВОДНАЯ ЧАСТЬ И ПОИСК */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 rounded-3xl shadow-xl p-8 md:p-10 text-white relative overflow-hidden">
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
                <div className="absolute left-10 -bottom-20 w-40 h-40 bg-indigo-400 opacity-20 rounded-full blur-2xl"></div>
                <div className="relative z-10">
                    <h1 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight">База знаний</h1>
                    <p className="text-blue-100 text-sm md:text-base font-medium mb-8 leading-relaxed">
                        Подробное руководство по платформе «ВИКС Расписание». Найдите ответы на любые вопросы.
                    </p>

                    <div className="relative max-w-xl">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="w-5 h-5 text-blue-300" />
                        </div>
                        <input
                            type="text"
                            placeholder="Поиск инструкций (например: пароль, заявка, уведомления)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/20 transition-all font-medium shadow-inner"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-blue-200 hover:text-white transition-colors">
                                Сбросить
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* РЕНДЕР ОТФИЛЬТРОВАННЫХ ИНСТРУКЦИЙ */}
            {filteredData.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Ничего не найдено</h3>
                    <p className="text-gray-500 dark:text-gray-400">Попробуйте изменить поисковый запрос.</p>
                </div>
            ) : (
                filteredData.map((section, idx) => (
                    <div key={idx} className="mb-10">
                        <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white flex items-center mb-5 border-b border-gray-200 dark:border-gray-700 pb-3">
                            <section.icon className="w-6 h-6 md:w-8 md:h-8 mr-3 text-blue-500" /> {section.title}
                        </h2>
                        <div className="space-y-5">
                            {section.blocks.map((block, bIdx) => (
                                <div key={bIdx} className={`bg-white dark:bg-gray-800 p-6 rounded-2xl border shadow-sm transition-all hover:shadow-md ${block.highlight ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-700'}`}>
                                    <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-4">{block.title}</h3>
                                    <div className="text-gray-700 dark:text-gray-300 text-sm md:text-base leading-relaxed">
                                        {block.content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

        </main>
    );
}
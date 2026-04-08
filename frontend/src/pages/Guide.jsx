import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    KeyRound, UserCircle, ClipboardEdit, Truck,
    Settings as SettingsIcon, Smartphone, CheckCircle,
    Send, MessageCircle, Search, BellRing, Link,
    MapPin, FileText, Download, Upload, Briefcase
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
                                <li>Перейдите по ссылке (откроется Telegram бот).</li>
                                <li>Нажмите <b>"Запустить"</b> внизу экрана.</li>
                                <li>Бот попросит <b>Поделиться контактом</b> — нажмите соответствующую кнопку, чтобы система подтвердила ваш номер.</li>
                                <li>После этого в боте появится кнопка <b>Открыть расписание</b> (Web App). Нажмите её.</li>
                            </ol>
                            <div className="mt-3 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-xl border border-blue-100 dark:border-blue-800 text-sm">
                                <span className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1.5"><Smartphone className="w-4 h-4"/> Важно:</span>
                                Приложение работает прямо внутри Telegram! Вы также можете открыть его через корпоративное приложение MAX.
                            </div>
                        </>
                    )
                },
                {
                    title: "Для руководства и офиса",
                    highlight: false,
                    searchText: "руководство офис админ босс вход регистрация",
                    content: (
                        <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-400">
                            <li>Офисным сотрудникам учетные записи создает <b>Суперадмин</b>.</li>
                            <li>Вам придет специальный одноразовый код (или ссылка) для привязки Telegram-аккаунта.</li>
                        </ul>
                    )
                }
            ]
        },
        {
            title: "Оформление нарядов",
            icon: ClipboardEdit,
            minLevel: 2, // foreman, moderator, boss, superadmin
            blocks: [
                {
                    title: "Как создать заявку на выезд?",
                    highlight: false,
                    searchText: "создать заявку наряд выезд объект бригаду технику время",
                    content: (
                        <ol className="list-decimal pl-5 space-y-2 text-gray-600 dark:text-gray-400">
                            <li>Нажмите на большую центральную кнопку <b>"+" (СОЗДАТЬ)</b> в нижнем меню.</li>
                            <li>Выберите <b>Дату выезда</b> (по умолчанию стоит "Завтра").</li>
                            <li>Выберите <b>Объект</b> из выпадающего списка. Можно нажать "Ресурсы по умолчанию", чтобы система сама подставила нужные бригады и машины.</li>
                            <li>В разделе "Бригады" выберите одну или несколько бригад, а затем конкретных рабочих, которые поедут на объект.</li>
                            <li>В разделе "Техника" выберите нужные машины и <b>обязательно укажите время работы</b> (с ХХ:00 до ХХ:00) для каждой единицы.</li>
                            <li>Добавьте текстовый комментарий (если нужно) и нажмите <b>Отправить наряд</b>.</li>
                        </ol>
                    )
                },
                {
                    title: "Модерация заявок",
                    highlight: true,
                    searchText: "модерация проверка одобрить отклонить заявку офис статус",
                    content: (
                        <>
                            <p>Все созданные заявки попадают в статус "Ожидание". Офис (или руководство) должен проверить их.</p>
                            <ul className="list-disc pl-5 space-y-2 mt-2 text-gray-600 dark:text-gray-400">
                                <li>Перейдите в раздел <b>Заявки</b>.</li>
                                <li>Откройте карточку заявки. Вы можете:
                                    <br/>— Нажать <b>Одобрить</b> (заявка перейдет в статус "Готово к публикации").
                                    <br/>— Нажать <b>Отклонить</b> (указав причину, например: "Нет свободной техники").
                                </li>
                                <li>Одобренные заявки собираются в специальной колонке, откуда Босс может опубликовать их все разом в общую группу Telegram.</li>
                            </ul>
                        </>
                    )
                }
            ]
        },
        {
            title: "Управление Объектами",
            icon: MapPin,
            minLevel: 2, // foreman, moderator, boss, superadmin
            blocks: [
                {
                    title: "Создание и настройка ресурсов",
                    highlight: false,
                    searchText: "объекты создать настройка ресурсы по умолчанию",
                    content: (
                        <>
                            <p>Раздел <b>Объекты</b> позволяет управлять списком рабочих площадок.</p>
                            <ul className="list-disc pl-5 space-y-1 mt-2 text-gray-600 dark:text-gray-400">
                                <li>При создании укажите название и точный адрес.</li>
                                <li>В режиме редактирования можно задать <b>Бригады и Технику по умолчанию</b>. Они будут автоматически предлагаться при создании наряда на этот объект.</li>
                                <li>Неактуальные или завершенные объекты можно отправить в архив, чтобы они не мешались в выпадающих списках.</li>
                            </ul>
                        </>
                    )
                },
                {
                    title: "Назначение Плана работ (КП)",
                    highlight: true,
                    searchText: "план кп прайс цены работы справочник",
                    content: (
                        <>
                            <p>Для каждого объекта необходимо задать План работ, чтобы бригадиры могли отчитываться о выполнении:</p>
                            <ol className="list-decimal pl-5 space-y-1 mt-2 text-gray-600 dark:text-gray-400">
                                <li>В настройках объекта перейдите во вкладку <b>План КП</b>.</li>
                                <li>Используя поиск, выберите нужные виды работ из глобального справочника (поставьте галочки).</li>
                                <li>Нажмите "Сохранить план". Теперь именно эти работы появятся у бригадира в отчете по данному объекту.</li>
                            </ol>
                        </>
                    )
                }
            ]
        },
        {
            title: "Выполненные работы (Отчеты КП)",
            icon: FileText,
            minLevel: 1, // worker, driver, foreman, moderator, boss, superadmin
            blocks: [
                {
                    title: "Заполнение объемов (Бригадиры и Прорабы)",
                    highlight: true,
                    searchText: "кп объемы заполнить отчет выполненные работы",
                    content: (
                        <>
                            <p>После завершения наряда необходимо заполнить фактические объемы выполненных работ:</p>
                            <ol className="list-decimal pl-5 space-y-1 mt-2 text-gray-600 dark:text-gray-400">
                                <li>Перейдите в раздел <b>КП</b> (Выполненные работы), вкладка <b>К заполнению</b>.</li>
                                <li>Откройте нужный наряд и введите фактические объемы по каждой позиции (метры, штуки, часы и т.д.).</li>
                                <li>Нажмите <b>Отправить отчет</b>. Важно: текущие расценки (ЗП и Цена из справочника) будут намертво зафиксированы для этого отчета.</li>
                            </ol>
                        </>
                    )
                },
                {
                    title: "Проверка, Модерация и Экспорт (Офис)",
                    highlight: false,
                    searchText: "экспорт excel скачать проверить модерация",
                    content: (
                        <>
                            <p>Офисные сотрудники проверяют и выгружают заполненные отчеты:</p>
                            <ul className="list-disc pl-5 space-y-1 mt-2 text-gray-600 dark:text-gray-400">
                                <li><b>На проверку:</b> Отчет можно Одобрить или Вернуть на доработку (если есть ошибка в цифрах).</li>
                                <li><b>Готовые:</b> Офис может вручную подкорректировать объемы в уже одобренном отчете и нажать "Сохранить изменения цифр".</li>
                                <li><b>Экспорт в Excel:</b> Во вкладке "Готовые" отметьте нужные наряды галочками и нажмите <b>Скачать выбранные</b>. Будет сгенерирован сводный Excel-файл со всеми суммами.</li>
                            </ul>
                        </>
                    )
                },
                {
                    title: "Импорт глобального справочника (Офис)",
                    highlight: false,
                    searchText: "справочник импорт excel прайс",
                    content: (
                        <>
                            <p>Управление глобальными расценками осуществляется <b>только через Excel-файл</b> (Single Source of Truth):</p>
                            <ol className="list-decimal pl-5 space-y-1 mt-2 text-gray-600 dark:text-gray-400">
                                <li>Нажмите <b>Экспорт</b> в шапке раздела "Выполненные работы", чтобы скачать актуальный справочник из базы.</li>
                                <li>Внесите изменения в цены или добавьте новые работы прямо в Excel на вашем компьютере.</li>
                                <li>Нажмите <b>Импорт</b> и загрузите сохраненный файл обратно. Все новые отчеты будут использовать новые расценки (старые, уже заполненные отчеты не изменятся).</li>
                            </ol>
                        </>
                    )
                }
            ]
        },
        {
            title: "Ресурсы (Люди и Техника)",
            icon: Briefcase,
            minLevel: 3, // moderator, boss, superadmin
            blocks: [
                {
                    title: "Управление бригадами",
                    highlight: false,
                    searchText: "бригада рабочие добавить удалить инвайт ссылка",
                    content: (
                        <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-400">
                            <li>Перейдите в раздел <b>Ресурсы</b> вкладка <b>Бригады</b>.</li>
                            <li>Вы можете создавать новые бригады и назначать им названия.</li>
                            <li>Чтобы добавить рабочего, нажмите "Управление" на карточке бригады, сгенерируйте <b>Пригласительную ссылку</b> и отправьте её рабочему. Перейдя по ней, он автоматически зачислится в эту бригаду.</li>
                            <li>Здесь же можно назначать статус <b>"Бригадир"</b> конкретным рабочим.</li>
                        </ul>
                    )
                },
                {
                    title: "Управление техникой",
                    highlight: false,
                    searchText: "техника машины трактор водитель инвайт ссылка",
                    content: (
                        <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-400">
                            <li>Перейдите в раздел <b>Ресурсы</b> вкладка <b>Автопарк</b>.</li>
                            <li>Добавляйте новые машины (указав марку и категорию).</li>
                            <li>Чтобы привязать водителя к машине, нажмите "Управление", сгенерируйте ссылку и отправьте водителю. После перехода по ссылке водитель сможет отмечаться "Свободным".</li>
                        </ul>
                    )
                }
            ]
        },
        {
            title: "Статусы и Уведомления",
            icon: BellRing,
            minLevel: 1,
            blocks: [
                {
                    title: "Кнопка «Свободен»",
                    highlight: true,
                    searchText: "свободен освободить техника статус завершить",
                    content: (
                        <>
                            <p>Система жестко контролирует занятость. Машину или бригаду нельзя назначить на новый объект в тот же день, если они числятся занятыми на другом.</p>
                            <ol className="list-decimal pl-5 space-y-2 mt-2 text-gray-600 dark:text-gray-400">
                                <li>Как только работа на объекте завершена, Водитель заходит на <b>Главную страницу</b>.</li>
                                <li>В карточке текущего наряда он нажимает зеленую кнопку <b>«Свободен»</b>.</li>
                                <li>Система попросит ввести слово "СВОБОДЕН" для подтверждения.</li>
                                <li>После этого машина становится доступной для других нарядов, а в общую группу Telegram прилетает уведомление 🟢.</li>
                            </ol>
                            <p className="mt-2 text-sm text-gray-500">Прораб также имеет кнопку для массового освобождения всех своих бригад на объекте.</p>
                        </>
                    )
                }
            ]
        }
    ];

    // Функция поиска
    const handleSearch = (e) => setSearchTerm(e.target.value.toLowerCase());

    const filteredData = guideData
        .filter(section => level >= section.minLevel)
        .map(section => {
            const filteredBlocks = section.blocks.filter(block =>
                block.title.toLowerCase().includes(searchTerm) ||
                block.searchText.toLowerCase().includes(searchTerm)
            );
            return { ...section, blocks: filteredBlocks };
        })
        .filter(section => section.blocks.length > 0);


    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 transition-colors">

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                            <Link className="w-8 h-8 text-blue-500" /> Справочник
                        </h1>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">Инструкции по работе с системой для вашей роли: <b className="text-blue-600 dark:text-blue-400">{role}</b></p>
                    </div>
                </div>

                {/* Строка поиска */}
                <div className="relative mb-10">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Найти инструкцию (например: как создать заявку, модерация, статус)..."
                        value={searchTerm}
                        onChange={handleSearch}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-white transition-all shadow-sm"
                    />
                </div>

                {filteredData.length === 0 ? (
                    <div className="text-center py-12">
                        <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">По вашему запросу ничего не найдено</h3>
                        <p className="text-sm text-gray-400 dark:text-gray-400">Попробуйте изменить поисковый запрос.</p>
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
            </div>
        </main>
    );
}
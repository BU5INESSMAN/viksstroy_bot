import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    KeyRound, UserCircle, ClipboardList, Truck, Calendar, LayoutGrid,
    Settings, Smartphone, Search, BellRing, Link2, Users, MapPin,
    ArrowRightLeft, FileText, Shield, Bot, ChevronDown, Wrench,
    HardHat, CheckCircle, Send, MessageCircle, BookOpen, Headphones
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { ROLE_NAMES } from '../utils/roleConfig';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Section({ icon: Icon, iconColor, title, roleHint, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <GlassCard className="overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 p-5 sm:p-6 text-left group"
            >
                <div className={`p-2.5 rounded-xl ${iconColor} flex-shrink-0`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{title}</h3>
                    {roleHint && <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">{roleHint}</p>}
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="px-5 sm:px-6 pb-6 text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-4">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </GlassCard>
    );
}

function Tip({ children }) {
    return (
        <div className="flex gap-2.5 p-3.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50 text-blue-700 dark:text-blue-300 text-xs font-medium">
            <span className="flex-shrink-0 mt-0.5">*</span>
            <span>{children}</span>
        </div>
    );
}

function RoleTable() {
    const roles = [
        { key: 'superadmin', access: 'Полный доступ ко всем функциям, настройки системы, журнал логов' },
        { key: 'boss', access: 'Всё кроме серверных логов, управление пользователями, рассылки' },
        { key: 'moderator', access: 'Модерация заявок, публикация, управление объектами и техникой' },
        { key: 'foreman', access: 'Создание заявок, управление бригадой, заполнение СМР' },
        { key: 'brigadier', access: 'Просмотр заявок, заполнение СМР' },
        { key: 'worker', access: 'Просмотр своих нарядов, освобождение бригады' },
        { key: 'driver', access: 'Просмотр своих нарядов, отметка "Свободен" по технике' },
    ];
    return (
        <div className="-mx-2 sm:mx-0 overflow-x-auto">
            <table className="w-full text-xs text-left">
                <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Роль</th>
                        <th className="px-3 py-2 font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Возможности</th>
                    </tr>
                </thead>
                <tbody>
                    {roles.map(r => (
                        <tr key={r.key} className="border-b border-gray-100 dark:border-gray-700/50">
                            <td className="px-3 py-2.5 font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">{ROLE_NAMES[r.key]}</td>
                            <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{r.access}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function Guide() {
    const [searchTerm, setSearchTerm] = useState('');
    const query = searchTerm.toLowerCase().trim();

    const sections = [
        {
            id: 'start', icon: KeyRound, iconColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            title: '1. Начало работы', roleHint: 'Все роли',
            keywords: 'регистрация вход telegram max привязка аккаунт код web профиль',
            content: (
                <>
                    <p><b>Регистрация через Telegram:</b> Найдите бота <a href="https://t.me/viksstroy_bot" className="text-blue-600 dark:text-blue-400 hover:underline font-medium" target="_blank" rel="noopener noreferrer">@viksstroy_bot</a> и отправьте <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">/start</code>.</p>
                    <p><b>Регистрация через MAX:</b> Найдите бота в MAX и отправьте <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">/start</code>.</p>
                    <p><b>Вход с компьютера:</b> Отправьте боту команду <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">/web</code> — получите 6-значный код. Введите его на сайте.</p>
                    <p><b>Связывание TG ↔ MAX:</b> Если вы используете оба мессенджера, привяжите второй аккаунт в разделе "Профиль" → "Привязка мессенджеров". Отправьте <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">/web</code> во втором боте и введите код.</p>
                    <p><b>Настройка профиля:</b> В разделе "Профиль" можно изменить ФИО, настроить уведомления по каждому мессенджеру отдельно, загрузить аватарку.</p>
                    <p><b>Сохранение сессии:</b> После входа сессия сохраняется в браузере на 30 дней — повторный ввод кода не требуется.</p>
                    <p><b>Навигация:</b> На мобильных устройствах используйте нижнее меню. На десктопе доступно боковое меню с возможностью свернуть его для экономии места.</p>
                    <Tip>Система не позволит отключить уведомления в обоих мессенджерах одновременно.</Tip>
                </>
            ),
        },
        {
            id: 'apps', icon: ClipboardList, iconColor: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
            title: '2. Заявки (Наряды)', roleHint: 'Прораб и выше',
            keywords: 'заявка наряд создание статус модерация одобрена опубликована работа завершена редактирование архив',
            content: (
                <>
                    <p><b>Создание заявки:</b> Нажмите синюю кнопку "+" в нижнем меню. Выберите дату, объект, бригады и технику с тайм-слотами.</p>
                    <p><b>Статусы заявок:</b></p>
                    <div className="flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/50">На модерации</span>
                        <span className="text-gray-400">→</span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">Одобрена</span>
                        <span className="text-gray-400">→</span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">Опубликована</span>
                        <span className="text-gray-400">→</span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">В работе</span>
                        <span className="text-gray-400">→</span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400 border border-gray-200 dark:border-gray-600/50">Завершена</span>
                    </div>
                    <p><b>Редактирование:</b> Откройте заявку и нажмите "Редактировать". Можно изменить дату, объект, состав бригад и технику.</p>
                    <p><b>Архивация:</b> Завершённые заявки можно отправить в архив кнопкой "В архив" на карточке. Из архива заявку можно восстановить обратно кнопкой "Восстановить".</p>
                    <p><b>Ручная смена статуса:</b> Прораб может перевести заявку в статус "В работе" или "Завершена" через модалку просмотра.</p>
                </>
            ),
        },
        {
            id: 'kanban', icon: LayoutGrid, iconColor: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
            title: '3. Канбан-доска', roleHint: 'Все роли',
            keywords: 'канбан доска колонки фильтр карточки модерация одобрены работе завершены',
            content: (
                <>
                    <p><b>4 колонки:</b> На модерации, Одобрены, В работе, Завершены. На десктопе все 4 видны одновременно, на мобильном — сворачиваются.</p>
                    <p><b>Фильтрация:</b> Прорабы видят только свои заявки. Модераторы и руководители видят все заявки.</p>
                    <p><b>Карточки:</b> Каждая карточка показывает объект, дату, бригады (с индикатором "Свободна"), технику. Нажмите на карточку для полного просмотра.</p>
                    <Tip>На мобильном колонки сворачиваются — нажмите на заголовок колонки, чтобы развернуть.</Tip>
                </>
            ),
        },
        {
            id: 'schedule', icon: Calendar, iconColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
            title: '4. Расстановка (Расписание)', roleHint: 'Модератор и выше',
            keywords: 'расстановка расписание публикация завтра schedule png картинка генерация автопубликация',
            content: (
                <>
                    <p><b>Автопубликация:</b> Система автоматически генерирует PNG-картинку расстановки и публикует её в группу (настраивается в Системе).</p>
                    <p><b>Кнопка "На завтра":</b> На странице "Заявки" нажмите "На завтра" для мгновенной генерации расстановки на следующий день.</p>
                    <p><b>Команда /schedule:</b> Отправьте в бота (TG или MAX) для получения текущей расстановки.</p>
                    <p><b>Публикация выбранных:</b> Выделите нужные заявки галочками и нажмите "Опубликовать". Система сгенерирует картинку и разошлёт уведомления участникам.</p>
                </>
            ),
        },
        {
            id: 'teams', icon: Users, iconColor: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
            title: '5. Бригады и команды', roleHint: 'Модератор и выше',
            keywords: 'бригада команда создание приглашение join код ссылка участники удаление освобождение',
            content: (
                <>
                    <p><b>Создание бригады:</b> На странице "Ресурсы" → вкладка "Бригады" → кнопка "Создать бригаду". Укажите название и пароль.</p>
                    <p><b>Приглашение участников:</b> Для каждой бригады генерируется уникальный код и ссылка-приглашение. Ссылка постоянная — не меняется при повторном нажатии. Отправьте ссылку рабочим.</p>
                    <p><b>Привязка через /join:</b> Участник отправляет команду <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">/join [код]</code> в бота. В MAX бот покажет inline-кнопки для выбора профиля.</p>
                    <p><b>Управление:</b> Можно добавлять и удалять участников, менять пароль, удалить бригаду.</p>
                    <p><b>Освобождение:</b> После завершения смены прораб нажимает "Освободить" у бригады. Бригада помечается как свободная в канбане.</p>
                </>
            ),
        },
        {
            id: 'equip', icon: Truck, iconColor: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
            title: '6. Техника', roleHint: 'Модератор и выше',
            keywords: 'техника добавление категория водитель приглашение тайм-слот бронирование освобождение госномер',
            content: (
                <>
                    <p><b>Добавление:</b> Страница "Ресурсы" → "Автопарк" → "Добавить". Укажите название, категорию, госномер.</p>
                    <p><b>Массовое добавление:</b> Кнопка "Массовая загрузка" — вставьте список техники (по одной на строку).</p>
                    <p><b>Категории:</b> Техника группируется по категориям (Самосвал, Кран, Экскаватор и т.д.). Фильтрация по вкладкам.</p>
                    <p><b>Привязка водителя:</b> Генерируется постоянный код приглашения (не меняется при повторном нажатии). Водитель присоединяется по ссылке или команде /join.</p>
                    <p><b>Тайм-слоты:</b> При создании заявки указывается время работы техники (с 08:00 до 17:00). Система проверяет пересечения.</p>
                    <p><b>Освобождение:</b> Водитель нажимает "Свободен" и вводит проверочное слово. Техника помечается как свободная.</p>
                </>
            ),
        },
        {
            id: 'exchange', icon: ArrowRightLeft, iconColor: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
            title: '7. Обмен техникой (Биржа)', roleHint: 'Прораб и выше',
            keywords: 'обмен биржа техника запрос принятие отклонение inline кнопки таймаут',
            content: (
                <>
                    <p><b>Как запросить обмен:</b> При создании/редактировании заявки, если техника занята — появится кнопка "Запросить обмен".</p>
                    <p><b>Уведомления:</b> Второй прораб получает inline-кнопки в боте: "Принять" / "Отклонить".</p>
                    <p><b>Таймаут:</b> Если прораб не ответил в течение 30 минут, обмен автоматически отклоняется.</p>
                    <p><b>Выбор:</b> Можно запросить обмен на конкретное время (тайм-слот) или на свободное окно.</p>
                </>
            ),
        },
        {
            id: 'objects', icon: MapPin, iconColor: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
            title: '8. Объекты (Строительные площадки)', roleHint: 'Модератор и выше',
            keywords: 'объект площадка создание редактирование ресурсы по умолчанию pdf смета архивация запрос',
            content: (
                <>
                    <p><b>Создание:</b> Страница "Объекты" → "Создать объект". Укажите название, адрес и обязательно добавьте план СМР (КП).</p>
                    <p><b>КП обязательна:</b> При создании объекта необходимо выбрать хотя бы одну работу из справочника КП. Без этого объект не будет создан.</p>
                    <p><b>Ресурсы по умолчанию:</b> К объекту можно привязать бригады и технику по умолчанию. При создании заявки они подставляются автоматически.</p>
                    <p><b>PDF-смета:</b> Загрузите PDF-файл сметы — система извлечёт позиции и автоматически подберёт работы из справочника КП.</p>
                    <p><b>Архивация:</b> Неактуальные объекты можно архивировать и позже восстановить.</p>
                    <p><b>Запрос на создание:</b> Прорабы могут запрашивать создание нового объекта. При одобрении модератор заполняет полную форму создания с обязательной КП.</p>
                </>
            ),
        },
        {
            id: 'kp', icon: FileText, iconColor: 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
            title: '9. Выполненные работы (СМР / КП)', roleHint: 'Бригадир и выше',
            keywords: 'смр кп выполненные работы отчёт заполнение дополнительные проверка одобрение excel экспорт справочник должники напоминания',
            content: (
                <>
                    <p><b>Заполнение СМР:</b> На странице "СМР" выберите заявку и заполните отчёт: основные и дополнительные работы, объёмы.</p>
                    <p><b>Дополнительные работы:</b> Можно добавить работы, не входящие в основную смету.</p>
                    <p><b>Проверка модератором:</b> После заполнения отчёт уходит на проверку. Модератор одобряет или возвращает на доработку.</p>
                    <p><b>Экспорт в Excel:</b> Готовые отчёты можно экспортировать в Excel-файл по выбранным заявкам.</p>
                    <p><b>Справочник КП:</b> Справочник позиций — импортируется из PDF-смет или заполняется вручную.</p>
                    <p><b>Должники:</b> Система отслеживает незаполненные СМР. Должники висят в списке до заполнения, даже после завершения наряда.</p>
                    <p><b>Напоминания:</b> Модератор может нажать "Напомнить" — прорабу придёт уведомление.</p>
                    <Tip>Время открытия СМР настраивается администратором в разделе "Система".</Tip>
                </>
            ),
        },
        {
            id: 'notifications', icon: BellRing, iconColor: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
            title: '10. Уведомления', roleHint: 'Все роли',
            keywords: 'уведомления telegram max канал категории фоновые push',
            content: (
                <>
                    <p><b>Каналы:</b> Уведомления отправляются в Telegram и/или MAX — зависит от настроек в профиле.</p>
                    <p><b>Категории уведомлений:</b></p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><b>Наряды:</b> новые, одобренные, опубликованные</li>
                        <li><b>Отчёты:</b> СМР на проверке, одобрены, возвращены</li>
                        <li><b>Ошибки:</b> системные ошибки (для администраторов)</li>
                        <li><b>Обмен:</b> запросы и результаты обмена техникой</li>
                        <li><b>Новые пользователи:</b> регистрации (для модераторов)</li>
                    </ul>
                    <p><b>Фоновые уведомления:</b> Отправляются асинхронно и не блокируют интерфейс.</p>
                </>
            ),
        },
        {
            id: 'system', icon: Settings, iconColor: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
            title: '11. Система (Администрирование)', roleHint: 'Супер-Админ / Руководитель',
            keywords: 'система настройки автоматизация пользователи связывание рассылка журнал логи симуляция хранение',
            content: (
                <>
                    <p><b>Настройки автоматизации:</b> авто-публикация расстановки, авто-старт нарядов, напоминания об освобождении, резервное копирование БД.</p>
                    <p><b>Управление пользователями:</b> Таблица всех пользователей, сгруппированная по ролям. Смена роли, бан, просмотр профилей.</p>
                    <p><b>Связывание аккаунтов:</b> Принудительная привязка TG ↔ MAX аккаунтов модератором.</p>
                    <p><b>Рассылка:</b> Отправка сообщений в группу или личные сообщения, с фильтром по ролям.</p>
                    <p><b>Журнал действий:</b> 70+ типов логируемых действий, фильтрация, хранение (настраиваемый срок).</p>
                    <p><b>Серверные логи:</b> Последние логи FastAPI-сервера для диагностики.</p>
                    <p><b>Симуляция ролей:</b> Просмотр интерфейса от имени любой роли без смены прав.</p>
                </>
            ),
        },
        {
            id: 'bots', icon: Bot, iconColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            title: '12. Боты (Telegram и MAX)', roleHint: 'Все роли',
            keywords: 'бот telegram max команды start web join schedule setchat inline кнопки',
            content: (
                <>
                    <p><b>Команды ботов:</b></p>
                    <div className="space-y-2">
                        <div className="flex items-start gap-2"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold flex-shrink-0">/start</code> <span>Регистрация и приветствие</span></div>
                        <div className="flex items-start gap-2"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold flex-shrink-0">/web</code> <span>Получить код авторизации для входа с ПК</span></div>
                        <div className="flex items-start gap-2"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold flex-shrink-0">/join [код]</code> <span>Привязка к бригаде или технике</span></div>
                        <div className="flex items-start gap-2"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold flex-shrink-0">/schedule</code> <span>Получить текущую расстановку</span></div>
                        <div className="flex items-start gap-2"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold flex-shrink-0">/setchat</code> <span>Установить чат для рассылки расстановок (модераторы)</span></div>
                    </div>
                    <p className="mt-3"><b>Inline-кнопки:</b> Используются для обмена техникой (принять/отклонить), публикации расстановки, привязки аккаунтов.</p>
                </>
            ),
        },
        {
            id: 'roles', icon: Shield, iconColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
            title: '13. Роли и доступ', roleHint: null,
            keywords: 'роли доступ суперадмин руководитель модератор прораб бригадир рабочий водитель',
            content: (
                <>
                    <p className="mb-3">В системе 7 уровней доступа. Каждая роль наследует возможности нижестоящих.</p>
                    <RoleTable />
                </>
            ),
        },
        {
            id: 'support', icon: Headphones, iconColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
            title: '14. Тех. поддержка', roleHint: 'Все роли',
            keywords: 'поддержка чат ии ассистент gemini вопрос помощь мессенджер telegram max',
            content: (
                <>
                    <p><b>ИИ-ассистент:</b> На странице "Поддержка" доступен чат с ИИ-ассистентом, который знает функции платформы и может ответить на вопросы.</p>
                    <p><b>История чата:</b> Все сообщения сохраняются — при повторном входе вы увидите предыдущую переписку.</p>
                    <p><b>Мессенджеры:</b> Если ИИ не смог помочь, внизу страницы есть кнопки для связи с человеком через Telegram или MAX.</p>
                    <p><b>Просмотр диалогов:</b> Руководители и Супер-Админы видят все обращения пользователей в разделе "Поддержка". Слева — список диалогов, справа — просмотр переписки (только чтение). Кнопка "Мой чат" переключает на собственный диалог с ИИ.</p>
                    <p><b>Уведомления:</b> При новом обращении (перерыв более 30 минут) руководители и супер-администраторы получают уведомление.</p>
                    <Tip>Ссылки на мессенджеры поддержки и API-ключ ИИ настраиваются в разделе "Система" (только Супер-Админ).</Tip>
                </>
            ),
        },
        {
            id: 'pwa', icon: Smartphone, iconColor: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
            title: '15. Установка на телефон (PWA)', roleHint: 'Все роли',
            keywords: 'установка телефон приложение pwa ios android iphone скачать домой экран',
            content: (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <h4 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Smartphone className="w-4 h-4" /> iPhone (Safari)</h4>
                        <ol className="list-decimal pl-4 space-y-1 text-xs">
                            <li>Откройте сайт в Safari</li>
                            <li>Нажмите "Поделиться"</li>
                            <li>Выберите "На экран Домой"</li>
                        </ol>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <h4 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Smartphone className="w-4 h-4" /> Android (Chrome)</h4>
                        <ol className="list-decimal pl-4 space-y-1 text-xs">
                            <li>Откройте сайт в Chrome</li>
                            <li>Нажмите три точки</li>
                            <li>Выберите "Добавить на гл. экран"</li>
                        </ol>
                    </div>
                </div>
            ),
        },
    ];

    const filtered = query
        ? sections.filter(s => s.title.toLowerCase().includes(query) || s.keywords.includes(query))
        : sections;

    return (
        <main className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24 pt-6">
            {/* Hero + Search */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 rounded-3xl shadow-xl p-8 md:p-10 text-white relative overflow-hidden">
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl" />
                <div className="absolute left-10 -bottom-20 w-40 h-40 bg-indigo-400 opacity-20 rounded-full blur-2xl" />
                <div className="relative z-10">
                    <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight flex items-center gap-3">
                        <BookOpen className="w-8 h-8 md:w-10 md:h-10" /> База знаний
                    </h1>
                    <p className="text-blue-100 text-sm md:text-base font-medium mb-8 leading-relaxed max-w-xl">
                        Полное руководство по платформе. 15 разделов, все функции от регистрации до администрирования.
                    </p>
                    <div className="relative max-w-xl">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="w-5 h-5 text-blue-300" />
                        </div>
                        <input
                            type="text"
                            placeholder="Поиск (заявка, бригада, уведомления...)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/20 transition-all font-medium"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-blue-200 hover:text-white transition-colors text-sm font-bold">
                                Сбросить
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Sections */}
            {filtered.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Ничего не найдено</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Попробуйте другой запрос.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filtered.map(s => (
                        <Section key={s.id} icon={s.icon} iconColor={s.iconColor} title={s.title} roleHint={s.roleHint} defaultOpen={filtered.length === 1}>
                            {s.content}
                        </Section>
                    ))}
                </div>
            )}
        </main>
    );
}

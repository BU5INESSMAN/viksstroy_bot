# Архитектура проекта ВИКС Расписание

## Внесенные изменения

Проведён полный рефакторинг фронтенда и бэкенда: монолитные компоненты разбиты на модульную feature-based архитектуру, а монолитный менеджер базы данных разделён на доменные репозитории через миксины. Все изменения являются чисто структурными — бизнес-логика, тексты и API-контракты не затронуты.

### Фаза 1 (фронтенд — Layout, Home):
- Из `Layout.jsx` извлечены 4 независимых компонента: Header, BottomNav, ProfileModal, SessionModal.
- Из `Home.jsx` извлечён компонент KanbanCol в отдельный файл.
- Утилитарные функции `getSmartDates` и `getTodayStr` вынесены в `utils/dateUtils.js`.
- Создана утилита `clipboard.js` для переиспользования логики копирования в буфер обмена.
- `Layout.jsx` и `Home.jsx` переписаны как чистые обёртки, импортирующие извлечённые компоненты.

### Фаза 2 (фронтенд — Equipment, Teams; бэкенд — репозитории):
- Из `Equipment.jsx` извлечены 4 компонента: EquipmentCard, AddEquipForm, BulkUploadForm, EquipmentInviteModal.
- Из `Teams.jsx` извлечены 4 компонента: TeamCard, CreateTeamModal, ManageTeamModal, TeamInviteModal.
- Локальные функции `copyToClipboard` в Equipment и Teams заменены на импорт из `utils/clipboard.js`.
- Монолитный `database/db_manager.py` (596 строк) разделён на 5 доменных репозиториев-миксинов: UsersRepoMixin, TeamsRepoMixin, EquipmentRepoMixin, AppsRepoMixin, LogsRepoMixin.
- `DatabaseManager` наследуется от всех миксинов — все `db.method_name()` вызовы в роутерах работают без изменений.

---

## Структура проекта (фронтенд)

### Утилиты

`frontend/src/utils/dateUtils.js` — Содержит функции `getSmartDates()` (генерация меток дат на ближайшие 3 дня) и `getTodayStr()` (получение текущей даты в формате YYYY-MM-DD с учётом часового пояса Asia/Barnaul). Используется в `Home.jsx`.

`frontend/src/utils/clipboard.js` — Содержит функцию `copyToClipboard(text, linkType, setCopiedLink)` для универсального копирования текста в буфер обмена с визуальным фидбеком. Используется в `EquipmentInviteModal` и `TeamInviteModal`.

### Layout (Каркас приложения)

`frontend/src/components/Layout.jsx` — Главная обёртка приложения. Управляет состоянием темы, сессии, профиля и глобального создания заявки. Импортирует и рендерит Header, BottomNav, ProfileModal, SessionModal. Передаёт через `<Outlet context>` функцию `openProfile`, а также состояние и сеттер `isGlobalCreateAppOpen`.

`frontend/src/features/layout/components/Header.jsx` — Верхняя панель сайта (шапка). Содержит логотип, гамбургер-меню с навигацией (Инструкция, Обновления, Техподдержка, Тема), а также баннер тестирования роли. Принимает пропсы: `isTMA`, `realRole`, `role`, `theme`, `toggleTheme`, `isMenuOpen`, `setIsMenuOpen`.

`frontend/src/features/layout/components/BottomNav.jsx` — Нижняя панель навигации (таббар). Отвечает за маршрутизацию между страницами: Главная, Заявки, Ресурсы, Модерация, Система, Профиль. Центральная кнопка "Создать" (для прорабов) открывает модалку создания заявки. Отображение кнопок зависит от роли пользователя.

`frontend/src/features/layout/components/ProfileModal.jsx` — Модальное окно профиля пользователя. Содержит: просмотр и редактирование ФИО, специальности, ссылки MAX; загрузку аватарки; настройки уведомлений (Telegram/MAX); привязку/отвязку мессенджеров через код; удаление пользователя. Самодостаточный компонент со своей логикой API-вызовов.

`frontend/src/features/layout/components/SessionModal.jsx` — Модальное окно истекшей сессии. Показывается при отсутствии `tg_id` в localStorage. Предлагает пользователю заново авторизоваться через мессенджер.

### Applications (Заявки / Наряды)

`frontend/src/features/applications/components/KanbanCol.jsx` — Колонка канбан-доски. Принимает массив заявок и рендерит карточки с информацией: адрес объекта, прораб, дата, список бригад (с отметкой "Свободна"), список техники (с отметкой об освобождении). Поддерживает сворачивание/разворачивание и пагинацию ("Показать все").

`frontend/src/pages/Home.jsx` — Главная страница-dashboard. Управляет состоянием заявок, формой создания/редактирования заявки, модалкой освобождения бригад/техники. Импортирует `KanbanCol` из `features/applications/` и утилиты дат из `utils/dateUtils.js`. Содержит канбан-доску (4 колонки), карточку текущих нарядов, карточку бригады, модалку создания заявки и модалку подтверждения освобождения.

### Equipment (Автопарк)

`frontend/src/pages/Equipment.jsx` — Страница управления автопарком. Чистая обёртка: хранит состояние (список техники, категории, активную вкладку, данные форм, инвайт-информацию), содержит обработчики API-запросов (fetchData, handleCreateEquip, handleBulkUpload, handleDeleteEquip, handleEquipStatusChange, handleUnlinkEquipment, generateInvite). Рендерит вкладки категорий, сетку карточек техники и импортированные компоненты: EquipmentCard, AddEquipForm, BulkUploadForm, EquipmentInviteModal.

`frontend/src/features/equipment/components/EquipmentCard.jsx` — Карточка единицы техники в сетке. Отображает: категорию, статус (Свободна/В работе/Ремонт) с цветовыми бейджами, название, ФИО водителя. Кнопки действий (для ролей с правами): Профиль, Отвязать водителя / Дать доступ, В ремонт / В строй, Удалить. Принимает пропсы: `eq`, `canManageEquipment`, `canDeleteEquipment`, `openProfile`, `handleUnlinkEquipment`, `generateInvite`, `handleEquipStatusChange`, `handleDeleteEquip`.

`frontend/src/features/equipment/components/AddEquipForm.jsx` — Форма добавления единицы техники. Поля: название (марка, гос.номер), категория (выбор из существующих или создание новой), ФИО водителя. Принимает пропсы: `newEquip`, `setNewEquip`, `customCategory`, `setCustomCategory`, `categories`, `handleCreateEquip`.

`frontend/src/features/equipment/components/BulkUploadForm.jsx` — Форма массовой загрузки техники. Содержит пример формата ввода и текстовое поле для вставки списка (формат: Категория | Название | ФИО водителя). Принимает пропсы: `bulkText`, `setBulkText`, `handleBulkUpload`.

`frontend/src/features/equipment/components/EquipmentInviteModal.jsx` — Модальное окно приглашения водителя. Содержит три способа передачи ссылки: Telegram, Web, MAX (команда `/join`). Кнопка "Скопировать всё сообщение" формирует полный текст приглашения. Использует `copyToClipboard` из `utils/clipboard.js`. Принимает пропсы: `inviteInfo`, `setInviteInfo`, `copiedLink`, `setCopiedLink`.

### Teams (Бригады)

`frontend/src/pages/Teams.jsx` — Страница управления бригадами. Чистая обёртка: хранит состояние (список бригад, модалки, данные форм, инвайт-информацию), содержит обработчики API-запросов (fetchData, handleCreateTeam, handleDeleteTeam, openManageModal, handleAddMember, toggleForeman, handleUnlinkMember, deleteMember, generateInvite). Рендерит сетку карточек бригад и импортированные компоненты: TeamCard, CreateTeamModal, ManageTeamModal, TeamInviteModal.

`frontend/src/features/teams/components/TeamCard.jsx` — Карточка бригады в сетке. Отображает название бригады, количество участников. Кнопки: Управление, Удалить (для ролей moderator/boss/superadmin). Принимает пропсы: `t`, `canDeleteTeam`, `openManageModal`, `handleDeleteTeam`.

`frontend/src/features/teams/components/CreateTeamModal.jsx` — Модальное окно создания бригады. Содержит поле ввода названия и кнопку подтверждения. Принимает пропсы: `isTeamModalOpen`, `setTeamModalOpen`, `newTeamName`, `setNewTeamName`, `handleCreateTeam`.

`frontend/src/features/teams/components/ManageTeamModal.jsx` — Модальное окно управления бригадой. Содержит: блок генерации инвайт-ссылки, форму ручного добавления участника (ФИО + должность), список состава бригады с действиями для каждого участника (Профиль, Отвязать, назначить/снять Бригадира, Удалить). Принимает пропсы: `isManageModalOpen`, `setManageModalOpen`, `manageTeamData`, `canManage`, `generateInvite`, `newMember`, `setNewMember`, `handleAddMember`, `toggleForeman`, `handleUnlinkMember`, `deleteMember`, `openProfile`.

`frontend/src/features/teams/components/TeamInviteModal.jsx` — Модальное окно приглашения рабочего в бригаду. Содержит три способа передачи ссылки: Telegram, Web, MAX (команда `/join`). Кнопка "Скопировать всё сообщение" формирует полный текст приглашения. Использует `copyToClipboard` из `utils/clipboard.js`. Принимает пропсы: `inviteInfo`, `setInviteInfo`, `copiedLink`, `setCopiedLink`.

### Прочие страницы (без изменений)

`frontend/src/pages/Login.jsx` — Страница входа в систему.

`frontend/src/pages/TMAAuth.jsx` — Авторизация через Telegram Mini App.

`frontend/src/pages/MAXAuth.jsx` — Авторизация через мессенджер MAX.

`frontend/src/pages/JoinTeam.jsx` — Страница присоединения к бригаде по инвайт-коду.

`frontend/src/pages/JoinEquipment.jsx` — Страница привязки водителя к технике по инвайт-коду.

`frontend/src/pages/MyApps.jsx` — Страница "Мои заявки" для рабочих/водителей/прорабов.

`frontend/src/pages/Review.jsx` — Страница модерации заявок (для модераторов и руководства).

`frontend/src/pages/Resources.jsx` — Объединённая страница ресурсов (бригады + автопарк).

`frontend/src/pages/System.jsx` — Страница системных настроек.

`frontend/src/pages/Guide.jsx` — Страница инструкции.

`frontend/src/pages/Updates.jsx` — Страница обновлений.

`frontend/src/App.jsx` — Корневой компонент маршрутизации. Определяет публичные и защищённые маршруты, оборачивает защищённые в `Layout`.

`frontend/src/main.jsx` — Точка входа приложения (ReactDOM.createRoot).

---

## Структура проекта (бэкенд)

### База данных — доменные репозитории

`database/db_manager.py` — Центральный менеджер базы данных. Класс `DatabaseManager` наследуется от пяти миксинов-репозиториев. Содержит: `__init__` (подключение), `init_db` (создание таблиц, миграции), `close`, методы миграции (`upgrade_db_for_invites`, `upgrade_db_for_logs`, `upgrade_db_for_profiles`, `upgrade_db_for_foreman`), а также кросс-доменные методы (`get_foremen_count`, `get_today_apps_count`, `get_missing_foremen_today`, `get_general_statistics`).

`database/users_repo.py` — Миксин `UsersRepoMixin`. Методы работы с пользователями: `get_user`, `add_user`, `get_all_users`, `update_user_role`, `toggle_user_status`, `increment_failed_attempts`, `get_user_full_profile`, `update_user_profile_data`, `update_user_avatar`, `get_admins_and_moderators`, `get_specific_user_logs`.

`database/teams_repo.py` — Миксин `TeamsRepoMixin`. Методы работы с бригадами и их участниками: `create_empty_team`, `update_team_name`, `delete_team`, `get_all_teams`, `get_team`, `get_team_full_data`, `get_team_members`, `add_team_member`, `remove_team_member`, `get_or_create_team_invite`, `generate_team_invite`, `get_team_by_invite`, `get_unclaimed_workers`, `claim_worker_slot`, `get_member`, `update_member`, `get_or_create_invite_code`, `get_member_by_invite`, `register_member_tg`.

`database/equipment_repo.py` — Миксин `EquipmentRepoMixin`. Методы работы с техникой: `get_equipment`, `get_equipment_by_category`, `get_all_equipment_admin`, `get_equipment_categories`, `get_equipment_busy_intervals`, `add_equipment`, `add_equipment_bulk`, `update_equipment`, `delete_equipment`, `toggle_equipment_status`.

`database/apps_repo.py` — Миксин `AppsRepoMixin`. Методы работы с заявками: `save_application`, `get_application_details`, `update_app_status`, `get_pending_applications`, `get_user_applications`, `get_daily_report`, `get_object_history`, `get_app_members_with_tg`, `get_approved_apps_for_publish`, `mark_app_as_published`.

`database/logs_repo.py` — Миксин `LogsRepoMixin`. Методы работы с журналом действий: `add_log`, `get_recent_logs`.

### Веб-сервер

`web/api_main.py` — Точка входа FastAPI-приложения. Подключает роутеры, CORS, обработку ошибок, startup/shutdown.

`web/database_deps.py` — Глобальный экземпляр `DatabaseManager` и часовой пояс. Импортируется всеми роутерами. Экземпляр `db` содержит все методы через наследование от миксинов.

`web/routers/auth.py` — Эндпоинты авторизации (Telegram, TMA, MAX, код привязки).

`web/routers/dashboard.py` — Эндпоинты дашборда, настроек, cron-задач.

`web/routers/users.py` — Эндпоинты управления профилями пользователей.

`web/routers/teams.py` — Эндпоинты управления бригадами и инвайтами.

`web/routers/equipment.py` — Эндпоинты управления автопарком.

`web/routers/applications.py` — Эндпоинты CRUD заявок, модерации, публикации, освобождения.

`web/utils.py` — Утилиты бэкенда (уведомления).

`web/scheduler.py` — Планировщик задач (APScheduler).

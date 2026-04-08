# Архитектура проекта ВИКС Расписание

## Общее описание

Система управления строительными нарядами и ресурсами. Включает бэкенд на FastAPI + SQLite, фронтенд на React + Vite, и ботов для Telegram (aiogram) и MAX (maxapi). Поддерживает роли: superadmin, boss, moderator, foreman, worker, driver.

---

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

### Фаза 3 (фронтенд — глубокий рефакторинг Home.jsx):
- Из `Home.jsx` извлечены 4 крупных компонента в `features/applications/components/`:
  - `ActiveApplicationsCard.jsx` — карточка текущих нарядов с логикой освобождения бригад и техники.
  - `MyTeamCard.jsx` — карточка состава бригады текущего пользователя.
  - `CreateAppModal.jsx` — модальное окно создания/просмотра/редактирования заявки (выбор объекта, бригад, техники, рабочих, подстановка ресурсов по умолчанию).
  - `ConfirmFreeModal.jsx` — модальное окно подтверждения освобождения (ввод слова «свободен»).
- `Home.jsx` переписан как чистая обёртка: хранит состояние и обработчики, передаёт пропсы в извлечённые компоненты.

---

## Структура проекта (бэкенд)

### Точки входа

`main.py` — Telegram-бот на aiogram. Обработка команд `/start` (регистрация с паролем и deep links для приглашений `invite_{code}` и `equip_{code}`), `/web` (генерация 6-значного одноразового кода для веб-авторизации). Встроенный планировщик APScheduler: утренняя публикация нарядов (7:00), вечернее завершение (23:00), ежечасная проверка тайм-аутов (8:00–22:00), резервное копирование БД (3:00). Поддержка привязки аккаунтов (account_links) и кодов связи.

`main_max.py` — MAX-бот на maxapi. Аналог Telegram-бота для платформы MAX. Команды: `/start`, `/web`, `/join [код]`, `/setchat` (привязка группы MAX для публикации нарядов). Обработка кнопок (ButtonsPayload, CallbackButton) для выбора рабочих и техники. Хранение состояний в памяти (USER_STATES). Извлечение chat_id для личных диалогов.

### Веб-сервер (FastAPI)

`web/api_main.py` — Точка входа FastAPI-приложения. Подключает 8 роутеров (`/api/auth`, `/api/dashboard`, `/api/users`, `/api/teams`, `/api/equipment`, `/api/applications`, `/api/objects`, `/api/kp`). Настраивает CORS, монтирует статические файлы (`data/uploads`). Инициализация: создание БД, таблиц веб-кодов/привязок, запуск планировщика, импорт КП-каталога из CSV. Глобальный обработчик ошибок с отправкой критических ошибок в Telegram-группу отчётов.

`web/database_deps.py` — Глобальный экземпляр `DatabaseManager` и часовой пояс `TZ_BARNAUL` (Asia/Barnaul). Импортируется всеми роутерами для доступа к БД.

`web/scheduler.py` — Планировщик задач на APScheduler с тремя триггерами. Триггер 1 (auto_publish_time): публикация одобренных нарядов на сегодня с рассылкой уведомлений участникам (рабочие, водители, прорабы). Триггер 2 (auto_complete_time): автоматическое завершение нарядов в статус `pending_report`, напоминание прорабам о заполнении табелей. Триггер 3 (foreman_reminder_time): ежедневное напоминание прорабам заполнить заявки (с учётом выходных).

`web/utils.py` — Утилиты бэкенда. Функции: `resolve_id()`, `get_all_linked_ids()` — разрешение связанных аккаунтов TG/MAX; `fetch_teams_dict()`, `enrich_app_with_team_name()` — обогащение заявок данными о бригадах; `process_base64_image()` — сохранение аватаров/фото; `notify_users()` — универсальная рассылка в Telegram и MAX с учётом настроек пользователя; `execute_app_publish()` — генерация PNG-изображения наряда и публикация в группы; `create_app_image()` — рисование изображения наряда с логотипом и деталями (PIL).

### Роутеры

`web/routers/auth.py` — Эндпоинты аутентификации. `POST /api/auth/code` — авторизация по 6-значному коду (для веб). `POST /api/users/link_account` — привязка вторичного аккаунта (MAX→TG). `POST /api/users/unlink_platform` — отвязка платформы. `POST /api/max/web_auth` — веб-аутентификация для MAX. `POST /api/max/auth`, `POST /api/max/register` — аутентификация и регистрация MAX с паролем. `POST /api/telegram_auth` — Telegram Web App аутентификация (HMAC-SHA256). `POST /api/tma/auth` — аутентификация из Telegram Mini App. `POST /api/register_telegram` — регистрация в Telegram с паролем.

`web/routers/dashboard.py` — Главная панель управления. `GET /api/dashboard` — полные данные для дашборда (статистика, бригады, техника, заявки за 14 дней, адреса). `GET /api/logs` — последние 50 логов. `GET /api/settings` — системные настройки. `POST /api/settings/update` — обновление настроек (moderator+). `POST /api/cron/start_day` — ручная публикация нарядов. `POST /api/cron/end_day` — завершение дневных нарядов. `POST /api/cron/check_timeouts` — проверка просроченных ресурсов. `POST /api/system/test_notification` — тестовое уведомление с фото наряда.

`web/routers/users.py` — Управление пользователями. `GET /api/users` — список пользователей. `GET /api/users/{target_id}/profile` — полный профиль (бригада, техника, привязки, уведомления). `POST /api/users/{target_id}/update_profile` — обновление ФИО, роли, позиции, настроек уведомлений. `POST /api/users/{target_id}/update_avatar` — загрузка аватара (base64→PNG). `POST /api/users/{target_id}/delete` — удаление пользователя (boss/superadmin).

`web/routers/teams.py` — Управление бригадами. `POST /api/teams/create` — создание бригады. `GET /api/teams/{team_id}/details` — детали бригады с составом. `POST /api/teams/{team_id}/members/add` — добавление рабочего. `POST /api/teams/members/{member_id}/toggle_foreman` — переключение статуса бригадира. `POST /api/teams/members/{member_id}/unlink` — отвязка рабочего. `POST /api/teams/members/{member_id}/delete` — удаление рабочего. `POST /api/teams/{team_id}/delete` — удаление бригады (moderator+). `POST /api/teams/{team_id}/generate_invite` — генерация ссылки и пароля. `GET /api/invite/{invite_code}` — информация по коду. `POST /api/invite/join` — привязка рабочего по коду.

`web/routers/equipment.py` — Управление автопарком. `GET /api/equipment/admin_list` — список техники. `POST /api/equipment/add` — добавление машины. `POST /api/equipment/bulk_add` — массовая загрузка (JSON array). `POST /api/equipment/{equip_id}/update` — редактирование. `POST /api/equipment/{equip_id}/update_photo` — загрузка фото (base64). `POST /api/equipment/{equip_id}/delete` — удаление. `POST /api/equipment/{equip_id}/status` — смена статуса (free/repair/work). `POST /api/equipment/{equip_id}/unlink` — отвязка водителя. `POST /api/equipment/{equip_id}/generate_invite` — генерация кода. `GET /api/equipment/invite/{invite_code}` — информация. `POST /api/equipment/invite/join` — привязка водителя. `POST /api/equipment/set_free` — освобождение техники водителем.

`web/routers/applications.py` — Ядро системы: управление заявками (нарядами). `POST /api/applications/check_availability` — проверка занятости бригад/техники. `POST /api/applications/create` — создание заявки с проверкой конфликтов. `POST /api/applications/{app_id}/update` — редактирование (статус waiting). `POST /api/applications/{app_id}/delete` — полное удаление с освобождением техники. `GET /api/applications/review` — заявки для модерации. `POST /api/applications/{app_id}/review` — смена статуса (approved/rejected/completed) с уведомлениями. `POST /api/applications/publish` — ручная публикация в группы. `GET /api/applications/active` — активные наряды текущего пользователя. `GET /api/applications/my` — завершённые наряды. `POST /api/applications/{app_id}/free_equipment` — освобождение техники водителем. `POST /api/applications/{app_id}/free_team` — освобождение бригады (частичное или полное).

`web/routers/objects.py` — Управление объектами. `GET /api/objects` — список объектов (с фильтром archived). `GET /api/objects/active` — только активные. `POST /api/objects/create` — создание. `POST /api/objects/{obj_id}/update` — обновление с назначением бригад/техники по умолчанию. `POST /api/objects/{obj_id}/archive` — архивирование. `POST /api/objects/{obj_id}/restore` — восстановление. `GET /api/kp/catalog` — глобальный справочник КП. `GET /api/objects/{obj_id}/kp` — план КП объекта. `POST /api/objects/{obj_id}/kp/update` — перезапись плана КП.

`web/routers/kp.py` — Управление сметами (КП). `GET /api/kp/dashboard` — заявки по вкладкам (к заполнению / на проверку / одобренные) в зависимости от роли. `GET /api/kp/apps/{app_id}/items` — план КП и введённые объёмы. `POST /api/kp/apps/{app_id}/submit` — сохранение объёмов (автоматическое одобрение для foreman+). `POST /api/kp/apps/{app_id}/review` — одобрение/отклонение. `POST /api/kp/apps/{app_id}/update_volumes` — редактирование цифр в одобренной смете (только офис). `POST /api/kp/export` — массовый экспорт в Excel (pandas/openpyxl).

### База данных — доменные репозитории

`database/schema.sql` — SQL-схема: 13 таблиц. `users` (роль, блокировка, уведомления, аватар), `teams` (код приглашения, пароль, создатель), `team_members` (позиция, tg_user_id, is_foreman), `equipment` (статус, tg_id, фото, invite_code), `applications` (статус, selected_members TEXT, equipment_data JSON, is_team_freed, freed_team_ids, kp_status), `application_selected_staff`, `logs`, `web_codes`, `account_links`, `link_codes`, `objects` (default_team_ids, default_equip_ids, is_archived), `kp_catalog` (category, unit, salary, price), `object_kp_plan`, `application_kp` (volume, current_salary, current_price).

`database/db_manager.py` — Центральный менеджер `DatabaseManager`, наследуется от 7 миксинов: UsersRepoMixin, TeamsRepoMixin, EquipmentRepoMixin, AppsRepoMixin, LogsRepoMixin, ObjectsRepoMixin, KpRepoMixin. Содержит `init_db()` (aiosqlite, schema.sql, автомиграции ALTER TABLE, импорт КП из CSV), `close()`, а также кросс-доменные методы: `get_foremen_count()`, `get_today_apps_count()`, `get_missing_foremen_today()`, `get_general_statistics()`.

`database/users_repo.py` — Миксин `UsersRepoMixin`. Методы: `get_user`, `add_user` (INSERT OR REPLACE), `get_all_users`, `update_user_role`, `toggle_user_status`, `increment_failed_attempts`, `get_user_full_profile` (с бригадой и позицией), `update_user_profile_data` (синхронизация с team_members), `update_user_avatar`, `get_admins_and_moderators`, `get_specific_user_logs`.

`database/teams_repo.py` — Миксин `TeamsRepoMixin`. Методы: `create_empty_team`, `update_team_name`, `delete_team`, `get_all_teams`, `get_team`, `get_team_full_data`, `get_team_members`, `add_team_member`, `remove_team_member`, `get_or_create_team_invite`, `generate_team_invite`, `get_team_by_invite`, `get_unclaimed_workers`, `claim_worker_slot`, `get_member`, `update_member`, `get_or_create_invite_code`, `get_member_by_invite`, `register_member_tg`.

`database/equipment_repo.py` — Миксин `EquipmentRepoMixin`. Методы: `get_equipment`, `get_equipment_by_category`, `get_all_equipment_admin`, `get_equipment_categories`, `get_equipment_busy_intervals`, `add_equipment`, `add_equipment_bulk`, `update_equipment`, `delete_equipment`, `toggle_equipment_status`.

`database/apps_repo.py` — Миксин `AppsRepoMixin`. Методы: `save_application`, `get_application_details`, `update_app_status`, `get_pending_applications`, `get_user_applications`, `get_daily_report`, `get_object_history`, `get_app_members_with_tg`, `get_approved_apps_for_publish`, `mark_app_as_published`, `check_resource_availability` (проверка конфликтов бригад/техники).

`database/logs_repo.py` — Миксин `LogsRepoMixin`. Методы: `add_log` (запись с временной меткой), `get_recent_logs` (последние N записей).

`database/objects_repo.py` — Миксин `ObjectsRepoMixin`. Методы: `get_objects`, `create_object`, `update_object` (с ресурсами по умолчанию), `archive_object`, `restore_object`, `get_kp_catalog`, `get_object_kp_plan`, `add_kp_to_object`.

`database/kp_repo.py` — Миксин `KpRepoMixin`. Методы: `get_kp_dashboard_apps` (распределение по вкладкам), `get_app_kp_items`, `submit_kp_report` (с условным одобрением для foreman+), `review_kp_report`, `update_kp_volumes_only`, `generate_mass_excel` (Excel через pandas/openpyxl).

---

## Структура проекта (фронтенд)

### Точка входа и маршрутизация

`frontend/src/main.jsx` — Точка входа приложения (ReactDOM.createRoot, Vite).

`frontend/src/App.jsx` — Корневой компонент маршрутизации (React Router v6). Публичные маршруты: `/` (Login), `/tma` (TMAAuth), `/max` (MAXAuth), `/invite/:code` (JoinTeam), `/equip-invite/:code` (JoinEquipment). Защищённые маршруты (в Layout): `/dashboard` (Home), `/guide` (Guide), `/updates` (Updates), `/system` (System), `/my-apps` (MyApps), `/review` (Review), `/resources` (Resources), `/objects` (Objects), `/kp` (KP). Компонент `ProtectedRoute` проверяет наличие `user_role` в localStorage.

### Утилиты

`frontend/src/utils/dateUtils.js` — Функции `getSmartDates()` (генерация меток дат «Сегодня / Завтра / Послезавтра» на 3 дня) и `getTodayStr()` (текущая дата YYYY-MM-DD в часовом поясе Asia/Barnaul).

`frontend/src/utils/clipboard.js` — Функция `copyToClipboard(text, linkType, setCopiedLink)` для копирования в буфер обмена с визуальным фидбеком (сброс через 2 сек).

### Layout (Каркас приложения)

`frontend/src/components/Layout.jsx` — Главная обёртка приложения. Управляет состоянием темы (system/light/dark), сессии, профиля, глобального создания заявки. Импортирует и рендерит Header, BottomNav, ProfileModal, SessionModal. Передаёт через `<Outlet context>`: `openProfile(targetId, entityType, entityId)`, `isGlobalCreateAppOpen`, `setGlobalCreateAppOpen`.

`frontend/src/features/layout/components/Header.jsx` — Шапка приложения. Логотип (mask-image из logo.png), гамбургер-меню с навигацией (Инструкция, Обновления, Техподдержка, Тема), переключение темы (Sun/Moon/Monitor), баннер тестирования роли. Пропсы: `isTMA`, `realRole`, `role`, `theme`, `toggleTheme`, `isMenuOpen`, `setIsMenuOpen`.

`frontend/src/features/layout/components/BottomNav.jsx` — Нижняя навигация (таббар). Кнопки: Главная, Объекты (foreman+), Ресурсы (foreman+), центральная кнопка «Создать» (foreman+, открывает модалку заявки), Заявки (my-apps или review в зависимости от роли), Система (moderator+), Профиль. Адаптивное поведение.

`frontend/src/features/layout/components/ProfileModal.jsx` — Модальное окно профиля. Просмотр и редактирование ФИО, специальности; загрузка аватара (base64→PNG); переключение уведомлений (notify_tg, notify_max); привязка/отвязка платформ (TG/MAX) через код; удаление пользователя (boss/superadmin). Самодостаточный компонент с собственными API-вызовами.

`frontend/src/features/layout/components/SessionModal.jsx` — Модальное окно истекшей сессии. Показывается при отсутствии `tg_id` в localStorage. Предлагает авторизоваться через мессенджер.

### Applications (Заявки / Наряды)

`frontend/src/pages/Home.jsx` — Главная страница-dashboard. Чистая обёртка: управляет состоянием заявок (`appForm`, `freeModal`, `activeApps`, `data`), формой создания/редактирования, обработчиками (`fetchData`, `handleCreateApp`, `handleDeleteApp`, `handleApplyDefaults`, `toggleTeamSelection`, `toggleAppMember`, `checkTeamStatus`, `checkEquipStatus`, `toggleEquipmentSelection`, `executeFree`). Рендерит канбан-доску (4 колонки KanbanCol) и импортированные компоненты: ActiveApplicationsCard, MyTeamCard, CreateAppModal, ConfirmFreeModal.

`frontend/src/features/applications/components/KanbanCol.jsx` — Колонка канбан-доски. Принимает массив заявок, рендерит карточки с информацией (адрес объекта, прораб, дата, бригады с отметкой «Свободна», техника). Поддерживает сворачивание/разворачивание и пагинацию («Показать все», до 10 карточек). Пропсы: `title`, `icon`, `colorClass`, `apps`, `isOpen`, `toggleOpen`, `onAppClick`.

`frontend/src/features/applications/components/ActiveApplicationsCard.jsx` — Карточка «Текущие наряды». Отображает список активных нарядов пользователя с деталями: дата, адрес объекта, прораб (кликабельный для просмотра профиля), список техники (с отметкой об освобождении), состав бригад с кнопками «Освободить» для прорабов. Глобальные кнопки: «Свободен» для водителя, «Освободить ВСЕ бригады» для прораба при нескольких бригадах. Пропсы: `activeApps`, `role`, `tgId`, `openProfile`, `openFreeModal`.

`frontend/src/features/applications/components/MyTeamCard.jsx` — Карточка состава бригады текущего пользователя. Отображает список участников бригады: ФИО, должность, отметка «Бригадир». Скроллируемый список (max-h-72). Пропсы: `myTeam`.

`frontend/src/features/applications/components/CreateAppModal.jsx` — Модальное окно создания/просмотра/редактирования заявки. Включает: выбор даты выезда (с кнопками быстрого доступа «Сегодня/Завтра/Послезавтра»), выбор объекта из списка, подстановка ресурсов по умолчанию (бригады/техника объекта с проверкой занятости), выбор бригад (с индикацией busy/free), выбор конкретных рабочих из бригад, выбор техники по категориям (с индикацией repair/busy/free), ввод времени работы техники (С/ДО), комментарий. В режиме просмотра (isViewOnly): кнопки профилей рабочих, кнопки освобождения бригад, кнопка удаления заявки (superadmin/boss/moderator), кнопка перехода в режим редактирования (статус waiting). Пропсы: `appForm`, `setAppForm`, `isSubmitting`, `setGlobalCreateAppOpen`, `handleCreateApp`, `handleDeleteApp`, `handleFormChange`, `handleApplyDefaults`, `smartDates`, `objectsList`, `data`, `role`, `toggleTeamSelection`, `toggleAppMember`, `checkTeamStatus`, `checkEquipStatus`, `toggleEquipmentSelection`, `updateEquipmentTime`, `activeEqCategory`, `setActiveEqCategory`, `teamMembers`, `openProfile`, `openFreeModal`.

`frontend/src/features/applications/components/ConfirmFreeModal.jsx` — Модальное окно подтверждения освобождения. Требует ввод слова «свободен» для подтверждения. Используется для освобождения бригады (specific_team, team) или техники (equipment). Пропсы: `freeModal`, `setFreeModal`, `isSubmitting`, `executeFree`.

### Equipment (Автопарк)

`frontend/src/pages/Equipment.jsx` — Страница управления автопарком. Чистая обёртка: хранит состояние (список техники, категории, активную вкладку, данные форм, инвайт-информацию), содержит обработчики API-запросов (fetchData, handleCreateEquip, handleBulkUpload, handleDeleteEquip, handleEquipStatusChange, handleUnlinkEquipment, generateInvite). Вкладки: список техники с фото, форма одиночного добавления, форма массовой загрузки. Рендерит: EquipmentCard, AddEquipForm, BulkUploadForm, EquipmentInviteModal.

`frontend/src/features/equipment/components/EquipmentCard.jsx` — Карточка единицы техники. Отображает: категорию, статус (Свободна/В работе/Ремонт) с цветовыми бейджами, название, ФИО водителя. Кнопки действий (для ролей с правами): Профиль, Отвязать водителя / Дать доступ, В ремонт / В строй, Удалить. Пропсы: `eq`, `canManageEquipment`, `canDeleteEquipment`, `openProfile`, `handleUnlinkEquipment`, `generateInvite`, `handleEquipStatusChange`, `handleDeleteEquip`.

`frontend/src/features/equipment/components/AddEquipForm.jsx` — Форма добавления единицы техники. Поля: название (марка, гос.номер), категория (выбор из существующих или создание новой), ФИО водителя. Пропсы: `newEquip`, `setNewEquip`, `customCategory`, `setCustomCategory`, `categories`, `handleCreateEquip`.

`frontend/src/features/equipment/components/BulkUploadForm.jsx` — Форма массовой загрузки техники. Пример формата и текстовое поле (формат: Категория | Название | ФИО водителя). Пропсы: `bulkText`, `setBulkText`, `handleBulkUpload`.

`frontend/src/features/equipment/components/EquipmentInviteModal.jsx` — Модальное окно приглашения водителя. Три способа: Telegram (deep link), Web (URL), MAX (команда `/join`). Кнопка «Скопировать всё сообщение». Использует `copyToClipboard` из `utils/clipboard.js`. Пропсы: `inviteInfo`, `setInviteInfo`, `copiedLink`, `setCopiedLink`.

### Teams (Бригады)

`frontend/src/pages/Teams.jsx` — Страница управления бригадами. Чистая обёртка: хранит состояние (список бригад, модалки, данные форм, инвайт-информацию), содержит обработчики API-запросов (fetchData, handleCreateTeam, handleDeleteTeam, openManageModal, handleAddMember, toggleForeman, handleUnlinkMember, deleteMember, generateInvite). Рендерит: TeamCard, CreateTeamModal, ManageTeamModal, TeamInviteModal.

`frontend/src/features/teams/components/TeamCard.jsx` — Карточка бригады в сетке. Название бригады, количество участников. Кнопки: Управление, Удалить (moderator/boss/superadmin). Пропсы: `t`, `canDeleteTeam`, `openManageModal`, `handleDeleteTeam`.

`frontend/src/features/teams/components/CreateTeamModal.jsx` — Модальное окно создания бригады. Поле ввода названия и кнопка подтверждения. Пропсы: `isTeamModalOpen`, `setTeamModalOpen`, `newTeamName`, `setNewTeamName`, `handleCreateTeam`.

`frontend/src/features/teams/components/ManageTeamModal.jsx` — Модальное окно управления бригадой. Блок генерации инвайт-ссылки, форма ручного добавления участника (ФИО + должность), список состава с действиями (Профиль, Отвязать, назначить/снять Бригадира, Удалить). Пропсы: `isManageModalOpen`, `setManageModalOpen`, `manageTeamData`, `canManage`, `generateInvite`, `newMember`, `setNewMember`, `handleAddMember`, `toggleForeman`, `handleUnlinkMember`, `deleteMember`, `openProfile`.

`frontend/src/features/teams/components/TeamInviteModal.jsx` — Модальное окно приглашения рабочего. Три способа: Telegram (deep link), Web (URL), MAX (команда `/join`). Кнопка «Скопировать всё сообщение». Использует `copyToClipboard` из `utils/clipboard.js`. Пропсы: `inviteInfo`, `setInviteInfo`, `copiedLink`, `setCopiedLink`.

### Прочие страницы

`frontend/src/pages/Login.jsx` — Страница входа. Инструкция по получению кода (команда `/web` в боте), ввод 6-значного кода, POST на `/api/auth/code`, сохранение `role` и `tg_id` в localStorage, редирект на `/dashboard`.

`frontend/src/pages/TMAAuth.jsx` — Аутентификация через Telegram Mini App. Извлечение данных из `window.Telegram.WebApp.initDataUnsafe`. Если пользователь существует — автовход; если новый — запрос пароля, регистрация, редирект.

`frontend/src/pages/MAXAuth.jsx` — Аутентификация через MAX Web App. Парсинг WebAppData из URL/hash. Если существует — автовход; если новый — запрос пароля, регистрация, редирект.

`frontend/src/pages/JoinTeam.jsx` — Присоединение к бригаде по коду приглашения. Получение информации о бригаде и свободных местах, выбор рабочего из списка, извлечение tg_id из TMA/MAX, привязка через POST `/api/invite/join`.

`frontend/src/pages/JoinEquipment.jsx` — Привязка водителя к технике по коду приглашения. Получение данных техники, подтверждение привязки, POST `/api/equipment/invite/join`, сохранение `role='driver'`.

`frontend/src/pages/MyApps.jsx` — Список завершённых заявок (статус `completed`). Фильтрация по периоду: all/week/month/year/custom с кастомным диапазоном дат.

`frontend/src/pages/Review.jsx` — Модерация заявок. Три секции (waiting/approved/published) с карточками. Кнопки: одобрить/отклонить/завершить с причинами. Публикация нескольких нарядов одновременно в Telegram/MAX. Просмотр состава рабочих и техники.

`frontend/src/pages/Resources.jsx` — Объединённая страница ресурсов: две вкладки — Бригады (Teams) и Автопарк (Equipment).

`frontend/src/pages/Objects.jsx` — Управление объектами (площадками). Список активных/архивных, создание с адресом, редактирование (информация, ресурсы по умолчанию — бригады/техника, план КП — выбор работ из справочника с поиском и фильтром по категориям), архивирование/восстановление.

`frontend/src/pages/KP.jsx` — Сметные расчёты (КП). Три вкладки: «К заполнению» (заявки без КП), «На проверку» (ожидающие проверки), «Одобренные» (для экспорта). Заполнение объёмов работ, отправка на проверку, одобрение/отклонение, редактирование цифр (офис), массовый экспорт в Excel.

`frontend/src/pages/System.jsx` — Админ-панель. Список пользователей с ролями, логи действий, настройки автоматизации (время публикации, автозавершение, напоминания), тестирование уведомлений (superadmin).

`frontend/src/pages/Guide.jsx` — Встроенная справка с поиском и разбиением по ролям. Разделы: регистрация, создание заявки, участие в наряде, модерирование, управление ресурсами.

`frontend/src/pages/Updates.jsx` — История версий системы с описанием добавленных функций и улучшений.

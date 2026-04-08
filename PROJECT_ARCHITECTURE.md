# Архитектура проекта ВИКС Расписание

## Внесенные изменения

Проведён первый этап рефакторинга фронтенда: монолитные компоненты `Layout.jsx` и `Home.jsx` разбиты на модульную feature-based архитектуру. Созданы папки `features/` и `utils/` для выделения переиспользуемых компонентов и утилит. Все изменения являются чисто структурными — бизнес-логика, тексты и API-контракты не затронуты.

**Что сделано:**
- Из `Layout.jsx` извлечены 4 независимых компонента: Header, BottomNav, ProfileModal, SessionModal.
- Из `Home.jsx` извлечён компонент KanbanCol в отдельный файл.
- Утилитарные функции `getSmartDates` и `getTodayStr` вынесены в `utils/dateUtils.js`.
- Создана утилита `clipboard.js` для переиспользования логики копирования в буфер обмена.
- `Layout.jsx` и `Home.jsx` переписаны как чистые обёртки, импортирующие извлечённые компоненты.

**Что ещё предстоит сделать (в следующей сессии):**
- Рефакторинг `Equipment.jsx` — извлечение EquipmentCard, AddEquipForm, BulkUploadForm, InviteModal.
- Рефакторинг `Teams.jsx` — извлечение TeamCard, CreateTeamModal, ManageTeamModal, InviteModal.
- Рефакторинг бэкенда: разделение `database/db_manager.py` на доменные репозитории (users_repo, teams_repo, equipment_repo, apps_repo).
- Обновление импортов во всех роутерах бэкенда.

---

## Структура проекта (рефакторинг фронтенда)

### Утилиты

`frontend/src/utils/dateUtils.js` — Содержит функции `getSmartDates()` (генерация меток дат на ближайшие 3 дня) и `getTodayStr()` (получение текущей даты в формате YYYY-MM-DD с учётом часового пояса Asia/Barnaul). Используется в `Home.jsx`.

`frontend/src/utils/clipboard.js` — Содержит функцию `copyToClipboard(text, linkType, setCopiedLink)` для универсального копирования текста в буфер обмена с визуальным фидбеком. Подготовлена для использования в `Equipment.jsx` и `Teams.jsx`.

### Layout (Каркас приложения)

`frontend/src/components/Layout.jsx` — Главная обёртка приложения. Управляет состоянием темы, сессии, профиля и глобального создания заявки. Импортирует и рендерит Header, BottomNav, ProfileModal, SessionModal. Передаёт через `<Outlet context>` функцию `openProfile`, а также состояние и сеттер `isGlobalCreateAppOpen`.

`frontend/src/features/layout/components/Header.jsx` — Верхняя панель сайта (шапка). Содержит логотип, гамбургер-меню с навигацией (Инструкция, Обновления, Техподдержка, Тема), а также баннер тестирования роли. Принимает пропсы: `isTMA`, `realRole`, `role`, `theme`, `toggleTheme`, `isMenuOpen`, `setIsMenuOpen`.

`frontend/src/features/layout/components/BottomNav.jsx` — Нижняя панель навигации (таббар). Отвечает за маршрутизацию между страницами: Главная, Заявки, Ресурсы, Модерация, Система, Профиль. Центральная кнопка "Создать" (для прорабов) открывает модалку создания заявки. Отображение кнопок зависит от роли пользователя.

`frontend/src/features/layout/components/ProfileModal.jsx` — Модальное окно профиля пользователя. Содержит: просмотр и редактирование ФИО, специальности, ссылки MAX; загрузку аватарки; настройки уведомлений (Telegram/MAX); привязку/отвязку мессенджеров через код; удаление пользователя. Самодостаточный компонент со своей логикой API-вызовов.

`frontend/src/features/layout/components/SessionModal.jsx` — Модальное окно истекшей сессии. Показывается при отсутствии `tg_id` в localStorage. Предлагает пользователю заново авторизоваться через мессенджер.

### Applications (Заявки / Наряды)

`frontend/src/features/applications/components/KanbanCol.jsx` — Колонка канбан-доски. Принимает массив заявок и рендерит карточки с информацией: адрес объекта, прораб, дата, список бригад (с отметкой "Свободна"), список техники (с отметкой об освобождении). Поддерживает сворачивание/разворачивание и пагинацию ("Показать все").

`frontend/src/pages/Home.jsx` — Главная страница-dashboard. Управляет состоянием заявок, формой создания/редактирования заявки, модалкой освобождения бригад/техники. Импортирует `KanbanCol` из `features/applications/` и утилиты дат из `utils/dateUtils.js`. Содержит канбан-доску (4 колонки), карточку текущих нарядов, карточку бригады, модалку создания заявки и модалку подтверждения освобождения.

### Нерефакторинговые страницы (без изменений)

`frontend/src/pages/Equipment.jsx` — Страница управления автопарком. Содержит вкладки: список техники по категориям, добавление, массовая загрузка. Планируется к рефакторингу.

`frontend/src/pages/Teams.jsx` — Страница управления бригадами. Содержит карточки бригад, модалки создания/управления бригадой, генерации приглашений. Планируется к рефакторингу.

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

### Бэкенд (без изменений, планируется к рефакторингу)

`database/db_manager.py` — Монолитный менеджер базы данных (596 строк). Содержит все методы для работы с таблицами: users, teams, team_members, equipment, applications, logs. Планируется разделение на доменные репозитории.

`web/api_main.py` — Точка входа FastAPI-приложения. Подключает роутеры, CORS, обработку ошибок, startup/shutdown.

`web/database_deps.py` — Глобальный экземпляр DatabaseManager и часового пояса. Импортируется всеми роутерами.

`web/routers/auth.py` — Эндпоинты авторизации (Telegram, TMA, MAX, код привязки).

`web/routers/dashboard.py` — Эндпоинты дашборда, настроек, cron-задач.

`web/routers/users.py` — Эндпоинты управления профилями пользователей.

`web/routers/teams.py` — Эндпоинты управления бригадами и инвайтами.

`web/routers/equipment.py` — Эндпоинты управления автопарком.

`web/routers/applications.py` — Эндпоинты CRUD заявок, модерации, публикации, освобождения.

`web/utils.py` — Утилиты бэкенда (уведомления).

`web/scheduler.py` — Планировщик задач (APScheduler).

/**
 * Single continuous onboarding tour that navigates between pages.
 * Each step can optionally trigger navigation via `navigate` field.
 * `page` field indicates which page the target element lives on.
 * `desktopOnly` / `mobileOnly` — device-specific steps.
 * Filtered by user role and device type.
 */

export const TOUR_VERSION = '3';

export const getTourStorageKey = (userId, role) => `tour:${TOUR_VERSION}:${userId}:${role}:done`;
export const getTourReplayKey = (userId, role) => `tour:${TOUR_VERSION}:${userId}:${role}:replay`;

const ALL_ROLES = ['superadmin', 'boss', 'moderator', 'hr', 'foreman', 'brigadier', 'worker', 'employee', 'driver'];
const OFFICE = ['superadmin', 'boss', 'moderator'];
const BOSS_PLUS = ['superadmin', 'boss'];
const FIELD = ['foreman', 'brigadier', 'worker', 'driver'];
const FOREMAN_PLUS = ['superadmin', 'boss', 'moderator', 'foreman'];
const KP_ROLES = [...FOREMAN_PLUS, 'brigadier', 'worker', 'hr'];
const APPLICATION_ROLES = [...OFFICE, 'foreman', 'brigadier', 'worker', 'driver'];
const OBJECT_ROLES = [...OFFICE, 'foreman', 'hr'];
const TEAM_ROLES = [...OBJECT_ROLES, 'brigadier'];

export function getFullTourSteps(role) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
  return ALL_STEPS.filter(s => {
    if (s.roles && !s.roles.includes(role)) return false;
    if (isMobile && s.desktopOnly) return false;
    if (!isMobile && s.mobileOnly) return false;
    return true;
  });
}

const ALL_STEPS = [
  // === SIDEBAR INTRO (desktop only) ===
  { target: 'sidebar-create-btn', title: 'Создание заявки', description: 'Нажмите, чтобы создать новую заявку на работу.', position: 'right', roles: FOREMAN_PLUS, desktopOnly: true },

  // === BOTTOMNAV INTRO (mobile only) ===
  { target: 'bottomnav-home', title: 'Главная', description: 'Ваша рабочая сводка и быстрые действия.', position: 'top', roles: ALL_ROLES, mobileOnly: true },
  { target: 'bottomnav-orders', title: 'Заявки', description: 'Модерация или ваша история заявок.', position: 'top', roles: APPLICATION_ROLES, mobileOnly: true },
  { target: 'bottomnav-create', title: 'Создать', description: 'Создание новой заявки на работу.', position: 'top', roles: FOREMAN_PLUS, mobileOnly: true },
  { target: 'bottomnav-menu', title: 'Меню', description: 'Все остальные разделы приложения.', position: 'top', mobileOnly: true },

  // === ГЛАВНАЯ ===
  { target: 'sidebar-nav-home', title: 'Главная', description: 'Канбан-доска с заявками. Перейдём туда.', position: 'right', navigate: '/dashboard', desktopOnly: true },
  { target: 'active-apps-card', title: 'Ваши заявки', description: 'Текущие назначения на сегодня и завтра.', position: 'bottom', page: '/dashboard', roles: FIELD },
  { target: 'kanban-board', title: 'Канбан-доска', description: 'Заявки по статусам: модерация, одобрено, в работе, завершено.', position: 'top', page: '/dashboard', roles: FOREMAN_PLUS },
  { target: 'debtors-widget', title: 'Должники СМР', description: 'Прорабы с незакрытыми отчётами.', position: 'bottom', page: '/dashboard', roles: OFFICE },
  { target: 'action-items-widget', title: 'Требует внимания', description: 'Здесь только задачи, которые может исправить ваша роль. Нажатие сразу открывает нужный раздел.', position: 'bottom', page: '/dashboard', roles: ALL_ROLES },

  // === ОБЪЕКТЫ ===
  { target: 'sidebar-nav-objects', title: 'Объекты', description: 'Строительные объекты и площадки. Перейдём.', position: 'right', navigate: '/objects', roles: OBJECT_ROLES, desktopOnly: true },
  { target: 'objects-create-btn', title: 'Новый объект', description: 'Создание объекта с адресом и ресурсами.', position: 'bottom', page: '/objects', roles: OFFICE },
  { target: 'objects-grid', title: 'Список объектов', description: 'Все активные объекты и их данные.', position: 'top', page: '/objects', roles: OBJECT_ROLES },

  // === РЕСУРСЫ: БРИГАДЫ ===
  { target: 'sidebar-nav-resources', title: 'Ресурсы', description: 'Бригады и доступные ресурсы.', position: 'right', navigate: '/resources?tab=teams', roles: OBJECT_ROLES, desktopOnly: true },
  { target: 'teams-create-btn', title: 'Новая бригада', description: 'Создайте бригаду и пригласите рабочих.', position: 'bottom', page: '/resources', roles: OBJECT_ROLES },
  { target: 'teams-grid', title: 'Бригады', description: 'Состав и данные доступных вам бригад.', position: 'top', page: '/resources', roles: TEAM_ROLES },

  // === РЕСУРСЫ: ТЕХНИКА ===
  { target: 'sidebar-nav-resources', title: 'Техника', description: 'Теперь посмотрим технику.', position: 'right', navigate: '/resources?tab=equipment', roles: OBJECT_ROLES, desktopOnly: true },
  { target: 'equip-add-btn', title: 'Добавить технику', description: 'Добавьте технику вручную или загрузкой.', position: 'bottom', page: '/resources', roles: OFFICE },
  { target: 'equip-categories', title: 'Категории', description: 'Фильтр по типу техники.', position: 'bottom', page: '/resources', roles: OBJECT_ROLES },
  { target: 'equip-grid', title: 'Автопарк', description: 'Карточки доступной техники.', position: 'top', page: '/resources', roles: OBJECT_ROLES },

  // === ЗАЯВКИ — Review (office) ===
  { target: 'sidebar-nav-orders', title: 'Заявки', description: 'Модерация заявок. Перейдём.', position: 'right', navigate: '/review', roles: OFFICE, desktopOnly: true },
  { target: 'review-schedule-btn', title: 'Расстановка', description: 'Формирование ежедневной расстановки.', position: 'bottom', page: '/review', roles: OFFICE },
  { target: 'review-waiting', title: 'На модерации', description: 'Новые заявки для проверки.', position: 'bottom', page: '/review', roles: OFFICE },
  { target: 'review-approved', title: 'Одобренные', description: 'Готовы к работе и публикации.', position: 'bottom', page: '/review', roles: OFFICE },

  // === ЗАЯВКИ — MyApps (field) ===
  { target: 'sidebar-nav-orders', title: 'Мои заявки', description: 'Ваша история работ. Перейдём.', position: 'right', navigate: '/my-apps', roles: FIELD, desktopOnly: true },
  { target: 'myapps-filters', title: 'Фильтры', description: 'Выберите период для просмотра.', position: 'bottom', page: '/my-apps', roles: FIELD },
  { target: 'myapps-list', title: 'История', description: 'Все ваши заявки с датами и статусами.', position: 'top', page: '/my-apps', roles: FIELD },

  // === СМР ===
  { target: 'sidebar-nav-smr', title: 'СМР', description: 'Отчёты о выполненных работах. Перейдём.', position: 'right', navigate: '/kp', roles: KP_ROLES, desktopOnly: true },
  { target: 'kp-tabs', title: 'Вкладки СМР', description: 'К заполнению, на проверку, готовые.', position: 'bottom', page: '/kp', roles: KP_ROLES },
  { target: 'kp-grid', title: 'Наряды', description: 'Карточки нарядов для заполнения объёмов.', position: 'top', page: '/kp', roles: KP_ROLES },

  // === АДМИНКА ===
  { target: 'sidebar-nav-admin', title: 'Админка', description: 'Управление пользователями и автоматизацией системы.', position: 'right', navigate: '/admin', roles: BOSS_PLUS, desktopOnly: true },
  { target: 'admin-users', title: 'Пользователи', description: 'Роли, блокировки, профили и состояние аккаунтов.', position: 'bottom', page: '/admin', roles: BOSS_PLUS },
  { target: 'admin-role-passwords', title: 'Пароли ролей', description: 'Общие пароли регистрации можно безопасно заменить после подтверждения.', position: 'bottom', page: '/admin', roles: ['superadmin'] },
  { target: 'admin-system-settings', title: 'Автоматизация', description: 'Расписание автоматических действий и системные настройки.', position: 'top', page: '/admin', roles: BOSS_PLUS },

  // === НАСТРОЙКИ ===
  { target: 'sidebar-nav-settings', title: 'Настройки', description: 'Тема, профиль и ваши уведомления.', position: 'right', navigate: '/settings', desktopOnly: true },

  // === ПОДДЕРЖКА ===
  { target: 'sidebar-support', title: 'Поддержка', description: 'ИИ-ассистент. Перейдём.', position: 'right', navigate: '/support', desktopOnly: true },
  { target: 'support-chat', title: 'ИИ-ассистент', description: 'Задайте вопрос: свободная техника, коды бригад, статус заявок.', position: 'top', page: '/support' },
  { target: 'support-input', title: 'Ввод сообщения', description: 'Напишите вопрос и нажмите отправить.', position: 'top', page: '/support' },

  // === ФИНАЛ ===
  { target: 'sidebar-profile', title: 'Готово!', description: 'Гайд завершён! Пройти заново можно в разделе «Гайд». Нужна помощь — обращайтесь в поддержку.', position: 'right', desktopOnly: true },
  { target: 'bottomnav-menu', title: 'Готово!', description: 'Гайд завершён! Пройти заново можно в «Меню» → «Гайд». Нужна помощь — обращайтесь в поддержку.', position: 'top', mobileOnly: true },
];

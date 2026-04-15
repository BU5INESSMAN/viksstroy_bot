/**
 * Single continuous onboarding tour that navigates between pages.
 * Each step can optionally trigger navigation via `navigate` field.
 * `page` field indicates which page the target element lives on.
 * `desktopOnly` / `mobileOnly` — device-specific steps.
 * Filtered by user role and device type.
 */

const OFFICE = ['superadmin', 'boss', 'moderator'];
const FIELD = ['foreman', 'brigadier', 'worker', 'driver'];
const FOREMAN_PLUS = ['superadmin', 'boss', 'moderator', 'foreman'];
const KP_ROLES = [...FOREMAN_PLUS, 'brigadier'];

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
  { target: 'bottomnav-home', title: 'Главная', description: 'Канбан-доска со всеми заявками.', position: 'top', mobileOnly: true },
  { target: 'bottomnav-orders', title: 'Заявки', description: 'Модерация или ваша история заявок.', position: 'top', mobileOnly: true },
  { target: 'bottomnav-create', title: 'Создать', description: 'Создание новой заявки на работу.', position: 'top', roles: FOREMAN_PLUS, mobileOnly: true },
  { target: 'bottomnav-menu', title: 'Меню', description: 'Все остальные разделы приложения.', position: 'top', mobileOnly: true },

  // === ГЛАВНАЯ ===
  { target: 'sidebar-nav-home', title: 'Главная', description: 'Канбан-доска с заявками. Перейдём туда.', position: 'right', navigate: '/dashboard', desktopOnly: true },
  { target: 'active-apps-card', title: 'Ваши заявки', description: 'Текущие назначения на сегодня и завтра.', position: 'bottom', page: '/dashboard', roles: FIELD },
  { target: 'kanban-board', title: 'Канбан-доска', description: 'Заявки по статусам: модерация, одобрено, в работе, завершено.', position: 'top', page: '/dashboard', roles: FOREMAN_PLUS },
  { target: 'debtors-widget', title: 'Должники СМР', description: 'Прорабы с незакрытыми отчётами.', position: 'bottom', page: '/dashboard', roles: OFFICE },

  // === ОБЪЕКТЫ ===
  { target: 'sidebar-nav-objects', title: 'Объекты', description: 'Строительные объекты и площадки. Перейдём.', position: 'right', navigate: '/objects', roles: FOREMAN_PLUS, desktopOnly: true },
  { target: 'objects-create-btn', title: 'Новый объект', description: 'Создание объекта с адресом и ресурсами.', position: 'bottom', page: '/objects', roles: OFFICE },
  { target: 'objects-grid', title: 'Список объектов', description: 'Все активные объекты. Нажмите для статистики.', position: 'top', page: '/objects', roles: FOREMAN_PLUS },

  // === РЕСУРСЫ: БРИГАДЫ ===
  { target: 'sidebar-nav-resources', title: 'Ресурсы', description: 'Бригады и техника. Начнём с бригад.', position: 'right', navigate: '/resources?tab=teams', roles: FOREMAN_PLUS, desktopOnly: true },
  { target: 'teams-create-btn', title: 'Новая бригада', description: 'Создайте бригаду и пригласите рабочих.', position: 'bottom', page: '/resources', roles: FOREMAN_PLUS },
  { target: 'teams-grid', title: 'Бригады', description: 'Все бригады. Нажмите для управления составом.', position: 'top', page: '/resources', roles: FOREMAN_PLUS },

  // === РЕСУРСЫ: ТЕХНИКА ===
  { target: 'sidebar-nav-resources', title: 'Техника', description: 'Теперь посмотрим технику.', position: 'right', navigate: '/resources?tab=equipment', roles: FOREMAN_PLUS, desktopOnly: true },
  { target: 'equip-add-btn', title: 'Добавить технику', description: 'Добавьте технику вручную или загрузкой.', position: 'bottom', page: '/resources', roles: OFFICE },
  { target: 'equip-categories', title: 'Категории', description: 'Фильтр по типу техники.', position: 'bottom', page: '/resources', roles: FOREMAN_PLUS },
  { target: 'equip-grid', title: 'Автопарк', description: 'Карточки техники. Нажмите для редактирования.', position: 'top', page: '/resources', roles: FOREMAN_PLUS },

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

  // === НАСТРОЙКИ ===
  { target: 'sidebar-nav-settings', title: 'Настройки', description: 'Администрирование системы. Перейдём.', position: 'right', navigate: '/system', roles: OFFICE, desktopOnly: true },
  { target: 'system-users', title: 'Пользователи', description: 'Управление ролями и блокировка.', position: 'top', page: '/system', roles: OFFICE },
  { target: 'system-broadcast', title: 'Рассылки', description: 'Отправка сообщений в группу или ЛС.', position: 'top', page: '/system', roles: OFFICE },

  // === ПОДДЕРЖКА ===
  { target: 'sidebar-support', title: 'Поддержка', description: 'ИИ-ассистент. Перейдём.', position: 'right', navigate: '/support', desktopOnly: true },
  { target: 'support-chat', title: 'ИИ-ассистент', description: 'Задайте вопрос: свободная техника, коды бригад, статус заявок.', position: 'top', page: '/support' },
  { target: 'support-input', title: 'Ввод сообщения', description: 'Напишите вопрос и нажмите отправить.', position: 'top', page: '/support' },

  // === ФИНАЛ ===
  { target: 'sidebar-profile', title: 'Готово!', description: 'Гайд завершён! Пройти заново можно в разделе «Гайд». Нужна помощь — обращайтесь в поддержку.', position: 'right', desktopOnly: true },
  { target: 'bottomnav-menu', title: 'Готово!', description: 'Гайд завершён! Пройти заново можно в «Меню» → «Гайд». Нужна помощь — обращайтесь в поддержку.', position: 'top', mobileOnly: true },
];

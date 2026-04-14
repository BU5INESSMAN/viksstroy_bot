/**
 * Onboarding tour step definitions, filtered by user role.
 * target values match data-tour="..." attributes on real DOM elements.
 */

const OFFICE = ['superadmin', 'boss', 'moderator'];
const FOREMAN_PLUS = ['superadmin', 'boss', 'moderator', 'foreman'];

export function getTourSteps(page, role) {
  const steps = STEPS[page];
  if (!steps) return [];
  return steps.filter(s => !s.roles || s.roles.includes(role));
}

const STEPS = {
  sidebar: [
    { target: 'sidebar-create-btn', title: 'Создание заявки', description: 'Нажмите, чтобы создать новую заявку: объект, бригада, техника, дата.', position: 'right', roles: FOREMAN_PLUS },
    { target: 'sidebar-nav-home', title: 'Главная', description: 'Канбан-доска всех заявок по статусам.', position: 'right' },
    { target: 'sidebar-nav-objects', title: 'Объекты', description: 'Строительные площадки, адреса, сметы.', position: 'right', roles: FOREMAN_PLUS },
    { target: 'sidebar-nav-resources', title: 'Ресурсы', description: 'Бригады и автопарк. Приглашение рабочих и водителей.', position: 'right', roles: FOREMAN_PLUS },
    { target: 'sidebar-nav-orders', title: 'Заявки', description: 'Просмотр и модерация заявок.', position: 'right' },
    { target: 'sidebar-nav-smr', title: 'СМР', description: 'Отчёты о выполненных работах и экспорт в Excel.', position: 'right', roles: [...FOREMAN_PLUS, 'brigadier'] },
    { target: 'sidebar-nav-settings', title: 'Настройки', description: 'Пользователи, рассылки, журнал, автоматизация.', position: 'right', roles: OFFICE },
    { target: 'sidebar-support', title: 'Поддержка', description: 'ИИ-ассистент ответит на вопросы и покажет данные.', position: 'right' },
    { target: 'sidebar-profile', title: 'Профиль', description: 'Настройки профиля, уведомлений и выход.', position: 'right' },
  ],

  dashboard: [
    { target: 'active-apps-card', title: 'Ваши заявки', description: 'Текущие назначения на сегодня и завтра.', position: 'bottom' },
    { target: 'kanban-board', title: 'Канбан-доска', description: 'Заявки по статусам: модерация → одобрено → в работе → завершено.', position: 'top' },
    { target: 'debtors-widget', title: 'Должники СМР', description: 'Прорабы с незаполненными отчётами.', position: 'bottom', roles: OFFICE },
  ],

  review: [
    { target: 'review-schedule-btn', title: 'Расстановка', description: 'Планировщик расстановки бригад и техники по датам.', position: 'bottom', roles: OFFICE },
    { target: 'review-waiting', title: 'На модерации', description: 'Новые заявки. Нажмите на карточку для одобрения.', position: 'bottom', roles: OFFICE },
    { target: 'review-approved', title: 'Одобренные', description: 'Готовы к работе и публикации в расстановке.', position: 'bottom', roles: OFFICE },
  ],

  myapps: [
    { target: 'myapps-filters', title: 'Фильтры', description: 'Период: неделя, месяц, год или свои даты.', position: 'bottom' },
    { target: 'myapps-list', title: 'История', description: 'Все ваши завершённые работы.', position: 'top' },
  ],

  teams: [
    { target: 'teams-create-btn', title: 'Новая бригада', description: 'Создайте бригаду и пригласите рабочих по ссылке.', position: 'bottom', roles: FOREMAN_PLUS },
    { target: 'teams-grid', title: 'Бригады', description: 'Нажмите на карточку для управления составом.', position: 'top' },
  ],

  equipment: [
    { target: 'equip-add-btn', title: 'Добавить', description: 'Добавьте технику вручную или массовой загрузкой.', position: 'bottom', roles: FOREMAN_PLUS },
    { target: 'equip-categories', title: 'Категории', description: 'Фильтр по типу техники.', position: 'bottom' },
    { target: 'equip-grid', title: 'Техника', description: 'Нажмите для редактирования или приглашения водителя.', position: 'top' },
  ],

  objects: [
    { target: 'objects-create-btn', title: 'Новый объект', description: 'Создайте объект с адресом и планом работ.', position: 'bottom', roles: OFFICE },
    { target: 'objects-grid', title: 'Объекты', description: 'Активные площадки. Нажмите для статистики.', position: 'top' },
  ],

  kp: [
    { target: 'kp-tabs', title: 'Вкладки', description: 'К заполнению — ваши. На проверку — у модератора. Готовые — закрытые.', position: 'bottom' },
    { target: 'kp-grid', title: 'Наряды', description: 'Нажмите на карточку для заполнения объёмов.', position: 'top' },
  ],

  system: [
    { target: 'system-users', title: 'Пользователи', description: 'Управление ролями и блокировка.', position: 'top', roles: OFFICE },
    { target: 'system-broadcast', title: 'Рассылки', description: 'Сообщения в группу или ЛС по ролям.', position: 'top', roles: OFFICE },
  ],

  support: [
    { target: 'support-chat', title: 'ИИ-ассистент', description: 'Спросите про технику, бригады, заявки, коды приглашений.', position: 'top' },
    { target: 'support-input', title: 'Ввод', description: 'Напишите вопрос и нажмите отправить.', position: 'top' },
  ],
};

from aiogram.fsm.state import State, StatesGroup

class AuthStates(StatesGroup):
    """Состояния процесса регистрации и проверки пароля"""
    wait_for_password = State()  # Ожидание ввода пароля (модератор/прораб)
    wait_for_fio = State()       # Ожидание ввода ФИО после верного пароля

class TeamStates(StatesGroup):
    """Состояния управления составом бригад"""
    main_menu = State()          # Просмотр списка всех бригад
    edit_team = State()          # Меню конкретной бригады
    wait_for_name = State()      # Ввод кастомного названия
    wait_for_leader = State()    # Ввод ФИО бригадира (авто-переименование)
    wait_for_member = State()    # Ввод ФИО обычного рабочего
    wait_for_pos = State()       # Ввод должности рабочего

class AppStates(StatesGroup):
    """Состояния пошагового создания заявки прорабом"""
    wait_for_object = State()      # Ввод адреса объекта (или выбор из истории)
    select_team = State()          # Выбор основной бригады
    select_members = State()       # Мульти-выбор участников (с ✅)
    select_category = State()      # Выбор категории техники
    select_equipment = State()     # Выбор конкретной машины (с проверкой на ❌)
    select_date = State()          # Выбор даты (Завтра / Своя)
    wait_for_custom_date = State() # Ручной ввод даты ДД.ММ
    select_time_start = State()    # Выбор часа начала (07:00-18:00)
    select_time_end = State()      # Выбор часа окончания (проверка >3ч)
    wait_for_comment = State()     # Ввод комментария или 'Нет'
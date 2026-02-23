from aiogram.utils.keyboard import InlineKeyboardBuilder
from utils.callbacks import TeamCallback, AppAction, TimeAction
from typing import List, Dict, Any
from datetime import datetime, timedelta

# --- КЛАВИАТУРЫ АДМИНА ---

def get_admin_main_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="🚜 Управление техникой", callback_data="admin_equip_list")
    builder.button(text="👥 Список пользователей", callback_data="admin_users_list")
    builder.button(text="📊 Статистика заявок", callback_data="admin_stats")
    builder.adjust(1)
    return builder.as_markup()

def get_admin_categories_kb(categories: list):
    builder = InlineKeyboardBuilder()
    for cat in categories:
        builder.button(text=cat, callback_data=AppAction(step="admin_set_cat", val=cat))
    builder.adjust(2)
    return builder.as_markup()

# --- КЛАВИАТУРЫ ПРОРАБА (БРИГАДЫ И ЗАЯВКИ) ---

def get_teams_main_kb(teams: list):
    """Главное меню списка бригад"""
    builder = InlineKeyboardBuilder()
    for team in teams:
        builder.button(
            text=f"🏗 {team['name']}",
            callback_data=TeamCallback(action="view", team_id=team['id'])
        )
    # ИСПРАВЛЕНО: Теперь team_id=0 или None не вызовет ошибку
    builder.button(text="➕ Создать новую бригаду", callback_data=TeamCallback(action="create", team_id=0))
    builder.adjust(1)
    return builder.as_markup()


def get_member_edit_kb(team_id: int, member_id: int):
    """Меню управления конкретным участником"""
    builder = InlineKeyboardBuilder()

    # Кнопки редактирования данных
    builder.button(text="✏️ Изменить ФИО",
                   callback_data=TeamCallback(action="edit_m_fio", team_id=team_id, member_id=member_id))
    builder.button(text="🛠 Изменить специальность",
                   callback_data=TeamCallback(action="edit_m_pos", team_id=team_id, member_id=member_id))

    # Кнопка получения ссылки (инвайт-кода)
    builder.button(text="🔗 Ссылка для входа",
                   callback_data=TeamCallback(action="get_invite", team_id=team_id, member_id=member_id))

    # Кнопка удаления (выделяем предупреждающим знаком)
    builder.button(text="❌ Удалить из бригады",
                   callback_data=TeamCallback(action="delete_member", team_id=team_id, member_id=member_id))

    # Кнопка назад в меню бригады
    builder.button(text="🔙 Назад к бригаде", callback_data=TeamCallback(action="view", team_id=team_id))

    builder.adjust(1)  # Кнопки в столбик
    return builder.as_markup()

def get_team_edit_kb(team_id: int, members: list):
    builder = InlineKeyboardBuilder()

    # Кнопка названия
    builder.button(text="✏️ Изменить название", callback_data=TeamCallback(action="edit_name", team_id=team_id))

    for m in members:
        # 1. Значок регистрации
        reg_status = "" if m['tg_user_id'] else "⚠️ "

        # 2. Формируем текст: Имя (Специальность)
        btn_text = f"{reg_status}{m['fio']} ({m['position']})"

        # 3. Определяем стиль (красный для лидера)
        # В aiogram 3.x для InlineKeyboardButton нет прямого поля style как в Discord,
        # но мы можем выделить его визуально через иконку или использовать логику на стороне хендлера.
        # Если вы используете кастомные сборки или планируете WebApp - это одно,
        # но для стандартных кнопок выделим его текстом и иконкой:
        if m['is_leader']:
            btn_text = f"🔴 {m['fio']}"

        builder.button(
            text=btn_text,
            callback_data=TeamCallback(action="manage_member", team_id=team_id, member_id=m['id'])
        )

    if len(members) < 12:
        builder.button(text="➕ Добавить человека", callback_data=TeamCallback(action="add_member", team_id=team_id))

    builder.button(text="🔙 Назад", callback_data=TeamCallback(action="main_menu"))
    builder.adjust(1)
    return builder.as_markup()

def get_object_history_kb(history: List[Dict[str, Any]]):
    builder = InlineKeyboardBuilder()
    for obj in history:
        builder.button(text=str(obj['object_address']), callback_data=AppAction(step="select_obj", val=obj['object_address']))
    builder.adjust(1)
    return builder.as_markup()

def get_teams_for_app_kb(teams: List[Dict[str, Any]]):
    builder = InlineKeyboardBuilder()
    for team in teams:
        builder.button(text=f"👥 {team['name']}", callback_data=AppAction(step="select_team", val=str(team['id'])))
    builder.adjust(1)
    return builder.as_markup()

def get_staff_selection_kb(team_id: int, members: list, selected_ids: list):
    builder = InlineKeyboardBuilder()
    for m in members:
        icon = "✅ " if m['id'] in selected_ids else ""
        builder.button(text=f"{icon}{m['fio']} ({m['position']})", callback_data=AppAction(step="toggle_staff", val=str(m['id'])))
    builder.button(text="➡️ Далее", callback_data=AppAction(step="confirm_staff", val="done"))
    builder.button(text="❌ Отмена", callback_data="main_menu")
    builder.adjust(1)
    return builder.as_markup()

def get_dates_kb():
    builder = InlineKeyboardBuilder()
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%d.%m")
    builder.button(text=f"📅 Завтра ({tomorrow})", callback_data=AppAction(step="select_date", val=tomorrow))
    builder.button(text="⌨️ Другая дата (ввести)", callback_data=AppAction(step="manual_date", val="input"))
    builder.adjust(1)
    return builder.as_markup()

def get_categories_kb(categories: list):
    builder = InlineKeyboardBuilder()
    for cat in categories:
        builder.button(text=cat, callback_data=AppAction(step="select_cat", val=cat))
    builder.button(text="🔙 Назад", callback_data=AppAction(step="back_to_cats", val="none"))
    builder.adjust(2)
    return builder.as_markup()

def get_equipment_kb(items: list, busy_ids: list):
    builder = InlineKeyboardBuilder()
    for item in items:
        if item['id'] in busy_ids:
            builder.button(text=f"❌ {item['name']}", callback_data="ignore")
        else:
            builder.button(text=item['name'], callback_data=AppAction(step="select_equip", val=str(item['id'])))
    builder.button(text="🔙 К категориям", callback_data=AppAction(step="back_to_cats", val="none"))
    builder.adjust(1)
    return builder.as_markup()

def get_hours_kb(time_type: str, start_hour: int = 7):
    builder = InlineKeyboardBuilder()
    range_start = start_hour + 1 if time_type == "end" else 7
    for h in range(range_start, 21):
        builder.button(text=f"{h}:00", callback_data=AppAction(step=f"time_{time_type}", val=str(h)))
    builder.adjust(4)
    return builder.as_markup()

# --- КЛАВИАТУРЫ МОДЕРАТОРА ---

def get_pending_list_kb(apps: list):
    builder = InlineKeyboardBuilder()
    for app in apps:
        builder.button(text=f"📦 №{app['id']} | {app['object_address']}", callback_data=f"mod_view_{app['id']}")
    builder.adjust(1)
    return builder.as_markup()

def get_mod_decision_kb(app_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Одобрить", callback_data=f"mod_approve_{app_id}")
    builder.button(text="❌ Отклонить", callback_data=f"mod_reject_{app_id}")
    builder.button(text="🔙 Назад", callback_data="mod_back_to_list")
    builder.adjust(2, 1)
    return builder.as_markup()
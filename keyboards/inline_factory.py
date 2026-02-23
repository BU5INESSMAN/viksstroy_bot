# viksstroy_bot/keyboards/inline_factory.py
from aiogram.utils.keyboard import InlineKeyboardBuilder
from utils.callbacks import TeamCallback, AppAction, TimeAction
from typing import List, Dict, Any


# --- КЛАВИАТУРЫ БРИГАД ---
# viksstroy_bot/keyboards/inline_factory.py
from aiogram.utils.keyboard import InlineKeyboardBuilder
from utils.callbacks import TeamCallback, AppAction, TimeAction
from typing import List, Dict, Any
from datetime import datetime, timedelta


def get_dates_kb():
    """Выбор даты: завтра + кнопка ручного ввода"""
    builder = InlineKeyboardBuilder()
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%d.%m")

    # Кнопка на завтра
    builder.button(text=f"📅 Завтра ({tomorrow})", callback_data=AppAction(step="select_date", val=tomorrow))
    # Кнопка ручного ввода
    builder.button(text="⌨️ Другая дата (ввести)", callback_data=AppAction(step="manual_date", val="input"))

    builder.adjust(1)
    return builder.as_markup()

def get_categories_kb(categories: list):
    """Шаг 5: Категории техники"""
    builder = InlineKeyboardBuilder()
    for cat in categories:
        builder.button(text=cat, callback_data=AppAction(step="select_cat", val=cat))
    builder.button(text="🔙 Назад", callback_data=AppAction(step="back_to_cats", val="none"))
    builder.adjust(2)
    return builder.as_markup()

def get_equipment_kb(items: list, busy_ids: list):
    """Шаг 5.1: Выбор техники"""
    builder = InlineKeyboardBuilder()
    for item in items:
        if item['id'] in busy_ids:
            builder.button(text=f"❌ {item['name']}", callback_data="ignore")
        else:
            builder.button(text=item['name'], callback_data=AppAction(step="select_equip", val=str(item['id'])))
    builder.button(text="🔙 К категориям", callback_data=AppAction(step="back_to_cats", val="none"))
    builder.adjust(1)
    return builder.as_markup()


def get_teams_main_kb(teams: List[Dict[str, Any]]):
    builder = InlineKeyboardBuilder()
    for team in teams:
        builder.button(text=f"👥 {team['name']}", callback_data=TeamCallback(action="view", team_id=team['id']))
    builder.button(text="➕ Создать новую бригаду", callback_data=TeamCallback(action="create"))
    builder.adjust(1)
    return builder.as_markup()

def get_team_edit_kb(team_id: int, has_leader: bool, members_count: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Изменить название", callback_data=TeamCallback(action="edit_name", team_id=team_id))
    if not has_leader:
        builder.button(text="👤 Добавить бригадира", callback_data=TeamCallback(action="add_leader", team_id=team_id))
    if members_count < 10:
        builder.button(text="➕ Добавить участника", callback_data=TeamCallback(action="add_member", team_id=team_id))
    builder.button(text="🗑 Удалить бригаду", callback_data=TeamCallback(action="delete_team", team_id=team_id))
    builder.button(text="🔙 Назад", callback_data="menu_teams_list")
    builder.adjust(1)
    return builder.as_markup()

def get_members_list_kb(team_id: int, members: List[Dict[str, Any]]):
    """Список людей в бригаде для выбора действий"""
    builder = InlineKeyboardBuilder()
    for m in members:
        role_icon = "👑" if m['is_leader'] else "👤"
        builder.button(
            text=f"{role_icon} {m['fio']}",
            callback_data=TeamCallback(action="manage_member", team_id=team_id, member_id=m['id'])
        )
    builder.button(text="🔙 Назад", callback_data=TeamCallback(action="view", team_id=team_id))
    builder.adjust(1)
    return builder.as_markup()

def get_member_manage_kb(team_id: int, member_id: int):
    """Действия над конкретным сотрудником"""
    builder = InlineKeyboardBuilder()
    builder.button(text="🔗 Ссылка-приглашение",
                   callback_data=TeamCallback(action="invite", team_id=team_id, member_id=member_id))
    builder.button(text="🗑 Удалить из бригады",
                   callback_data=TeamCallback(action="delete_member", team_id=team_id, member_id=member_id))
    builder.button(text="🔙 Назад", callback_data=TeamCallback(action="show_members", team_id=team_id))
    builder.adjust(1)
    return builder.as_markup()


def get_staff_selection_kb(team_id: int, members: list, selected_ids: list):
    builder = InlineKeyboardBuilder()
    for m in members:
        icon = "✅ " if m['id'] in selected_ids else ""
        builder.button(text=f"{icon}{m['fio']}", callback_data=AppAction(step="toggle_staff", val=str(m['id'])))
    builder.button(text="➡️ Далее", callback_data=AppAction(step="confirm_staff", val="done"))
    builder.adjust(1)
    return builder.as_markup()


def get_categories_kb(categories: list):
    """Шаг 5: Категории техники"""
    builder = InlineKeyboardBuilder()
    for cat in categories:
        builder.button(text=cat, callback_data=AppAction(step="select_cat", value=cat))
    builder.button(text="🔙 Назад", callback_data=AppAction(step="back_to_cats", value="none"))
    builder.adjust(2)
    return builder.as_markup()

def get_equipment_kb(items: list, busy_ids: list):
    """Шаг 5.1: Выбор конкретной машины"""
    builder = InlineKeyboardBuilder()
    for item in items:
        is_busy = item['id'] in busy_ids
        if is_busy:
            builder.button(text=f"❌ {item['name']}", callback_data="ignore")
        else:
            builder.button(text=item['name'], callback_data=AppAction(step="select_equip", value=str(item['id'])))
    builder.button(text="🔙 К категориям", callback_data=AppAction(step="back_to_cats", value="none"))
    builder.adjust(1)
    return builder.as_markup()

def get_hours_kb(time_type: str, start_h: int = 7):
    builder = InlineKeyboardBuilder()
    for h in range(start_h + 1 if time_type == "end" else 7, 21):
        builder.button(text=f"{h}:00", callback_data=AppAction(step=f"time_{time_type}", val=str(h)))
    builder.adjust(4)
    return builder.as_markup()

def get_pending_list_kb(apps):
    """Меню модератора: список заявок"""
    builder = InlineKeyboardBuilder()
    for app in apps:
        builder.button(
            text=f"📦 №{app['id']} | {app['object_address']}",
            callback_data=f"mod_view_{app['id']}"
        )
    builder.adjust(1)
    return builder.as_markup()

def get_admin_main_kb():
    """Главное меню суперадмина"""
    builder = InlineKeyboardBuilder()
    builder.button(text="🚜 Управление техникой", callback_data="admin_equip_list")
    builder.button(text="👥 Список всех юзеров", callback_data="admin_users_list")
    builder.adjust(1)
    return builder.as_markup()

# --- КЛАВИАТУРЫ ЗАЯВОК ---

def get_object_history_kb(history: List[Dict[str, Any]]):
    builder = InlineKeyboardBuilder()
    for obj in history:
        builder.button(text=str(obj['object_address']),
                       callback_data=AppAction(step="select_obj", val=obj['object_address']))
    builder.adjust(1)
    return builder.as_markup()

def get_teams_for_app_kb(teams: List[Dict[str, Any]]):
    builder = InlineKeyboardBuilder()
    for team in teams:
        builder.button(text=f"👥 {team['name']}", callback_data=AppAction(step="select_team", val=str(team['id'])))
    builder.adjust(1)
    return builder.as_markup()
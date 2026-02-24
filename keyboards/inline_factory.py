from aiogram.utils.keyboard import InlineKeyboardBuilder
from utils.callbacks import TeamCallback, AppAction
from typing import List, Dict, Any
from datetime import datetime, timedelta


# --- КЛАВИАТУРЫ АДМИНА ---
def get_admin_main_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="🚜 Управление техникой", callback_data="admin_equip_list")
    builder.button(text="📥 Массовое добавление техники", callback_data="admin_bulk_equip")
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


# --- КЛАВИАТУРЫ ОТМЕНЫ ---
def get_cancel_edit_kb(team_id: int, member_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Отмена",
                   callback_data=TeamCallback(action="manage_member", team_id=team_id, member_id=member_id))
    return builder.as_markup()


def get_cancel_add_kb(team_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Отмена", callback_data=TeamCallback(action="view", team_id=team_id))
    return builder.as_markup()


def get_cancel_review_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Назад к заявке", callback_data="rev_cancel_edit")
    return builder.as_markup()


# --- КЛАВИАТУРЫ ПРОРАБА (БРИГАДЫ И ЗАЯВКИ) ---
def get_teams_main_kb(teams: list):
    builder = InlineKeyboardBuilder()
    for team in teams:
        builder.button(text=f"🏗 {team['name']}", callback_data=TeamCallback(action="view", team_id=team['id']))
    builder.button(text="➕ Создать новую бригаду", callback_data=TeamCallback(action="create", team_id=0))
    builder.adjust(1)
    return builder.as_markup()


def get_member_edit_kb(team_id: int, member_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Изменить ФИО",
                   callback_data=TeamCallback(action="edit_m_fio", team_id=team_id, member_id=member_id))
    builder.button(text="🛠 Изменить специальность",
                   callback_data=TeamCallback(action="edit_m_pos", team_id=team_id, member_id=member_id))
    builder.button(text="🔗 Ссылка для входа",
                   callback_data=TeamCallback(action="get_invite", team_id=team_id, member_id=member_id))
    builder.button(text="❌ Удалить из бригады",
                   callback_data=TeamCallback(action="delete_member", team_id=team_id, member_id=member_id))
    builder.button(text="🔙 Назад к бригаде", callback_data=TeamCallback(action="view", team_id=team_id))
    builder.adjust(1)
    return builder.as_markup()


def get_team_edit_kb(team_id: int, members: list):
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Изменить название", callback_data=TeamCallback(action="edit_name", team_id=team_id))

    has_leader = False
    for m in members:
        if m['is_leader'] == 1 or m['position'].lower() == 'бригадир':
            has_leader = True

        reg_status = "" if m['tg_user_id'] else "⚠️ "
        btn_text = f"🔴 {m['fio']}" if m['is_leader'] == 1 or m[
            'position'].lower() == 'бригадир' else f"{reg_status}{m['fio']} ({m['position']})"
        builder.button(text=btn_text,
                       callback_data=TeamCallback(action="manage_member", team_id=team_id, member_id=m['id']))

    # Кнопка бригадира показывается ТОЛЬКО если его еще нет
    if not has_leader:
        builder.button(text="👑 Добавить бригадира", callback_data=TeamCallback(action="add_leader", team_id=team_id))

    if len(members) < 12:
        builder.button(text="➕ Добавить человека", callback_data=TeamCallback(action="add_member", team_id=team_id))

    builder.button(text="🔙 Назад", callback_data=TeamCallback(action="main_menu", team_id=team_id))
    builder.adjust(1)
    return builder.as_markup()


# --- КЛАВИАТУРЫ ЗАЯВОК ---
def get_dates_kb():
    builder = InlineKeyboardBuilder()
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%d.%m")
    builder.button(text=f"📅 Завтра ({tomorrow})", callback_data=AppAction(step="select_date", val=tomorrow))
    builder.button(text="⌨️ Другая дата (ввести)", callback_data=AppAction(step="manual_date", val="input"))
    builder.adjust(1)
    return builder.as_markup()


def get_object_history_kb(history: List[Dict[str, Any]]):
    builder = InlineKeyboardBuilder()
    for idx, obj in enumerate(history):
        # Передаем индекс (idx) вместо длинной строки с адресом, чтобы не превышать лимит в 64 байта
        builder.button(text=str(obj['object_address']),
                       callback_data=AppAction(step="select_obj", val=str(idx)))
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
        builder.button(text=f"{icon}{m['fio']} ({m['position']})",
                       callback_data=AppAction(step="toggle_staff", val=str(m['id'])))
    builder.button(text="➡️ Далее", callback_data=AppAction(step="confirm_staff", val="done"))
    builder.adjust(1)
    return builder.as_markup()


def get_categories_kb(categories: list):
    builder = InlineKeyboardBuilder()
    for cat in categories:
        builder.button(text=cat, callback_data=AppAction(step="select_cat", val=cat))
    builder.adjust(2)
    return builder.as_markup()


def get_equipment_kb(items: list):
    builder = InlineKeyboardBuilder()
    for item in items:
        builder.button(text=item['name'], callback_data=AppAction(step="select_equip", val=str(item['id'])))
    builder.button(text="🔙 К категориям", callback_data=AppAction(step="back_to_cats", val="none"))
    builder.adjust(1)
    return builder.as_markup()


def get_hours_kb(time_type: str, available_hours: list):
    builder = InlineKeyboardBuilder()
    if not available_hours:
        builder.button(text="❌ Нет свободного времени на эту дату", callback_data="ignore")
    else:
        for h in available_hours:
            text = "24:00" if h == 24 else f"{h}:00"
            builder.button(text=text, callback_data=AppAction(step=f"time_{time_type}", val=str(h)))

    if time_type == "start":
        builder.button(text="🔙 Назад к выбору техники", callback_data=AppAction(step="back_to_cats", val="none"))
    else:
        builder.button(text="🔙 Назад к началу работ", callback_data=AppAction(step="reselect_time_start", val="none"))

    builder.adjust(4)
    return builder.as_markup()


def get_review_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="📅 Изменить дату", callback_data="rev_edit_date")
    builder.button(text="📍 Изменить объект", callback_data="rev_edit_obj")
    builder.button(text="👥 Изменить состав", callback_data="rev_edit_team")
    builder.button(text="🚜 Изменить технику/время", callback_data="rev_edit_equip")
    builder.button(text="💬 Изменить коммент", callback_data="rev_edit_comment")
    builder.button(text="✅ ПОДТВЕРДИТЬ И ОТПРАВИТЬ", callback_data="rev_confirm")
    builder.adjust(1)
    return builder.as_markup()


# --- КЛАВИАТУРЫ МОДЕРАТОРА ---
def get_mod_panel_kb():
    """Главная панель модератора"""
    builder = InlineKeyboardBuilder()
    builder.button(text="📤 Принудительно в группу", callback_data="mod_publish_apps")
    builder.button(text="🔔 Напомнить прорабам", callback_data="mod_remind_all")
    builder.adjust(1)
    return builder.as_markup()

def get_mod_take_kb(app_id: int):
    """Приходит вместе с новой заявкой"""
    builder = InlineKeyboardBuilder()
    builder.button(text="🔍 Рассмотреть заявку", callback_data=f"mod_take_{app_id}")
    builder.button(text="🔔 Напомнить остальным", callback_data="mod_remind_all")
    builder.adjust(1)
    return builder.as_markup()

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
    builder.adjust(2)
    return builder.as_markup()

def get_foreman_edit_rejected_kb(app_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Исправить заявку", callback_data=f"edit_rejected_{app_id}")
    return builder.as_markup()


def get_equip_edit_kb(equip_id: int, is_active: int):
    """Клавиатура управления конкретной машиной"""
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Название", callback_data=f"eq_edit_name_{equip_id}")
    builder.button(text="📂 Категория", callback_data=f"eq_edit_cat_{equip_id}")
    builder.button(text="👨‍✈️ Водитель", callback_data=f"eq_edit_driver_{equip_id}")

    status_text = "🔴 Отключить" if is_active else "🟢 Включить (Неактивна)"
    builder.button(text=status_text, callback_data=f"eq_toggle_{equip_id}")
    builder.button(text="🗑 Удалить", callback_data=f"eq_delete_{equip_id}")
    builder.button(text="🔙 Назад к списку", callback_data="admin_equip_list")
    builder.adjust(2, 1, 2, 1)
    return builder.as_markup()


def get_cancel_admin_kb(equip_id: int):
    """Отмена при вводе нового значения для техники"""
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Отмена", callback_data=f"admin_equip_edit_{equip_id}")
    return builder.as_markup()
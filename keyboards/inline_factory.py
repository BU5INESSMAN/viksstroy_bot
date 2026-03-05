from aiogram.utils.keyboard import InlineKeyboardBuilder
from utils.callbacks import TeamCallback, AppAction
from typing import List, Dict, Any
from datetime import datetime, timedelta


def get_admin_main_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="🚜 Управление техникой", callback_data="admin_equip_list")
    builder.button(text="📥 Массовое добавление техники", callback_data="admin_bulk_equip")
    builder.button(text="👥 Список пользователей", callback_data="admin_users_list")
    builder.button(text="📊 Статистика заявок", callback_data="admin_stats")
    builder.adjust(1)
    return builder.as_markup()


def get_cancel_edit_kb(team_id: int, member_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Отмена",
                   callback_data=TeamCallback(action="manage_member", team_id=team_id, member_id=member_id))
    return builder.as_markup()


def get_member_edit_kb(team_id: int, member_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Изменить ФИО",
                   callback_data=TeamCallback(action="edit_m_fio", team_id=team_id, member_id=member_id))
    builder.button(text="✏️ Изменить должность",
                   callback_data=TeamCallback(action="edit_m_pos", team_id=team_id, member_id=member_id))
    builder.button(text="🔗 Ссылка-приглашение",
                   callback_data=TeamCallback(action="get_invite", team_id=team_id, member_id=member_id))
    builder.button(text="🗑 Удалить участника",
                   callback_data=TeamCallback(action="delete_member", team_id=team_id, member_id=member_id))
    builder.button(text="🔙 Назад в бригаду", callback_data=TeamCallback(action="view", team_id=team_id))
    builder.adjust(2, 1, 1, 1)
    return builder.as_markup()


def get_cancel_add_kb(team_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Отмена", callback_data=TeamCallback(action="view", team_id=team_id))
    return builder.as_markup()


def get_team_edit_kb(team_id: int, members: list):
    builder = InlineKeyboardBuilder()
    for m in members:
        leader_icon = "👑 " if (m['is_leader'] or str(m['position']).lower() == 'бригадир') else ""
        tg_icon = "📱" if m['tg_user_id'] else "⏳"
        builder.button(text=f"{leader_icon}{m['fio']} ({tg_icon})",
                       callback_data=TeamCallback(action="manage_member", team_id=team_id, member_id=m['id']))

    has_leader = any(m['is_leader'] or str(m['position']).lower() == 'бригадир' for m in members)
    builder.adjust(1)
    row = []
    row.append(
        builder.button(text="➕ Добавить участника", callback_data=TeamCallback(action="add_member", team_id=team_id)))
    if not has_leader:
        row.append(builder.button(text="👑 Назначить бригадира",
                                  callback_data=TeamCallback(action="add_leader", team_id=team_id)))

    builder.button(text="✏️ Изменить название", callback_data=TeamCallback(action="edit_name", team_id=team_id))
    builder.button(text="🔙 К списку бригад", callback_data=TeamCallback(action="main_menu"))
    builder.adjust(1)
    return builder.as_markup()


def get_teams_main_kb(teams: list):
    builder = InlineKeyboardBuilder()
    for t in teams:
        builder.button(text=f"🏗 {t['name']}", callback_data=TeamCallback(action="view", team_id=t['id']))
    builder.button(text="➕ Создать бригаду", callback_data=TeamCallback(action="create"))
    builder.adjust(1)
    return builder.as_markup()


def get_dates_kb():
    builder = InlineKeyboardBuilder()
    today = datetime.now()
    dates = [(today + timedelta(days=i)).strftime("%d.%m") for i in range(1, 4)]
    for d in dates:
        builder.button(text=d, callback_data=AppAction(step="select_date", val=d))
    builder.button(text="Ввести вручную", callback_data=AppAction(step="manual_date"))
    builder.adjust(3, 1)
    return builder.as_markup()


def get_object_history_kb(history: List[Dict[str, Any]]):
    builder = InlineKeyboardBuilder()
    for idx, obj in enumerate(history):
        builder.button(text=str(obj['object_address']),
                       callback_data=AppAction(step="select_obj", val=str(idx)))
    builder.adjust(1)
    return builder.as_markup()


def get_teams_for_app_kb(teams: list):
    builder = InlineKeyboardBuilder()
    for t in teams:
        builder.button(text=f"🏗 {t['name']}", callback_data=AppAction(step="select_team", val=str(t['id'])))
    builder.adjust(1)
    return builder.as_markup()


def get_staff_selection_kb(team_id: int, members: list, selected_ids: list):
    builder = InlineKeyboardBuilder()
    for m in members:
        mark = "✅ " if m['id'] in selected_ids else ""
        builder.button(text=f"{mark}{m['fio']}", callback_data=AppAction(step="toggle_staff", val=str(m['id'])))
    builder.button(text="✅ Подтвердить состав", callback_data=AppAction(step="confirm_staff"))
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
    builder.button(text="🔙 Назад к категориям", callback_data=AppAction(step="back_to_cats"))
    builder.adjust(1)
    return builder.as_markup()


def get_hours_kb(step_type: str, available_hours: list):
    builder = InlineKeyboardBuilder()
    for h in range(0, 24):
        if h in available_hours:
            builder.button(text=f"{h}:00", callback_data=AppAction(step=f"time_{step_type}", val=str(h)))
        else:
            builder.button(text="❌", callback_data="ignore")
    if step_type == "end":
        builder.button(text="🔙 Выбрать другое начало", callback_data=AppAction(step="reselect_time_start"))
    builder.adjust(4)
    return builder.as_markup()


def get_review_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Изменить дату", callback_data="rev_edit_date")
    builder.button(text="✏️ Изменить объект", callback_data="rev_edit_obj")
    builder.button(text="✏️ Изменить бригаду", callback_data="rev_edit_team")
    builder.button(text="✏️ Изменить технику", callback_data="rev_edit_equip")
    builder.button(text="✏️ Изменить коммент", callback_data="rev_edit_comment")
    builder.button(text="✅ ОТПРАВИТЬ ЗАЯВКУ", callback_data="rev_confirm")
    builder.adjust(2, 2, 1, 1)
    return builder.as_markup()


def get_cancel_review_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Отмена редактирования", callback_data="rev_cancel_edit")
    return builder.as_markup()


def get_mod_panel_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="🔔 Напомнить должникам", callback_data="mod_remind_all")
    builder.adjust(1)
    return builder.as_markup()


def get_mod_take_kb(app_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="👀 Рассмотреть заявку", callback_data=f"mod_take_{app_id}")
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
    builder = InlineKeyboardBuilder()
    builder.button(text="✏️ Название", callback_data=f"eq_edit_name_{equip_id}")
    builder.button(text="📂 Категория", callback_data=f"eq_edit_cat_{equip_id}")
    builder.button(text="👨‍✈️ Водитель", callback_data=f"eq_edit_driver_{equip_id}")

    status_text = "🔴 Отключить" if is_active else "🟢 Включить (Неактивна)"
    builder.button(text=status_text, callback_data=f"eq_toggle_{equip_id}")
    builder.button(text="🗑 Удалить", callback_data=f"eq_delete_{equip_id}")
    builder.button(text="🔙 Назад", callback_data="admin_equip_list")
    builder.adjust(3, 1, 2)
    return builder.as_markup()
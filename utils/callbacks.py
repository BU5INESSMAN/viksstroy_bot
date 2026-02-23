from aiogram.filters.callback_data import CallbackData
from typing import Optional

class TeamCallback(CallbackData, prefix="team"):
    """Для управления бригадами и сотрудниками"""
    action: str          # view, create, edit_name, add_leader, add_member, delete_team
    team_id: int = 0     # ID бригады

class AppAction(CallbackData, prefix="app"):
    """Для процесса создания заявки"""
    step: str            # select_obj, select_team, toggle_staff, confirm_staff, etc.
    id: int = 0
    val: str = ""        # Используем val для строк и ID

class TimeAction(CallbackData, prefix="time"):
    """Для выбора времени в тайм-пикере"""
    type: str            # 'start' (начало) или 'end' (конец)
    hour: int            # Выбранный час
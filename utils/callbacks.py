from aiogram.filters.callback_data import CallbackData
from typing import Optional

class TeamCallback(CallbackData, prefix="team"):
    action: str
    team_id: Optional[int] = None    # Сделали Optional
    member_id: Optional[int] = None  # Сделали Optional

class AppAction(CallbackData, prefix="app"):
    """Для процесса создания заявки"""
    step: str            # select_obj, select_team, toggle_staff, confirm_staff, etc.
    id: int = 0
    val: str = ""        # Используем val для строк и ID

class TimeAction(CallbackData, prefix="time"):
    """Для выбора времени в тайм-пикере"""
    type: str            # 'start' (начало) или 'end' (конец)
    hour: int            # Выбранный час
from aiogram.filters.callback_data import CallbackData
from typing import Optional

class TeamCallback(CallbackData, prefix="team"):
    action: str
    team_id: Optional[int] = None
    member_id: Optional[int] = None

class AppAction(CallbackData, prefix="app"):
    step: str
    id: int = 0
    val: str = ""

class TimeAction(CallbackData, prefix="time"):
    type: str
    hour: int
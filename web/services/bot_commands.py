"""Shared bot-command registry used by both TG (main.py) and MAX (main_max.py).

Single source of truth for /start output and unknown-command fallback.

Each bot passes its own `available` set — the intersection of this intended
map with what is actually registered in that bot — so a command missing in
one bot is simply omitted from its displayed list.
"""
from __future__ import annotations

# Tuple of (command, role_min, description_ru)
# role_min uses the same rank scale as the rest of the app
BOT_COMMANDS = [
    # all roles
    ("/start",     "driver",     "показать список команд"),
    ("/help",      "driver",     "справка"),
    ("/profile",   "driver",     "мой профиль"),
    # foreman+
    ("/order",     "foreman",    "создать заявку"),
    ("/myorders",  "foreman",    "мои заявки"),
    ("/schedule",  "foreman",    "расписание на сегодня"),
    # moderator+
    ("/review",    "moderator",  "заявки на проверку"),
    ("/broadcast", "moderator",  "рассылка сообщения"),
    ("/debtors",   "moderator",  "должники СМР"),
    # superadmin
    ("/backup",    "superadmin", "резервная копия БД"),
    ("/logs",      "superadmin", "журнал действий"),
]

ROLE_RANK = {
    "driver": 1, "worker": 2, "brigadier": 3,
    "foreman": 4, "moderator": 5, "boss": 6, "superadmin": 7,
}


def commands_for_role(user_role: str, available: set[str]) -> list[tuple[str, str]]:
    """Return [(command, description), ...] for the given role, filtered to
    commands present in this bot's `available` set. Order is preserved from
    BOT_COMMANDS."""
    rank = ROLE_RANK.get(user_role, 0)
    out: list[tuple[str, str]] = []
    for cmd, min_role, desc in BOT_COMMANDS:
        if ROLE_RANK.get(min_role, 999) > rank:
            continue
        if cmd not in available:
            continue
        out.append((cmd, desc))
    return out


def format_commands_message(user_role: str, available: set[str]) -> str:
    """Plain-text list shown to the user. No markdown, no emojis — both TG
    and MAX render plain text uniformly."""
    cmds = commands_for_role(user_role, available)
    if not cmds:
        return "Доступных команд нет. Обратитесь к администратору."

    header = "Доступные команды:"
    lines = [f"{cmd} — {desc}" for cmd, desc in cmds]
    footer = "\nЕсли команда не распознана, этот список появится снова."
    return f"{header}\n\n" + "\n".join(lines) + f"\n{footer}"


def warn_missing_commands(logger, bot_name: str, available: set[str]) -> None:
    """Log a diagnostic warning for each intended command missing from this
    bot's handler set. Never fails startup."""
    intended = {cmd for cmd, _, _ in BOT_COMMANDS}
    for cmd in intended - available:
        logger.warning(f"[{bot_name}] Bot command {cmd} listed but no handler registered")

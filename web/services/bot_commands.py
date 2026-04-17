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


# ─────────────────────────────────────────────────────────────
# Shared text builders for command handlers (TG + MAX parity)
# ─────────────────────────────────────────────────────────────

_ROLE_NAMES_RU = {
    'superadmin': 'Супер-Админ',
    'boss': 'Руководитель',
    'moderator': 'Модератор',
    'foreman': 'Прораб',
    'brigadier': 'Бригадир',
    'worker': 'Рабочий',
    'driver': 'Водитель',
}

_STATUS_NAMES_RU = {
    'waiting': 'Ожидает',
    'pending': 'Ожидает',
    'approved': 'Одобрена',
    'rejected': 'Отклонена',
    'published': 'Опубликована',
    'in_progress': 'В работе',
    'completed': 'Завершена',
    'cancelled': 'Отменена',
}


async def get_user_profile_text(db, user_id: int) -> str:
    """Format user profile as plain text for bot display."""
    user = await db.get_user(user_id)
    if not user:
        return "Профиль не найден."
    u = dict(user)
    fio = u.get('fio') or 'Не указано'
    role = u.get('role') or 'worker'
    specialty = (u.get('specialty') or '').strip()
    lines = [
        f"ФИО: {fio}",
        f"Роль: {_ROLE_NAMES_RU.get(role, role)}",
    ]
    if specialty:
        lines.append(f"Специальность: {specialty}")
    return "\n".join(lines)


async def get_my_orders_text(db, user_id: int) -> str:
    """Format a user's recent applications as plain text."""
    try:
        rows = await db.get_user_applications(user_id)
    except Exception:
        return "Не удалось получить заявки."
    apps = [dict(r) for r in (rows or [])]
    if not apps:
        return "У вас нет активных заявок."
    lines = ["Ваши последние заявки:", ""]
    for a in apps[:10]:
        status = _STATUS_NAMES_RU.get(a.get('status', ''), a.get('status', ''))
        obj = a.get('object_address') or '—'
        line = f"№{a.get('id', '?')} — {obj} — {status}"
        if a.get('date_target'):
            line += f" — {a['date_target']}"
        lines.append(line)
    return "\n".join(lines)


async def get_debtors_text(db) -> str:
    """SMR debtors formatted as plain text."""
    try:
        from services.schedule_helpers import get_smr_debtors
        debtors = await get_smr_debtors()
    except Exception:
        return "Не удалось получить список должников."
    if not debtors:
        return "Должников СМР нет."
    lines = [f"Должники СМР ({len(debtors)}):", ""]
    for d in debtors[:20]:
        obj = d.get('object_name') or d.get('object_address') or '—'
        lines.append(f"• {d.get('foreman_name', '?')} — {obj} ({d.get('date_target', '?')})")
    if len(debtors) > 20:
        lines.append(f"... и ещё {len(debtors) - 20}")
    return "\n".join(lines)


async def get_review_text(db) -> str:
    """Pending-review applications as plain text."""
    try:
        async with db.conn.execute(
            "SELECT a.id, a.foreman_name, a.date_target, "
            "       COALESCE(NULLIF(o.name,''), a.object_address) AS obj "
            "FROM applications a "
            "LEFT JOIN objects o ON o.id = a.object_id "
            "WHERE a.status = 'waiting' "
            "ORDER BY a.date_target ASC, a.id ASC"
        ) as cur:
            rows = [dict(zip([c[0] for c in cur.description], r)) for r in await cur.fetchall()]
    except Exception:
        return "Не удалось получить заявки на проверку."
    if not rows:
        return "Нет заявок на проверку."
    lines = [f"Заявки на проверку ({len(rows)}):", ""]
    for a in rows[:15]:
        lines.append(f"№{a.get('id', '?')} — {a.get('foreman_name', '?')} — {a.get('obj', '—')} ({a.get('date_target', '?')})")
    if len(rows) > 15:
        lines.append(f"... и ещё {len(rows) - 15}")
    return "\n".join(lines)

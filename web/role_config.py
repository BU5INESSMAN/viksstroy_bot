"""Canonical backend role definitions.

Keep authorization and automatic role-assignment paths on the same list so a
new role cannot appear in the UI while being rejected or silently overwritten
by the server.
"""

ROLE_RANKS = {
    "driver": 1,
    "worker": 2,
    "brigadier": 3,
    "foreman": 4,
    "hr": 5,
    "moderator": 6,
    "boss": 7,
    "superadmin": 8,
}

ASSIGNABLE_ROLES = frozenset(ROLE_RANKS)

# Joining a team or redeeming an equipment invite may convert an ordinary
# worker/driver account, but must never overwrite an explicitly assigned
# organizational or elevated role.
AUTO_ROLE_PROTECTED = frozenset({
    "brigadier",
    "foreman",
    "hr",
    "moderator",
    "boss",
    "superadmin",
})

ROLE_NAMES_RU = {
    "superadmin": "Супер-Админ",
    "boss": "Руководитель",
    "moderator": "Модератор",
    "hr": "Отдел кадров",
    "foreman": "Прораб",
    "brigadier": "Бригадир",
    "worker": "Рабочий",
    "driver": "Водитель",
}


async def can_change_role(actor: dict, target: dict, new_role: str, db_manager) -> tuple[bool, str]:
    """Authorize a role change using the canonical catalog."""
    if new_role not in ASSIGNABLE_ROLES:
        return False, "Неизвестная роль"
    if actor.get("user_id") == target.get("user_id"):
        return False, "Нельзя изменять свою роль"

    actor_role = actor.get("role")
    target_role = target.get("role")
    if actor_role not in ("boss", "superadmin"):
        return False, "Недостаточно прав"

    if actor_role == "superadmin":
        if target_role == "superadmin" and new_role != "superadmin":
            count = await db_manager.count_users_by_role("superadmin")
            if count <= 1:
                return False, "Нельзя понизить последнего супер-админа"
        return True, ""

    if target_role == "superadmin" or new_role == "superadmin":
        return False, "Недостаточно прав для работы с супер-админом"
    return True, ""

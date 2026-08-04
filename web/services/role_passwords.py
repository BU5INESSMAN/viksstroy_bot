"""Database-backed role passwords with environment fallback."""

from __future__ import annotations

import os
import secrets


ROLE_PASSWORDS = {
    "employee": ("role_password_employee", "EMPLOYEE_PASS"),
    "foreman": ("role_password_foreman", "FOREMAN_PASS"),
    "moderator": ("role_password_moderator", "MODERATOR_PASS"),
    "boss": ("role_password_boss", "BOSS_PASS"),
    "superadmin": ("role_password_superadmin", "SUPERADMIN_PASS"),
}


async def get_role_passwords(db) -> dict[str, str]:
    keys = [item[0] for item in ROLE_PASSWORDS.values()]
    placeholders = ",".join("?" for _ in keys)
    stored: dict[str, str] = {}
    async with db.conn.execute(
        f"SELECT key,value FROM settings WHERE key IN ({placeholders})", keys
    ) as cur:
        for key, value in await cur.fetchall():
            stored[key] = value or ""
    return {
        role: stored.get(setting_key) or os.getenv(env_key, "")
        for role, (setting_key, env_key) in ROLE_PASSWORDS.items()
    }


async def match_role_password(db, provided: str) -> str | None:
    if not provided:
        return None
    for role, expected in (await get_role_passwords(db)).items():
        if expected and secrets.compare_digest(provided, expected):
            return role
    return None


async def set_role_password(db, role: str, password: str) -> None:
    if role not in ROLE_PASSWORDS:
        raise ValueError("unknown role")
    setting_key = ROLE_PASSWORDS[role][0]
    await db.conn.execute(
        "INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
        (setting_key, password),
    )
    await db.conn.commit()

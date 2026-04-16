"""Authentication dependencies for FastAPI endpoints.

Replaces the vulnerable pattern of trusting `tg_id` query params.
Validates session cookie, returns authenticated user dict.

Usage:
    from auth_deps import get_current_user, require_role

    @router.get("/api/protected")
    async def endpoint(user=Depends(get_current_user)):
        real_tg_id = user["user_id"]
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import Request, HTTPException, Depends

from database_deps import db
from utils import resolve_id


async def get_current_user(request: Request):
    """Validate session cookie, return authenticated user dict.

    Raises HTTPException 401 if not authenticated, 403 if blacklisted.
    The returned dict contains all ``users`` table columns plus a
    ``tg_id`` alias that mirrors ``user_id`` for backward compat.
    """
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизован")

    if db.conn is None:
        await db.init_db()

    async with db.conn.execute(
        "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')",
        (token,),
    ) as cur:
        row = await cur.fetchone()

    if not row:
        # Clean up expired / invalid token
        try:
            await db.conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            await db.conn.commit()
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Сессия не найдена или истекла")

    raw_user_id = row[0]
    user_id = await resolve_id(raw_user_id)
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    user_dict = dict(user)
    if user_dict.get("is_blacklisted"):
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    # Alias so callers can use either user["user_id"] or user["tg_id"]
    user_dict["tg_id"] = user_dict["user_id"]
    return user_dict


async def get_current_user_optional(request: Request):
    """Same as get_current_user but returns ``None`` instead of raising 401.

    Use for endpoints that work both authenticated and anonymously.
    """
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def require_role(*allowed_roles: str):
    """Factory for role-based auth dependency.

    Usage::

        @router.get("/admin")
        async def endpoint(user=Depends(require_role("superadmin", "boss"))):
            ...
    """

    async def _role_check(request: Request):
        user = await get_current_user(request)
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return user

    return _role_check


# ── Common role groups ──────────────────────────────────────
require_office = require_role("superadmin", "boss", "moderator")
require_boss_plus = require_role("superadmin", "boss")
require_superadmin = require_role("superadmin")

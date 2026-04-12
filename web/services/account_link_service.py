import asyncio
import time
import logging

from database_deps import db
from utils import resolve_id, get_all_linked_ids
from services.notifications import notify_role_conflict

logger = logging.getLogger(__name__)


async def determine_primary(user1_id: int, user2_id: int) -> tuple[int, int]:
    """Определяет primary аккаунт по created_at, затем по количеству заявок."""
    async with db.conn.execute(
        "SELECT user_id, created_at FROM users WHERE user_id IN (?, ?)",
        (user1_id, user2_id)
    ) as cur:
        rows = {r[0]: r[1] for r in await cur.fetchall()}

    created1 = rows.get(user1_id)
    created2 = rows.get(user2_id)

    if created1 and created2 and created1 != created2:
        if created1 <= created2:
            return user1_id, user2_id
        else:
            return user2_id, user1_id

    async with db.conn.execute(
        "SELECT foreman_id, COUNT(*) as cnt FROM applications "
        "WHERE foreman_id IN (?, ?) GROUP BY foreman_id",
        (user1_id, user2_id)
    ) as cur:
        counts = {r[0]: r[1] for r in await cur.fetchall()}

    cnt1 = counts.get(user1_id, 0)
    cnt2 = counts.get(user2_id, 0)

    if cnt1 >= cnt2:
        return user1_id, user2_id
    return user2_id, user1_id


async def validate_link(current_user_id: int, target_user_id: int):
    """Общая валидация перед связыванием."""
    from fastapi import HTTPException

    if current_user_id == target_user_id:
        raise HTTPException(400, "Нельзя привязать аккаунт к самому себе")

    if (current_user_id > 0) == (target_user_id > 0):
        raise HTTPException(400, "Оба аккаунта на одной платформе")

    user1 = await db.get_user(current_user_id)
    user2 = await db.get_user(target_user_id)
    if not user1:
        raise HTTPException(404, f"Пользователь {current_user_id} не найден")
    if not user2:
        raise HTTPException(404, f"Пользователь {target_user_id} не найден")

    u1_linked = dict(user1).get('linked_user_id')
    u2_linked = dict(user2).get('linked_user_id')
    if u1_linked is not None:
        raise HTTPException(400, f"Аккаунт {current_user_id} уже связан с другим аккаунтом")
    if u2_linked is not None:
        raise HTTPException(400, f"Аккаунт {target_user_id} уже связан с другим аккаунтом")


async def link_account(current_user_id: int, link_code: str):
    """Связывание аккаунтов через одноразовый код. Returns result dict or raises."""
    from fastapi import HTTPException
    from services.account_merge import merge_accounts

    # 1. Ищем код в web_codes (MAX коды) и link_codes (TG коды)
    target_user_id = None

    async with db.conn.execute(
        "SELECT max_id, expires FROM web_codes WHERE code = ?", (link_code,)
    ) as cur:
        row = await cur.fetchone()
    if row:
        if time.time() > row[1]:
            raise HTTPException(400, "Код недействителен или устарел")
        target_user_id = -int(row[0])

    if target_user_id is None:
        async with db.conn.execute(
            "SELECT user_id, expires FROM link_codes WHERE code = ?", (link_code,)
        ) as cur:
            row = await cur.fetchone()
        if row:
            if time.time() > row[1]:
                raise HTTPException(400, "Код недействителен или устарел")
            target_user_id = row[0]

    if target_user_id is None:
        raise HTTPException(400, "Код недействителен или устарел")

    # 2. Валидация
    await validate_link(current_user_id, target_user_id)

    # 3. Определяем primary
    primary_id, secondary_id = await determine_primary(current_user_id, target_user_id)

    # 4. Слияние
    try:
        result = await merge_accounts(db, primary_id, secondary_id)
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка слияния аккаунтов: {e}")

    # Уведомление о конфликте ролей
    if result.get("role_conflict"):
        async def _send_role_conflict_notification():
            try:
                await notify_role_conflict(
                    primary_id, secondary_id,
                    result["primary_role"], result["secondary_role"]
                )
            except Exception as e:
                logger.error(f"Role conflict notification error: {e}")

        asyncio.create_task(_send_role_conflict_notification())

    # 5. Удаляем использованный код
    try:
        await db.conn.execute("DELETE FROM web_codes WHERE code = ?", (link_code,))
        await db.conn.execute("DELETE FROM link_codes WHERE code = ?", (link_code,))
        await db.conn.commit()
    except Exception:
        pass

    user_fio = ''
    u = await db.get_user(current_user_id)
    if u:
        user_fio = dict(u).get('fio', '')
    await db.add_log(current_user_id, user_fio,
                     f"Связал аккаунты {result['primary_id']} ↔ {result['secondary_id']}",
                     target_type='user', target_id=result['primary_id'])

    return {
        "success": True,
        "primary_user_id": result["primary_id"],
        "merged_user_id": result["secondary_id"],
        "role_conflict": result["role_conflict"],
    }


async def admin_link_accounts(admin_id: int, user_id_1: int, user_id_2: int):
    """Принудительное связывание аккаунтов администратором. Returns result dict or raises."""
    from fastapi import HTTPException
    from services.account_merge import merge_accounts

    admin = await db.get_user(admin_id)
    if not admin or dict(admin).get('role') not in ['superadmin', 'boss', 'moderator']:
        raise HTTPException(403, "Недостаточно прав для связывания аккаунтов")

    await validate_link(user_id_1, user_id_2)

    primary_id, secondary_id = await determine_primary(user_id_1, user_id_2)

    try:
        result = await merge_accounts(db, primary_id, secondary_id)
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка слияния аккаунтов: {e}")

    if result.get("role_conflict"):
        async def _send_admin_role_conflict():
            try:
                await notify_role_conflict(
                    primary_id, secondary_id,
                    result["primary_role"], result["secondary_role"]
                )
            except Exception as e:
                logger.error(f"Admin role conflict notification error: {e}")

        asyncio.create_task(_send_admin_role_conflict())

    admin_user = await db.get_user(admin_id)
    admin_fio = dict(admin_user).get('fio', 'Админ') if admin_user else 'Админ'
    await db.add_log(admin_id, admin_fio,
                     f"Принудительно связал аккаунты {result['primary_id']} ↔ {result['secondary_id']}",
                     target_type='user', target_id=result['primary_id'])

    return {
        "success": True,
        "primary_user_id": result["primary_id"],
        "merged_user_id": result["secondary_id"],
        "role_conflict": result["role_conflict"],
    }

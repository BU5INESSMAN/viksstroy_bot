import logging

from database_deps import db
from utils import resolve_id, get_all_linked_ids

logger = logging.getLogger(__name__)


async def delete_user_cascade(admin_id: int, target_id: int):
    """Delete user with cascade cleanup. Returns or raises HTTPException."""
    from fastapi import HTTPException

    user = await db.get_user(admin_id)
    if not user or dict(user).get('role') not in ['boss', 'superadmin']:
        raise HTTPException(403, "Только руководство может удалять пользователей")

    if admin_id == target_id:
        raise HTTPException(400, "Нельзя удалить самого себя")

    target_user = await db.get_user(target_id)
    target_fio = dict(target_user).get('fio', f'ID:{target_id}') if target_user else f'ID:{target_id}'

    try:
        await db.conn.execute("UPDATE team_members SET tg_user_id = NULL WHERE tg_user_id = ?", (target_id,))
        await db.conn.execute("UPDATE equipment SET tg_id = NULL WHERE tg_id = ?", (target_id,))
        await db.conn.execute("DELETE FROM account_links WHERE primary_id = ? OR secondary_id = ?",
                              (target_id, target_id))
        await db.conn.execute("DELETE FROM users WHERE user_id = ?", (target_id,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка удаления: {e}")

    admin_fio = dict(user).get('fio', 'Админ')
    await db.add_log(admin_id, admin_fio, f"Удалил пользователя {target_fio}", target_type='user', target_id=target_id)


async def unlink_user_platform(tg_id: int, platform: str):
    """Unlink a platform from user account. Returns or raises HTTPException."""
    from fastapi import HTTPException

    real_tg_id = await resolve_id(tg_id)

    linked_ids = await get_all_linked_ids(real_tg_id)
    if len(linked_ids) <= 1:
        raise HTTPException(400, "У вас нет привязанных устройств для отвязки")

    target_to_remove = None
    for lid in linked_ids:
        if platform == "max" and lid < 0:
            target_to_remove = lid
            break
        elif platform == "tg" and lid > 0 and lid != real_tg_id:
            target_to_remove = lid
            break

    if not target_to_remove:
        raise HTTPException(400, "Аккаунт этой платформы не найден")

    try:
        await db.conn.execute("DELETE FROM account_links WHERE secondary_id = ?", (target_to_remove,))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, "Ошибка отвязки")

    user = await db.get_user(real_tg_id)
    fio = dict(user).get('fio', '') if user else ''
    platform_name = "MAX" if platform == "max" else "Telegram"
    await db.add_log(real_tg_id, fio, f"Отвязал {platform_name} от аккаунта", target_type='user', target_id=real_tg_id)

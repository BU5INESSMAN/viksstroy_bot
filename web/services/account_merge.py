import logging
from database.db_manager import DatabaseManager

logger = logging.getLogger(__name__)

# Роли, при совпадении которых конфликт НЕ возникает
SAFE_ROLES = {'worker', 'viewer', 'linked'}


async def merge_accounts(db: DatabaseManager, primary_id: int, secondary_id: int) -> dict:
    """
    Объединяет secondary аккаунт В primary аккаунт.
    Primary сохраняет: fio, role, все настройки.
    Данные secondary переназначаются на primary, затем secondary деактивируется.
    """
    primary = await db.get_user(primary_id)
    secondary = await db.get_user(secondary_id)

    if not primary or not secondary:
        raise ValueError("Один из аккаунтов не найден")

    primary_dict = dict(primary)
    secondary_dict = dict(secondary)
    primary_fio = primary_dict.get('fio', '')
    secondary_fio = secondary_dict.get('fio', '')
    primary_role = primary_dict.get('role', 'worker')
    secondary_role = secondary_dict.get('role', 'worker')

    # a) Переназначить заявки
    await db.conn.execute(
        "UPDATE applications SET foreman_id = ? WHERE foreman_id = ?",
        (primary_id, secondary_id)
    )

    # b) Переназначить КП записи (application_kp не ссылается на user_id напрямую,
    #    но foreman_name в applications может содержать имя)
    await db.conn.execute(
        "UPDATE applications SET foreman_name = ? WHERE foreman_id = ?",
        (primary_fio, primary_id)
    )

    # c) Переназначить логи
    await db.conn.execute(
        "UPDATE logs SET tg_id = ? WHERE tg_id = ?",
        (primary_id, secondary_id)
    )

    # d) Переназначить бригады (создатель)
    await db.conn.execute(
        "UPDATE teams SET creator_id = ? WHERE creator_id = ?",
        (primary_id, secondary_id)
    )

    # e) Переназначить членство в бригадах
    await db.conn.execute(
        "UPDATE team_members SET tg_user_id = ? WHERE tg_user_id = ?",
        (primary_id, secondary_id)
    )
    await db.conn.execute(
        "UPDATE team_members SET tg_id = ? WHERE tg_id = ?",
        (primary_id, secondary_id)
    )

    # Переназначить привязку техники
    await db.conn.execute(
        "UPDATE equipment SET tg_id = ? WHERE tg_id = ?",
        (primary_id, secondary_id)
    )

    # Переназначить обмены техникой
    await db.conn.execute(
        "UPDATE equipment_exchanges SET requester_id = ? WHERE requester_id = ?",
        (primary_id, secondary_id)
    )
    await db.conn.execute(
        "UPDATE equipment_exchanges SET donor_id = ? WHERE donor_id = ?",
        (primary_id, secondary_id)
    )

    # f) Установить linked_user_id на ОБА аккаунта
    await db.conn.execute(
        "UPDATE users SET linked_user_id = ? WHERE user_id = ?",
        (secondary_id, primary_id)
    )
    await db.conn.execute(
        "UPDATE users SET linked_user_id = ? WHERE user_id = ?",
        (primary_id, secondary_id)
    )

    # g) Копировать платформенные настройки уведомлений
    if primary_id > 0:
        # Primary — TG, secondary — MAX: копируем MAX-настройки secondary → primary
        await db.conn.execute(
            "UPDATE users SET notify_max = ? WHERE user_id = ?",
            (secondary_dict.get('notify_max', 1), primary_id)
        )
    else:
        # Primary — MAX, secondary — TG: копируем TG-настройки secondary → primary
        await db.conn.execute(
            "UPDATE users SET notify_tg = ? WHERE user_id = ?",
            (secondary_dict.get('notify_tg', 1), primary_id)
        )

    # h) Деактивировать secondary аккаунт
    await db.conn.execute(
        "UPDATE users SET is_active = 0, role = 'linked' WHERE user_id = ?",
        (secondary_id,)
    )

    # Обновить account_links — удалить старые, создать новую запись
    await db.conn.execute(
        "DELETE FROM account_links WHERE primary_id = ? OR secondary_id = ? OR primary_id = ? OR secondary_id = ?",
        (primary_id, primary_id, secondary_id, secondary_id)
    )
    await db.conn.execute(
        "INSERT INTO account_links (primary_id, secondary_id) VALUES (?, ?)",
        (primary_id, secondary_id)
    )

    # i) Логировать слияние
    await db.conn.execute(
        "INSERT INTO logs (tg_id, fio, action) VALUES (?, ?, ?)",
        (primary_id, primary_fio,
         f"Слияние аккаунтов: {primary_fio} (ID {primary_id}) ← {secondary_fio} (ID {secondary_id})")
    )

    await db.conn.commit()

    # j) Определить конфликт ролей
    role_conflict = False
    if primary_role != secondary_role:
        if primary_role not in SAFE_ROLES and secondary_role not in SAFE_ROLES:
            role_conflict = True

    logger.info(
        f"Accounts merged: primary={primary_id} ({primary_role}), "
        f"secondary={secondary_id} ({secondary_role}), conflict={role_conflict}"
    )

    return {
        "primary_id": primary_id,
        "secondary_id": secondary_id,
        "primary_fio": primary_fio,
        "primary_role": primary_role,
        "secondary_role": secondary_role,
        "role_conflict": role_conflict,
    }

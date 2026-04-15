import asyncio
import json
import logging

from datetime import datetime
from database_deps import db, TZ_BARNAUL
from utils import resolve_id
from services.notifications import notify_users, notify_group_chat
from services.publish_service import execute_app_publish

logger = logging.getLogger(__name__)


ALLOWED_TRANSITIONS = {
    ('approved', 'in_progress'),
    ('in_progress', 'completed'),
    ('in_progress', 'approved'),  # ROLLBACK
}

STATUS_LABELS = {
    'approved': 'Одобрена',
    'in_progress': 'В работе',
    'completed': 'Завершена',
}

ROLE_NAMES = {
    'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор',
    'foreman': 'Прораб', 'brigadier': 'Бригадир', 'worker': 'Рабочий', 'driver': 'Водитель',
}


async def review_application(app_id: int, new_status: str, reason: str, tg_id: int):
    """Review (approve/reject/complete) an application. Returns app_dict for notifications."""
    from fastapi import HTTPException

    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    user_role = dict(user).get('role') if user else ''
    if user_role not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав на модерацию")

    mod_fio = dict(user).get('fio', 'Модератор') if user else 'Модератор'

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()
    if not app_row: raise HTTPException(404, "Заявка не найдена")
    app_dict = dict(zip([c[0] for c in cur.description], app_row))

    try:
        if new_status == 'approved':
            await db.conn.execute(
                "UPDATE applications SET status = ?, approved_by = ?, approved_by_id = ? WHERE id = ?",
                (new_status, mod_fio, real_tg_id, app_id))
        elif new_status == 'completed':
            now_ts = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d %H:%M:%S")
            await db.conn.execute("UPDATE applications SET status = ?, completed_at = ? WHERE id = ?", (new_status, now_ts, app_id))
        else:
            await db.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (new_status, app_id))

        if new_status in ['completed', 'rejected']:
            if app_dict.get('equipment_data'):
                try:
                    eq_list = json.loads(app_dict['equipment_data'])
                    for e in eq_list: await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?",
                                                            (e['id'],))
                except:
                    pass
            all_team_ids_str = str(app_dict.get('team_id') or "")
            if all_team_ids_str and all_team_ids_str != '0':
                await db.conn.execute(
                    "UPDATE applications SET is_team_freed = 1, freed_team_ids = ? WHERE id = ?",
                    (all_team_ids_str, app_id))
        await db.conn.commit()

        # Cancel pending exchanges involving this application on approval
        if new_status == 'approved':
            try:
                import asyncio
                async with db.conn.execute(
                    "SELECT * FROM equipment_exchanges WHERE (donor_app_id = ? OR requester_app_id = ?) AND status = 'pending'",
                    (app_id, app_id)
                ) as ex_cur:
                    pending_exchanges = [dict(zip([c[0] for c in ex_cur.description], r)) for r in await ex_cur.fetchall()]
                for ex in pending_exchanges:
                    await db.resolve_exchange(ex['id'], 'expired')
                    asyncio.create_task(notify_users(
                        [], f"⚠️ Обмен отменён: заявка была одобрена модератором.",
                        "dashboard", extra_tg_ids=[ex['requester_id'], ex['donor_id']]
                    ))
            except Exception as exc_err:
                logger.error(f"Error cancelling exchanges on approve: {exc_err}")

    except:
        await db.conn.rollback()

    action_label = "Одобрил" if new_status == 'approved' else ("Отклонил" if new_status == 'rejected' else "Завершил")
    obj_addr = app_dict.get('object_address', '') or ''
    log_msg = f"{action_label} заявку на {obj_addr}" if obj_addr else f"{action_label} заявку №{app_id}"
    if new_status == 'rejected' and reason:
        log_msg += f": {reason}"
    await db.add_log(real_tg_id, mod_fio, log_msg, target_type='application', target_id=app_id)

    return app_dict, mod_fio, real_tg_id, new_status, reason


async def send_review_notifications(app_id, app_dict, mod_fio, new_status, reason):
    """Background notification task after review."""
    try:
        status_ru = "✅ Одобрена" if new_status == 'approved' else (
            "❌ Отклонена / Отозвана" if new_status == 'rejected' else "🏁 Досрочно завершена")
        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")

        msg_group = f"📋 <b>Заявка №{app_id} {status_ru}</b>\n👤 Проверил: {mod_fio}\n📍 Объект: {app_dict['object_address']}\n🕒 Время: {now}"
        if reason: msg_group += f"\n💬 Причина: {reason}"
        await notify_users(["report_group", "boss", "superadmin"], msg_group, "review", category="orders")

        if new_status in ['approved', 'rejected']:
            msg_foreman = f"🔔 <b>Ваша заявка {status_ru}!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
            if reason: msg_foreman += f"\n💬 Причина: {reason}"
            await notify_users([], msg_foreman, "dashboard", extra_tg_ids=[app_dict['foreman_id']], category="orders")

            if new_status == 'approved':
                workers_ids = []
                selected_members = app_dict.get('selected_members', '')
                if selected_members:
                    m_ids = [int(x.strip()) for x in selected_members.split(',') if x.strip().isdigit()]
                    if m_ids:
                        pl = ','.join(['?'] * len(m_ids))
                        async with db.conn.execute(f"SELECT tg_user_id FROM team_members WHERE id IN ({pl})", m_ids) as c:
                            for r in await c.fetchall():
                                if r[0]: workers_ids.append(r[0])

                drivers_ids = []
                eq_data_str = app_dict.get('equipment_data', '')
                if eq_data_str:
                    try:
                        eq_list = json.loads(eq_data_str)
                        for e in eq_list:
                            async with db.conn.execute("SELECT tg_id FROM equipment WHERE id = ?", (e['id'],)) as c:
                                eq_row = await c.fetchone()
                                if eq_row and eq_row[0]: drivers_ids.append(eq_row[0])
                    except:
                        pass

                all_involved = list(set(workers_ids + drivers_ids))
                if all_involved:
                    msg_inv = f"👷‍♂️ <b>Вас добавили в наряд! (Предварительная бронь)</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}\n\nОжидайте публикации наряда."
                    await notify_users([], msg_inv, "my-apps", extra_tg_ids=all_involved, category="orders")
    except Exception as e:
        logger.error(f"Background notification error for app #{app_id}: {e}")


async def change_application_status(app_id: int, new_status: str, tg_id: int):
    """Manual status change (Stage 4.1). Returns (app_dict, mod_fio, real_tg_id, current_status)."""
    from fastapi import HTTPException

    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    user_role = dict(user).get('role') if user else ''
    if user_role not in ('admin', 'superadmin'):
        raise HTTPException(403, "Нет прав для смены статуса")

    mod_fio = dict(user).get('fio', 'Админ')

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()
    if not app_row:
        raise HTTPException(404, "Заявка не найдена")
    app_dict = dict(zip([c[0] for c in cur.description], app_row))

    current_status = app_dict.get('status')
    if (current_status, new_status) not in ALLOWED_TRANSITIONS:
        raise HTTPException(400, "Недопустимый переход статуса")

    try:
        if current_status == 'in_progress' and new_status == 'approved':
            await db.conn.execute("DELETE FROM application_kp WHERE application_id = ?", (app_id,))
            await db.conn.execute(
                "UPDATE applications SET status = 'approved', is_published = 0, is_archived = 0 WHERE id = ?",
                (app_id,))
        elif new_status == 'completed':
            now_ts = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d %H:%M:%S")
            await db.conn.execute(
                "UPDATE applications SET status = ?, completed_at = ? WHERE id = ?",
                (new_status, now_ts, app_id))
        else:
            await db.conn.execute(
                "UPDATE applications SET status = ? WHERE id = ?",
                (new_status, app_id))
        await db.conn.commit()
    except Exception as e:
        await db.conn.rollback()
        raise HTTPException(500, f"Ошибка обновления: {e}")

    await db.add_log(real_tg_id, mod_fio,
                     f"Изменил статус заявки №{app_id}: {STATUS_LABELS.get(current_status, current_status)} → {STATUS_LABELS.get(new_status, new_status)}",
                     target_type='application', target_id=app_id)

    return app_dict, mod_fio, real_tg_id


async def send_status_change_notification(app_id, app_dict, new_status):
    """Background notification after status change."""
    try:
        label = STATUS_LABELS.get(new_status, new_status)
        msg = f"📋 Статус заявки «{app_dict.get('object_address', '—')}» изменён на «{label}»"
        await notify_users([], msg, "my-apps", extra_tg_ids=[app_dict['foreman_id']], category="orders")
    except Exception as e:
        logger.error(f"Background notification error for status change app #{app_id}: {e}")


async def publish_applications(app_ids_str: str, tg_id: int):
    """Publish approved applications. Returns count."""
    from fastapi import HTTPException
    ids = [int(x) for x in app_ids_str.split(',') if x.strip().isdigit()]
    if not ids: raise HTTPException(400, "Нет выбранных заявок")
    pl = ','.join(['?'] * len(ids))
    async with db.conn.execute(f"SELECT * FROM applications WHERE status = 'approved' AND id IN ({pl})", ids) as cur:
        apps = [dict(zip([c[0] for c in cur.description], row)) for row in await cur.fetchall()]
    if not apps: raise HTTPException(status_code=400, detail="Заявки не найдены")

    count = 0
    for app_dict in apps:
        if await execute_app_publish(app_dict): count += 1

    user = await db.get_user(tg_id)
    fio = dict(user).get('fio', 'Руководство') if user else "Руководство"
    await db.add_log(tg_id, fio, f"Опубликовал {count} нарядов в группу", target_type='application')
    return count, fio


async def free_equipment(app_id: int, tg_id: int):
    """Free driver's equipment from an application. Returns (eq_name, fio, role_label)."""
    from fastapi import HTTPException
    from services.app_service import ensure_app_columns
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user: raise HTTPException(403)

    async with db.conn.execute("SELECT id FROM equipment WHERE tg_id = ?", (real_tg_id,)) as cur:
        eq_row = await cur.fetchone()
    if not eq_row: raise HTTPException(404, "Ваша техника не найдена")
    my_eq_id = eq_row[0]

    await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (my_eq_id,))

    async with db.conn.execute("SELECT equipment_data, object_address FROM applications WHERE id = ?",
                               (app_id,)) as cur:
        app_row = await cur.fetchone()

    obj_addr = ""
    if app_row and app_row[0]:
        eq_data_str = app_row[0]
        obj_addr = app_row[1]
        try:
            eq_list = json.loads(eq_data_str)
            for eq in eq_list:
                if eq['id'] == my_eq_id:
                    eq['is_freed'] = True
            new_eq_data = json.dumps(eq_list, ensure_ascii=False)
            await db.conn.execute("UPDATE applications SET equipment_data = ? WHERE id = ?", (new_eq_data, app_id))
        except:
            pass

    await db.conn.commit()
    fio = dict(user).get('fio', '')
    user_role = dict(user).get('role', 'Водитель')
    try:
        async with db.conn.execute("SELECT object_address FROM applications WHERE id = ?", (app_id,)) as _c:
            _r = await _c.fetchone()
            _obj = _r[0] if _r else ''
    except Exception:
        _obj = ''
    await db.add_log(real_tg_id, fio, f"Освободил технику ({_obj})" if _obj else f"Освободил технику в заявке №{app_id}", target_type='application', target_id=app_id)

    async with db.conn.execute("SELECT name FROM equipment WHERE id = ?", (my_eq_id,)) as cur:
        eq_name_row = await cur.fetchone()
    eq_name = eq_name_row[0] if eq_name_row else "Техника"

    role_label = ROLE_NAMES.get(user_role, user_role)

    async def _send_free_equip_notification():
        try:
            await notify_group_chat(f"{eq_name} освобожден(а) {fio} ({role_label})", "equipment")
        except Exception as e:
            logger.error(f"Free equipment notification error: {e}")

    asyncio.create_task(_send_free_equip_notification())


async def free_team(app_id: int, tg_id: int, team_id: int):
    """Free a team (or all teams) from an application."""
    from fastapi import HTTPException
    from services.app_service import ensure_app_columns
    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)

    async with db.conn.execute("SELECT object_address, team_id, freed_team_ids FROM applications WHERE id = ?",
                               (app_id,)) as cur:
        app_row = await cur.fetchone()
        if not app_row:
            raise HTTPException(404, "Заявка не найдена")
        obj_addr = app_row[0]
        all_team_ids_str = str(app_row[1] or "")
        freed_str = str(app_row[2] or "")

    freed_list = [int(x) for x in freed_str.split(',') if x.strip().isdigit()]
    all_t_ids = [int(x) for x in all_team_ids_str.split(',') if x.strip().isdigit()]

    fio = dict(user).get('fio', '') if user else ''
    user_role = dict(user).get('role', '') if user else ''
    role_label = ROLE_NAMES.get(user_role, user_role)

    if team_id > 0:
        if team_id not in freed_list:
            freed_list.append(team_id)
        new_freed_str = ",".join(map(str, freed_list))
        await db.conn.execute("UPDATE applications SET freed_team_ids = ? WHERE id = ?", (new_freed_str, app_id))

        if set(all_t_ids).issubset(set(freed_list)) and len(all_t_ids) > 0:
            await db.conn.execute("UPDATE applications SET is_team_freed = 1 WHERE id = ?", (app_id,))

        await db.conn.commit()

        async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,)) as cur:
            t_row = await cur.fetchone()
            t_name = t_row[0] if t_row else f"ID:{team_id}"

        await db.add_log(real_tg_id, fio, f"Освободил бригаду «{t_name}» в заявке №{app_id}", target_type='application', target_id=app_id)

        async def _send_free_team_notification():
            try:
                await notify_group_chat(f"Бригада «{t_name}» освобожден(а) {fio} ({role_label})", "dashboard")
            except Exception as e:
                logger.error(f"Free team notification error: {e}")

        asyncio.create_task(_send_free_team_notification())

    else:
        await db.conn.execute("UPDATE applications SET is_team_freed = 1, freed_team_ids = ? WHERE id = ?",
                              (all_team_ids_str, app_id))
        await db.conn.commit()
        await db.add_log(real_tg_id, fio, f"Освободил все бригады в заявке №{app_id}", target_type='application', target_id=app_id)

        async def _send_free_all_teams_notification():
            try:
                await notify_group_chat(f"Все бригады освобожден(а) {fio} ({role_label})", "dashboard")
            except Exception as e:
                logger.error(f"Free all teams notification error: {e}")

        asyncio.create_task(_send_free_all_teams_notification())


async def archive_application(app_id: int, tg_id: int):
    """Archive a completed application."""
    from fastapi import HTTPException
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав для архивации")

    async with db.conn.execute("SELECT status FROM applications WHERE id = ?", (app_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Заявка не найдена")
    if row[0] != 'completed':
        raise HTTPException(400, "Архивировать можно только завершённые заявки")

    await db.conn.execute("UPDATE applications SET is_archived = 1 WHERE id = ?", (app_id,))
    await db.conn.commit()

    fio = dict(user).get('fio', 'Модератор')
    try:
        async with db.conn.execute("SELECT object_address FROM applications WHERE id = ?", (app_id,)) as _c:
            _r = await _c.fetchone()
            _obj = _r[0] if _r else ''
    except Exception:
        _obj = ''
    await db.add_log(real_tg_id, fio, f"Архивировал заявку на {_obj}" if _obj else f"Архивировал заявку №{app_id}", target_type='application', target_id=app_id)


async def unarchive_application(app_id: int, tg_id: int):
    """Restore an archived application back to active state."""
    from fastapi import HTTPException
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав для восстановления из архива")

    async with db.conn.execute("SELECT is_archived, object_address FROM applications WHERE id = ?", (app_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Заявка не найдена")
    if not row[0]:
        raise HTTPException(400, "Заявка не находится в архиве")

    await db.conn.execute("UPDATE applications SET is_archived = 0 WHERE id = ?", (app_id,))
    await db.conn.commit()

    fio = dict(user).get('fio', 'Модератор')
    _obj = row[1] or ''
    await db.add_log(real_tg_id, fio, f"Восстановил заявку на {_obj}" if _obj else f"Восстановил заявку №{app_id}", target_type='application', target_id=app_id)


async def remind_foreman_smr(app_id: int, tg_id: int):
    """Send SMR reminder to foreman. Returns app_dict for notification."""
    from fastapi import HTTPException
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get('role') not in ['moderator', 'boss', 'superadmin']:
        raise HTTPException(403, "Нет прав для отправки напоминаний")

    async with db.conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)) as cur:
        app_row = await cur.fetchone()
    if not app_row:
        raise HTTPException(404, "Заявка не найдена")

    app_dict = dict(zip([c[0] for c in cur.description], app_row))
    foreman_id = app_dict.get('foreman_id')
    if not foreman_id:
        raise HTTPException(400, "У заявки не указан прораб")

    mod_fio = dict(user).get('fio', 'Модератор')
    await db.add_log(real_tg_id, mod_fio, f"Отправил напоминание прорабу по заявке №{app_id}", target_type='application', target_id=app_id)

    return app_dict


async def send_remind_notification(app_dict):
    """Background: send SMR reminder to foreman."""
    try:
        object_name = app_dict.get('object_address', 'Неизвестный объект')
        date_target = app_dict.get('date_target', '')
        foreman_id = app_dict.get('foreman_id')
        msg = f"⚠️ <b>Напоминание:</b> Необходимо заполнить СМР по объекту <b>{object_name}</b> на дату <b>{date_target}</b>"
        await notify_users([], msg, "kp", extra_tg_ids=[foreman_id], category="reports")
    except Exception as e:
        logger.error(f"Error sending SMR reminder for app #{app_dict.get('id')}: {e}")

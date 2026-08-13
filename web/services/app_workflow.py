import asyncio
import json
import logging

from datetime import datetime
from database_deps import db, TZ_BARNAUL
from utils import resolve_id
from services.notifications import notify_users
from services.publish_service import execute_app_publish
from application_numbers import display_application_number

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
    'foreman': 'Прораб', 'brigadier': 'Бригадир', 'worker': 'Рабочий', 'employee': 'Сотрудник', 'driver': 'Водитель',
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
        elif new_status == 'waiting':
            # Recall (Отозвать): revert an approved order back to review ("на рассмотрении").
            # Clear the approval stamp and mark each equipment is_freed in the JSON
            # (display parity with the driver free path). The actual slot release runs
            # in the shared block below — is_team_freed=1 is the lever that makes
            # check_resource_availability recompute the slots as available; a plain
            # status revert does NOT free, because 'waiting' still occupies.
            recall_eq_data = app_dict.get('equipment_data') or ''
            if recall_eq_data:
                try:
                    _eq_list = json.loads(recall_eq_data)
                    for _e in _eq_list:
                        _e['is_freed'] = True
                    recall_eq_data = json.dumps(_eq_list, ensure_ascii=False)
                except:
                    recall_eq_data = app_dict.get('equipment_data') or ''
            await db.conn.execute(
                "UPDATE applications SET status = 'waiting', approved_by = NULL, approved_by_id = NULL, equipment_data = ? WHERE id = ?",
                (recall_eq_data, app_id))
        else:
            await db.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (new_status, app_id))

        if new_status in ['completed', 'rejected', 'waiting']:
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
                        "dashboard", extra_tg_ids=[ex['requester_id'], ex['donor_id']], event_key="exchange_result"
                    ))
            except Exception as exc_err:
                logger.error(f"Error cancelling exchanges on approve: {exc_err}")

    except:
        await db.conn.rollback()

    obj_addr = app_dict.get('object_address', '') or ''
    if new_status == 'waiting':
        log_msg = f"Отозвал заявку на доработку ({obj_addr})" if obj_addr else f"Отозвал заявку на доработку №{app_id}"
    else:
        action_label = "Одобрил" if new_status == 'approved' else ("Отклонил" if new_status == 'rejected' else "Завершил")
        log_msg = f"{action_label} заявку на {obj_addr}" if obj_addr else f"{action_label} заявку №{app_id}"
    if new_status == 'rejected' and reason:
        log_msg += f": {reason}"
    await db.add_log(real_tg_id, mod_fio, log_msg, target_type='application', target_id=app_id)

    return app_dict, mod_fio, real_tg_id, new_status, reason


async def send_review_notifications(app_id, app_dict, mod_fio, new_status, reason):
    """Background notification task after review."""
    try:
        status_ru = "✅ Одобрена" if new_status == 'approved' else (
            "❌ Отклонена / Отозвана" if new_status == 'rejected' else (
                "🔄 Отозвана на доработку" if new_status == 'waiting' else "🏁 Досрочно завершена"))
        now = datetime.now(TZ_BARNAUL).strftime("%H:%M:%S")
        app_number = display_application_number(app_id, app_dict.get("public_number"))

        msg_group = f"📋 <b>Заявка {app_number} {status_ru}</b>\n👤 Проверил: {mod_fio}\n📍 Объект: {app_dict['object_address']}\n🕒 Время: {now}"
        if reason: msg_group += f"\n💬 Причина: {reason}"
        await notify_users(["boss", "superadmin"], msg_group, "review", category="orders", event_key="app_status_changed")

        if new_status in ['approved', 'rejected', 'waiting']:
            if new_status == 'waiting':
                msg_foreman = (f"🔄 <b>Ваш наряд отозван на доработку</b>\n"
                               f"🔖 {app_number}\n"
                               f"Заявка возвращена на рассмотрение — отредактируйте и отправьте повторно.\n"
                               f"📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}")
            else:
                msg_foreman = f"🔔 <b>Ваша заявка {app_number} {status_ru}!</b>\n📍 Объект: {app_dict['object_address']}\n📅 Дата: {app_dict['date_target']}"
            if reason: msg_foreman += f"\n💬 Причина: {reason}"
            status_event = "app_approved" if new_status == "approved" else "app_rejected" if new_status == "rejected" else "app_status_changed"
            await notify_users([], msg_foreman, "dashboard", extra_tg_ids=[app_dict['foreman_id']], category="orders", event_key=status_event)

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
                    await notify_users([], msg_inv, "my-apps", extra_tg_ids=all_involved, category="orders", event_key="app_assignment")
    except Exception as e:
        logger.error(f"Background notification error for app #{app_id}: {e}")


async def change_application_status(app_id: int, new_status: str, tg_id: int):
    """Manual status change (Stage 4.1). Returns (app_dict, mod_fio, real_tg_id, current_status)."""
    from fastapi import HTTPException

    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    user_role = dict(user).get('role') if user else ''
    if user_role not in ('moderator', 'boss', 'superadmin'):
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
        await notify_users([], msg, "my-apps", extra_tg_ids=[app_dict['foreman_id']], category="orders", event_key="app_status_changed")
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

    async with db.conn.execute("SELECT equipment_data, object_address, foreman_id,status,date_target FROM applications WHERE id = ?",
                               (app_id,)) as cur:
        app_row = await cur.fetchone()

    if not app_row:
        raise HTTPException(404, "Заявка не найдена")
    if app_row[3] not in ("approved", "published", "in_progress"):
        raise HTTPException(400, "Технику можно освободить только из активной заявки")
    if str(app_row[4] or "") != datetime.now(TZ_BARNAUL).date().isoformat():
        raise HTTPException(400, "Технику можно освободить только из заявки на сегодня")

    await db.conn.execute("UPDATE equipment SET status = 'free' WHERE id = ?", (my_eq_id,))

    obj_addr = ""
    foreman_id = None
    obj_addr = app_row[1]
    foreman_id = app_row[2]
    if app_row and app_row[0]:
        eq_data_str = app_row[0]
        try:
            eq_list = json.loads(eq_data_str)
            released_at = datetime.now(TZ_BARNAUL).isoformat(timespec="seconds")
            for eq in eq_list:
                if eq['id'] == my_eq_id:
                    eq['is_freed'] = True
                    eq['released_at'] = released_at
            new_eq_data = json.dumps(eq_list, ensure_ascii=False)
            await db.conn.execute("UPDATE applications SET equipment_data = ? WHERE id = ?", (new_eq_data, app_id))
        except:
            pass

    await db.conn.execute(
        "INSERT OR IGNORE INTO application_resource_releases "
        "(application_id,resource_type,resource_id,released_at,released_by) VALUES (?,?,?,?,?)",
        (app_id, "equipment", my_eq_id, datetime.now(TZ_BARNAUL).isoformat(timespec="seconds"), real_tg_id),
    )
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
            await notify_users(
                ["moderator", "boss", "superadmin"],
                f"🟢 <b>Техника освобождена</b>\n🚜 {eq_name}\n👤 {fio} ({role_label})",
                "equipment",
                extra_tg_ids=[foreman_id] if foreman_id else None,
                category="orders",
                event_key="resource_released",
            )
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
    if not user or dict(user).get('role') != 'foreman':
        raise HTTPException(403, "Освобождать бригады может только прораб")

    async with db.conn.execute("SELECT object_address, team_id, freed_team_ids, foreman_id,status,date_target FROM applications WHERE id = ?",
                               (app_id,)) as cur:
        app_row = await cur.fetchone()
        if not app_row:
            raise HTTPException(404, "Заявка не найдена")
        obj_addr = app_row[0]
        all_team_ids_str = str(app_row[1] or "")
        freed_str = str(app_row[2] or "")
        foreman_id = app_row[3]
        status = app_row[4]
        date_target = app_row[5]

    if int(foreman_id or 0) != int(real_tg_id):
        raise HTTPException(403, "Можно освобождать только бригады из своих заявок")
    if status not in ("approved", "published", "in_progress"):
        raise HTTPException(400, "Бригаду можно освободить только из активной заявки")
    if str(date_target or "") != datetime.now(TZ_BARNAUL).date().isoformat():
        raise HTTPException(400, "Бригаду можно освободить только из заявки на сегодня")

    freed_list = [int(x) for x in freed_str.split(',') if x.strip().isdigit()]
    all_t_ids = [int(x) for x in all_team_ids_str.split(',') if x.strip().isdigit()]

    fio = dict(user).get('fio', '') if user else ''
    user_role = dict(user).get('role', '') if user else ''
    role_label = ROLE_NAMES.get(user_role, user_role)

    if team_id > 0:
        if team_id not in all_t_ids:
            raise HTTPException(400, "Выбранная бригада не назначена в эту заявку")
        if team_id not in freed_list:
            freed_list.append(team_id)
        new_freed_str = ",".join(map(str, freed_list))
        await db.conn.execute("UPDATE applications SET freed_team_ids = ? WHERE id = ?", (new_freed_str, app_id))

        if set(all_t_ids).issubset(set(freed_list)) and len(all_t_ids) > 0:
            await db.conn.execute("UPDATE applications SET is_team_freed = 1 WHERE id = ?", (app_id,))

        await db.conn.execute(
            "INSERT OR IGNORE INTO application_resource_releases "
            "(application_id,resource_type,resource_id,released_at,released_by) VALUES (?,?,?,?,?)",
            (app_id, "team", team_id, datetime.now(TZ_BARNAUL).isoformat(timespec="seconds"), real_tg_id),
        )
        await db.conn.commit()

        async with db.conn.execute("SELECT name FROM teams WHERE id = ?", (team_id,)) as cur:
            t_row = await cur.fetchone()
            t_name = t_row[0] if t_row else f"ID:{team_id}"

        await db.add_log(real_tg_id, fio, f"Освободил бригаду «{t_name}» ({obj_addr})" if obj_addr else f"Освободил бригаду «{t_name}» в заявке №{app_id}", target_type='application', target_id=app_id)

        async def _send_free_team_notification():
            try:
                await notify_users(
                    ["moderator", "boss", "superadmin"],
                    f"🟢 <b>Бригада освобождена</b>\n👷 «{t_name}»\n👤 {fio} ({role_label})",
                    "dashboard",
                    extra_tg_ids=[foreman_id] if foreman_id else None,
                    category="orders",
                    event_key="resource_released",
                )
            except Exception as e:
                logger.error(f"Free team notification error: {e}")

        asyncio.create_task(_send_free_team_notification())

    else:
        await db.conn.execute("UPDATE applications SET is_team_freed = 1, freed_team_ids = ? WHERE id = ?",
                              (all_team_ids_str, app_id))
        released_at = datetime.now(TZ_BARNAUL).isoformat(timespec="seconds")
        await db.conn.executemany(
            "INSERT OR IGNORE INTO application_resource_releases "
            "(application_id,resource_type,resource_id,released_at,released_by) VALUES (?,?,?,?,?)",
            [(app_id, "team", tid, released_at, real_tg_id) for tid in all_t_ids],
        )
        await db.conn.commit()
        await db.add_log(real_tg_id, fio, f"Освободил все бригады ({obj_addr})" if obj_addr else f"Освободил все бригады в заявке №{app_id}", target_type='application', target_id=app_id)

        async def _send_free_all_teams_notification():
            try:
                await notify_users(
                    ["moderator", "boss", "superadmin"],
                    f"🟢 <b>Все бригады освобождены</b>\n👤 {fio} ({role_label})",
                    "dashboard",
                    extra_tg_ids=[foreman_id] if foreman_id else None,
                    category="orders",
                    event_key="resource_released",
                )
            except Exception as e:
                logger.error(f"Free all teams notification error: {e}")

        asyncio.create_task(_send_free_all_teams_notification())


def _positive_ids(raw: str) -> list[int]:
    result = []
    for part in str(raw or "").split(","):
        try:
            value = int(part.strip())
        except (TypeError, ValueError):
            continue
        if value > 0 and value not in result:
            result.append(value)
    return result


async def release_resources(
    app_id: int,
    tg_id: int,
    *,
    team_ids: str = "",
    equipment_ids: str = "",
) -> dict:
    """Release selected teams/equipment with one exact timestamp.

    This is deliberately foreman-owned at the router boundary. The service
    still verifies application ownership so a direct request cannot release
    resources belonging to another foreman.
    """
    from fastapi import HTTPException
    from database_deps import TZ_BARNAUL
    from services.app_service import ensure_app_columns

    await ensure_app_columns()
    real_tg_id = await resolve_id(tg_id)
    user = await db.get_user(real_tg_id)
    if not user or dict(user).get("role") != "foreman":
        raise HTTPException(403, "Освобождать ресурсы может только прораб")
    requested_teams = set(_positive_ids(team_ids))
    requested_equipment = set(_positive_ids(equipment_ids))
    if not requested_teams and not requested_equipment:
        raise HTTPException(400, "Выберите хотя бы одну бригаду или единицу техники")

    async with db.conn.execute(
        "SELECT foreman_id,public_number,object_address,team_id,freed_team_ids,"
        "is_team_freed,equipment_data,status,date_target "
        "FROM applications WHERE id=?",
        (int(app_id),),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Заявка не найдена")
    if int(row[0] or 0) != int(real_tg_id):
        raise HTTPException(403, "Можно освобождать ресурсы только в своих заявках")
    if row[7] not in ("approved", "published", "in_progress"):
        raise HTTPException(400, "Ресурсы можно освободить только из активной заявки")
    if str(row[8] or "") != datetime.now(TZ_BARNAUL).date().isoformat():
        raise HTTPException(400, "Освобождать ресурсы можно только в заявке на сегодня")

    assigned_teams = set(_positive_ids(row[3]))
    already_freed_teams = set(_positive_ids(row[4]))
    invalid_teams = requested_teams - assigned_teams
    if invalid_teams:
        raise HTTPException(400, "В заявке нет одной из выбранных бригад")

    try:
        equipment = json.loads(row[6] or "[]")
    except (TypeError, ValueError, json.JSONDecodeError):
        equipment = []
    equipment = [item for item in equipment if isinstance(item, dict)]
    equipment_by_id = {
        int(item.get("id")): item for item in equipment
        if str(item.get("id") or "").isdigit()
    }
    invalid_equipment = requested_equipment - set(equipment_by_id)
    if invalid_equipment:
        raise HTTPException(400, "В заявке нет одной из выбранных единиц техники")

    released_teams = sorted(requested_teams - already_freed_teams)
    released_equipment = []
    released_at = datetime.now(TZ_BARNAUL).isoformat(timespec="seconds")
    for equipment_id in sorted(requested_equipment):
        item = equipment_by_id[equipment_id]
        if item.get("is_freed"):
            continue
        item["is_freed"] = True
        item["released_at"] = released_at
        released_equipment.append(equipment_id)

    if not released_teams and not released_equipment:
        raise HTTPException(400, "Все выбранные ресурсы уже освобождены")

    next_freed_teams = already_freed_teams | set(released_teams)
    all_teams_freed = bool(assigned_teams) and assigned_teams.issubset(next_freed_teams)
    try:
        await db.conn.execute("SAVEPOINT mass_resource_release")
        await db.conn.execute(
            "UPDATE applications SET freed_team_ids=?,is_team_freed=?,equipment_data=? WHERE id=?",
            (
                ",".join(map(str, sorted(next_freed_teams))),
                1 if all_teams_freed else 0,
                json.dumps(equipment, ensure_ascii=False),
                int(app_id),
            ),
        )
        for resource_type, ids in (
            ("team", released_teams), ("equipment", released_equipment),
        ):
            await db.conn.executemany(
                "INSERT OR IGNORE INTO application_resource_releases "
                "(application_id,resource_type,resource_id,released_at,released_by) "
                "VALUES (?,?,?,?,?)",
                [
                    (int(app_id), resource_type, int(resource_id), released_at, real_tg_id)
                    for resource_id in ids
                ],
            )
        if released_equipment:
            marks = ",".join("?" for _ in released_equipment)
            await db.conn.execute(
                f"UPDATE equipment SET status='free' WHERE id IN ({marks})",
                released_equipment,
            )
        await db.conn.execute("RELEASE SAVEPOINT mass_resource_release")
        await db.conn.commit()
    except Exception:
        await db.conn.execute("ROLLBACK TO SAVEPOINT mass_resource_release")
        await db.conn.execute("RELEASE SAVEPOINT mass_resource_release")
        raise

    fio = dict(user).get("fio", "Прораб") if user else "Прораб"
    team_names_by_id = {}
    if released_teams:
        marks = ",".join("?" for _ in released_teams)
        async with db.conn.execute(
            f"SELECT id,name FROM teams WHERE id IN ({marks})", released_teams
        ) as cur:
            team_names_by_id = {int(item[0]): item[1] for item in await cur.fetchall()}
    team_names = [
        team_names_by_id.get(team_id) or f"Бригада #{team_id}"
        for team_id in released_teams
    ]
    equipment_names = [
        equipment_by_id[equipment_id].get("name") or f"Техника #{equipment_id}"
        for equipment_id in released_equipment
    ]
    details = []
    if team_names:
        details.append("👷 Бригады: " + ", ".join(team_names))
    if equipment_names:
        details.append("🚜 Техника: " + ", ".join(equipment_names))
    app_number = display_application_number(app_id, row[1])
    await db.add_log(
        real_tg_id, fio,
        f"Массово освободил ресурсы заявки {app_number} ({row[2] or 'без объекта'})",
        target_type="application", target_id=app_id,
        details=json.dumps({
            "action": "mass_resource_release", "released_at": released_at,
            "team_ids": released_teams, "equipment_ids": released_equipment,
        }, ensure_ascii=False),
    )

    async def _notify():
        try:
            await notify_users(
                ["moderator", "boss", "superadmin"],
                f"🟢 <b>Ресурсы освобождены · {app_number}</b>\n"
                f"👤 {fio}\n📍 {row[2] or 'Объект не указан'}\n"
                + "\n".join(details)
                + f"\n🕒 {datetime.now(TZ_BARNAUL).strftime('%H:%M')}",
                "dashboard", category="orders", event_key="resource_released",
            )
        except Exception as exc:
            logger.error("Mass release notification error: %s", exc)

    asyncio.create_task(_notify())
    return {
        "released_at": released_at,
        "teams": [
            {"id": value, "name": team_names_by_id.get(value) or f"Бригада #{value}"}
            for value in released_teams
        ],
        "equipment": [
            {"id": value, "name": equipment_by_id[value].get("name") or f"Техника #{value}"}
            for value in released_equipment
        ],
    }


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
    _obj = app_dict.get('object_address', '')
    await db.add_log(real_tg_id, mod_fio, f"Отправил напоминание прорабу ({_obj})" if _obj else f"Отправил напоминание прорабу по заявке №{app_id}", target_type='application', target_id=app_id)

    return app_dict


async def send_remind_notification(app_dict):
    """Background: send SMR reminder to foreman."""
    try:
        object_name = app_dict.get('object_address', 'Неизвестный объект')
        date_target = app_dict.get('date_target', '')
        foreman_id = app_dict.get('foreman_id')
        msg = f"⚠️ <b>Напоминание:</b> Необходимо заполнить СМР по объекту <b>{object_name}</b> на дату <b>{date_target}</b>"
        await notify_users([], msg, "kp", extra_tg_ids=[foreman_id], category="reports", event_key="smr_debt")
    except Exception as e:
        logger.error(f"Error sending SMR reminder for app #{app_dict.get('id')}: {e}")
    # v2.5: brigadiers of the involved teams get the same reminder, scoped
    # to their brigade (not the whole foreman dispatch).
    try:
        await notify_brigadiers_smr_fill(
            app_id=app_dict.get('id'),
            team_id_field=app_dict.get('team_id'),
            object_name=app_dict.get('object_address', 'Неизвестный объект'),
            date_target=app_dict.get('date_target', ''),
            reason='manual_remind',
        )
    except Exception as e:
        logger.error(f"Error notifying brigadiers SMR fill app #{app_dict.get('id')}: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# v2.5: brigadier SMR-fill notifications
#
# Foreman flow (existing, do not modify):
#   - scheduler.py TRIGGER 3 (`report_request_time`)  → "Пора заполнить отчёт!"
#   - scheduler.py TRIGGER 4 (`auto_complete_time`)   → "Смена окончена!"
#   - app_workflow.send_remind_notification()         → "⚠️ Напоминание..."
#   All three call notify_users(..., extra_tg_ids=[foreman_id], category='reports').
#   Push payload uses the generic ВиКС template (no typed push_type).
#
# Brigadier mirror (new):
#   - scoped to brigadiers of every team referenced by `applications.team_id`
#     (which is a comma-separated list per the v2.5 partial-brigade convention,
#     parsed by hours_repo._parse_team_ids)
#   - reuses category='reports' so per-user `notify_reports` and per-channel
#     toggles in users.settings already gate dispatch via notify_users
#   - uses push_type='smr_fill_brigadier' (push_templates.PUSH_TEMPLATES) so
#     the device-side notification has a brigade-specific title
# ──────────────────────────────────────────────────────────────────────────────
def _parse_app_team_ids(team_id_field) -> list[int]:
    if not team_id_field:
        return []
    out: list[int] = []
    for part in str(team_id_field).split(','):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


async def notify_brigadiers_smr_fill(*, app_id, team_id_field, object_name: str,
                                      date_target: str, reason: str):
    """Send the SMR-fill reminder to each brigadier whose brigade is on the
    application. ``reason`` is logged but does not affect the message wording.

    No-op if the app has no team_ids resolved or no brigadiers were found.
    """
    team_ids = _parse_app_team_ids(team_id_field)
    if not team_ids:
        return

    seen: set[int] = set()
    targets: list[tuple[int, int]] = []  # (user_id, team_id)
    for tid in team_ids:
        try:
            brigadiers = await db.get_brigadiers_for_team(tid)
        except Exception:
            continue
        for b in brigadiers:
            uid = b.get('user_id')
            if uid is None or uid in seen:
                continue
            seen.add(uid)
            targets.append((int(uid), tid))

    if not targets:
        return

    msg = (
        f"🔧 <b>СМР по вашей бригаде</b>\n"
        f"📍 Объект: <b>{object_name}</b>\n"
        f"📅 Дата: <b>{date_target}</b>\n\n"
        f"Пожалуйста, заполните часы и работы по своей бригаде."
    )
    push_body = f"{object_name} • {date_target}"

    brigadier_ids = [uid for uid, _ in targets]
    await notify_users(
        [], msg, "kp",
        extra_tg_ids=brigadier_ids,
        category="reports",
        push_type="smr_fill_brigadier",
        push_body=push_body,
    )

    # Audit log per recipient — mirrors the implicit log entry that
    # notify_users emits for the dispatch as a whole, but ties each
    # brigadier to the specific team that triggered the notification.
    for uid, tid in targets:
        try:
            await db.add_log(
                0, 'Система',
                f"Уведомление СМР бригадиру user_id={uid} (team_id={tid}, причина={reason})",
                target_type='application', target_id=app_id,
                details=f"channels=tg+max+push, category=reports, push_type=smr_fill_brigadier",
            )
        except Exception:
            pass

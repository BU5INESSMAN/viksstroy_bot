"""In-process heartbeat and de-duplicated system incident helpers."""

from __future__ import annotations

from datetime import datetime, timezone


async def record_heartbeat(db, component: str, *, ok: bool, error: str = "") -> bool:
    """Record component state and return True when it changed."""
    async with db.conn.execute(
        "SELECT status FROM system_alert_state WHERE alert_key = ?", (f"heartbeat:{component}",)
    ) as cur:
        previous = await cur.fetchone()
    previous_status = previous[0] if previous else None
    status = "ok" if ok else "error"
    if ok:
        await db.conn.execute(
            "INSERT INTO system_heartbeats(component,last_success_at,last_error,updated_at) "
            "VALUES (?,datetime('now'),' ',datetime('now')) "
            "ON CONFLICT(component) DO UPDATE SET last_success_at=datetime('now'),last_error='',updated_at=datetime('now')",
            (component,),
        )
    else:
        await db.conn.execute(
            "INSERT INTO system_heartbeats(component,last_error_at,last_error,updated_at) "
            "VALUES (?,datetime('now'),?,datetime('now')) "
            "ON CONFLICT(component) DO UPDATE SET last_error_at=datetime('now'),last_error=excluded.last_error,updated_at=datetime('now')",
            (component, str(error)[:1000]),
        )
    await db.conn.execute(
        "INSERT INTO system_alert_state(alert_key,status,last_sent_at,occurrences,details) VALUES (?,?,NULL,1,?) "
        "ON CONFLICT(alert_key) DO UPDATE SET status=excluded.status, occurrences=CASE WHEN excluded.status='error' THEN occurrences+1 ELSE 1 END, details=excluded.details",
        (f"heartbeat:{component}", status, str(error)[:1000]),
    )
    await db.conn.commit()
    # The first failure is an incident; the first successful tick only
    # initializes monitoring. A later error-to-ok transition is a recovery.
    return (
        (status == "error" and previous_status != "error")
        or (status == "ok" and previous_status == "error")
    )


async def notify_system_incident(db, *, event_key: str, title: str, component: str, details: str) -> None:
    try:
        from services.notifications import notify_users
    except ImportError:
        from web.services.notifications import notify_users

    # Repeated API failures must not flood every enabled messenger.
    alert_key = f"incident:{event_key}:{component}"
    async with db.conn.execute(
        "SELECT last_sent_at FROM system_alert_state WHERE alert_key=?", (alert_key,)
    ) as cur:
        row = await cur.fetchone()
    should_send = True
    if row and row[0]:
        async with db.conn.execute(
            "SELECT (julianday('now') - julianday(?)) * 1440", (row[0],)
        ) as cur:
            age = await cur.fetchone()
        should_send = not age or age[0] is None or float(age[0]) >= 15
    await db.conn.execute(
        "INSERT INTO system_alert_state(alert_key,status,last_sent_at,occurrences,details) "
        "VALUES (?,?,CASE WHEN ? THEN datetime('now') ELSE NULL END,1,?) "
        "ON CONFLICT(alert_key) DO UPDATE SET status=excluded.status, "
        "last_sent_at=CASE WHEN ? THEN datetime('now') ELSE last_sent_at END, "
        "occurrences=occurrences+1, details=excluded.details",
        (alert_key, "ok" if event_key == "system_recovered" else "error", should_send,
         str(details)[:1000], should_send),
    )
    await db.conn.commit()
    if not should_send:
        return

    stamp = datetime.now(timezone.utc).astimezone().strftime('%d.%m.%Y %H:%M:%S')
    text = (
        f"🚨 <b>{title}</b>\n"
        f"Компонент: <b>{component}</b>\n"
        f"Время: {stamp}\n"
        f"Событие: <code>{event_key}:{component}</code>\n"
        f"Подробности: {str(details)[:700]}"
    )
    await notify_users(
        ["superadmin"], text, "system", category="errors", event_key=event_key,
        push_body=f"{component}: {str(details)[:140]}",
    )

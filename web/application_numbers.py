"""Short, stable, user-facing application numbers."""

from __future__ import annotations

from datetime import datetime


def make_application_number(date_key: str, sequence: int) -> str:
    return f"З-{date_key}-{max(1, int(sequence)):02d}"


async def allocate_application_number(db, app_id: int, created_at: datetime) -> str:
    """Allocate the next number for a local calendar day.

    The application INSERT and this call share one SQLite write transaction,
    so concurrent requests cannot receive the same sequence.
    """
    # Russian reading order: day, month, year (ДДММГГ).
    date_key = created_at.strftime("%d%m%y")
    prefix = f"З-{date_key}-"
    async with db.conn.execute(
        "SELECT public_number FROM applications "
        "WHERE public_number LIKE ? ORDER BY id DESC",
        (prefix + "%",),
    ) as cur:
        rows = await cur.fetchall()
    used = []
    for row in rows:
        try:
            used.append(int(str(row[0]).rsplit("-", 1)[-1]))
        except (TypeError, ValueError):
            continue
    number = make_application_number(date_key, max(used, default=0) + 1)
    await db.conn.execute(
        "UPDATE applications SET public_number=? WHERE id=?",
        (number, int(app_id)),
    )
    return number


def display_application_number(app_id: int, public_number: str | None = None) -> str:
    return (public_number or "").strip() or f"З-{int(app_id)}"


async def get_application_number(db, app_id: int) -> str:
    """Return the stable public number, falling back for pre-migration rows."""
    async with db.conn.execute(
        "SELECT public_number FROM applications WHERE id=?",
        (int(app_id),),
    ) as cur:
        row = await cur.fetchone()
    return display_application_number(app_id, row[0] if row else None)

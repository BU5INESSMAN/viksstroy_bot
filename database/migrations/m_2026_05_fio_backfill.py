"""FIO backfill for synthetic-id drivers created by m_2026_05_drivers_refactor.

THE PROBLEM
-----------
The earlier `m_2026_05_drivers_refactor` migration walks every
``equipment.driver_fio`` and either attaches the FIO to an existing user
(by ``equipment.tg_id`` link or by FIO match) or creates a synthetic-id
``users`` row whose ``role='driver'``. When the synthetic row is
created from the FIO scan, the migration *does* persist the full ФИО
into ``users.fio`` / ``last_name`` / ``first_name`` / ``middle_name`` —
see the INSERT block in that migration at lines 197–212.

However, on production a separate path created synthetic-id drivers
*outside* that block — every legacy ``equipment.tg_id`` row that pointed
at a negative id which did NOT exist in ``users`` triggered the default
``db_manager.add_user`` flow with a placeholder name ``"Пользователь
{id}"`` (lines 100s of db_manager.py, before any FIO refinement was
added). The result on production: 11 driver rows with
``fio = 'Пользователь -135961584'`` and
``last_name = 'Пользователь', first_name = '-135961584', middle_name = ''``.

THE FIX
-------
The *real* ФИО for each of those drivers still exists in
``equipment.driver_fio`` of whichever equipment row links them
(``users.default_equipment_id`` → ``equipment.id``, or as a fallback,
``equipment.tg_id = users.user_id``). Recover and write it back.

This migration MUST run before any code path that severs the legacy
``equipment.driver_fio`` linkage (commits 5 and 7 of the v2.6 plan).

IDEMPOTENCY
-----------
The selector explicitly filters to drivers whose name *needs* fixing
(placeholder ФИО or empty last/first). After the first run those rows no
longer match the filter, so subsequent runs are zero-work no-ops.

NO DATA LOSS
------------
The migration only UPDATEs ``users``. It never deletes a row, never
touches non-driver users, never modifies a driver whose ФИО is already
parsed cleanly.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def _parse_fio(s: str) -> tuple[str, str, str]:
    """Split a Russian ФИО string into (last, first, middle).

    "Иванов Иван Иванович"          → ("Иванов", "Иван", "Иванович")
    "Петров Петр Петрович Сергеевич" → ("Петров", "Петр", "Петрович Сергеевич")
    "Сидоров Сидор"                  → ("Сидоров", "Сидор", "")
    "Кузнецов"                       → ("Кузнецов", "", "")
    """
    parts = (s or "").strip().split()
    last = parts[0] if len(parts) > 0 else ""
    first = parts[1] if len(parts) > 1 else ""
    middle = " ".join(parts[2:]) if len(parts) > 2 else ""
    return last, first, middle


def _is_placeholder(fio: str | None, last: str | None, first: str | None) -> bool:
    """A row needs FIO repair when the visible name is still synthetic.

    Three indicators (any one is enough):
      1. ``fio`` literally starts with "Пользователь " — the canonical
         placeholder set by db_manager.add_user when no ФИО was known.
      2. ``last_name`` is literally "Пользователь" — same placeholder
         path but a row that was later partially edited.
      3. Both ``last_name`` AND ``first_name`` are empty — uninitialised
         row that may still be salvageable from equipment.driver_fio.
    """
    f = (fio or "").strip()
    ln = (last or "").strip()
    fn = (first or "").strip()
    if f.startswith("Пользователь "):
        return True
    if ln == "Пользователь":
        return True
    if ln == "" and fn == "":
        return True
    return False


async def _equipment_fio_for_user(conn, user_id: int) -> str | None:
    """Find a usable equipment.driver_fio for ``user_id``.

    Order of preference (first hit wins):
      A. equipment.id = users.default_equipment_id
         — strongest signal; this is where the original migration
         deliberately attached the driver.
      B. equipment.tg_id = user_id
         — legacy link from before the drivers refactor; still valid
         for drivers that pre-dated the new model.
      C. equipment_driver_usage.last_used_at most-recent for this driver
         — last-resort: the popularity tracker remembers which equipment
         this driver has actually worked. Pick the most recent.

    Each path filters out placeholder values ("Не указан", "—", "-",
    empty, whitespace) so we never write garbage back into users.
    """
    PLACEHOLDERS = {"", "не указан", "—", "-", "none", "null"}

    # Path A — default_equipment_id linkage
    async with conn.execute(
        "SELECT e.driver_fio FROM users u "
        "JOIN equipment e ON e.id = u.default_equipment_id "
        "WHERE u.user_id = ?",
        (user_id,),
    ) as cur:
        row = await cur.fetchone()
    if row and (row[0] or "").strip().lower() not in PLACEHOLDERS:
        return row[0].strip()

    # Path B — legacy equipment.tg_id linkage
    async with conn.execute(
        "SELECT driver_fio FROM equipment WHERE tg_id = ? "
        "AND driver_fio IS NOT NULL AND TRIM(driver_fio) != '' LIMIT 1",
        (user_id,),
    ) as cur:
        row = await cur.fetchone()
    if row and (row[0] or "").strip().lower() not in PLACEHOLDERS:
        return row[0].strip()

    # Path C — popularity-tracker fallback. Only valid if the table
    # exists (it's created by the drivers_refactor migration).
    try:
        async with conn.execute(
            "SELECT e.driver_fio "
            "FROM equipment_driver_usage edu "
            "JOIN equipment e ON e.id = edu.equipment_id "
            "WHERE edu.driver_user_id = ? "
            "AND e.driver_fio IS NOT NULL AND TRIM(e.driver_fio) != '' "
            "ORDER BY edu.last_used_at DESC LIMIT 1",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
        if row and (row[0] or "").strip().lower() not in PLACEHOLDERS:
            return row[0].strip()
    except Exception:
        # equipment_driver_usage may not exist on very old DBs; the
        # earlier paths cover production. Swallow and fall through.
        pass

    return None


async def run(conn) -> None:
    # Find every driver whose ФИО still looks synthetic. Pull enough
    # columns to decide what to do per-row in Python instead of trying
    # to express the placeholder test in SQL.
    async with conn.execute(
        "SELECT user_id, fio, last_name, first_name, middle_name "
        "FROM users WHERE role = 'driver'"
    ) as cur:
        all_drivers = await cur.fetchall()

    candidates = [
        r for r in all_drivers if _is_placeholder(r[1], r[2], r[3])
    ]

    if not candidates:
        logger.info("FIO backfill: nothing to do (no synthetic ФИО drivers)")
        return

    repaired = 0
    skipped = 0
    for user_id, old_fio, old_last, old_first, old_middle in candidates:
        source = await _equipment_fio_for_user(conn, user_id)
        if not source:
            logger.warning(
                "FIO backfill: no source ФИО for driver user_id=%s "
                "(fio=%r last=%r first=%r) — leaving as-is, "
                "office must enter ФИО manually",
                user_id, old_fio, old_last, old_first,
            )
            skipped += 1
            continue

        last, first, middle = _parse_fio(source)
        await conn.execute(
            "UPDATE users SET fio = ?, last_name = ?, first_name = ?, "
            "middle_name = ? WHERE user_id = ?",
            (source, last, first, middle, user_id),
        )
        logger.info(
            'FIO backfilled: user_id=%s "%s" -> "%s"',
            user_id, old_fio, source,
        )
        repaired += 1

    logger.info(
        "FIO backfill complete: %d repaired, %d skipped (no source)",
        repaired, skipped,
    )

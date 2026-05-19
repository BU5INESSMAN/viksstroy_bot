"""v2.6 commit 7: sever legacy equipment-as-identity links.

This migration closes the v2.6 driver-equipment decoupling release. It
does one thing of operational consequence — invalidating active driver
sessions so every driver re-logs-in through their NEW personal
``users.invite_code`` flow — and one thing of documentary consequence:
formally recording that the legacy columns are deprecated and slated
for removal in v2.7+.

What this migration **does**
----------------------------
1. ``DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM users
   WHERE role='driver') AND expires_at > datetime('now')`` — invalidates
   only **currently-active** driver sessions. Drivers with an
   already-expired cookie are left untouched (they're already broken,
   no need to surface the migration to them). Non-driver sessions are
   never touched.

2. Logs the invalidation count at INFO so the operator running
   ``./update.sh`` has a clear audit trail.

What this migration **does not** do
-----------------------------------
- Does **NOT** drop any column. ``equipment.driver``,
  ``equipment.driver_fio``, ``equipment.tg_id``,
  ``equipment.invite_code``, ``users.default_equipment_id`` all stay
  in the schema as DEPRECATED. SQLite column drop requires a table
  rebuild and is too risky for rollback within a release window.
  Drop scheduled for v2.7+ when there's a quiet maintenance window.

- Does **NOT** invalidate sessions of non-drivers. Office, foremen,
  brigadiers, workers — their sessions are unrelated to the driver
  refactor and stay intact.

- Does **NOT** touch any application_drivers rows. Past assignments
  remain readable for audit / reporting.

Idempotency
-----------
Pure ``DELETE`` against a set that's empty on re-run. Second invocation
selects zero rows, deletes zero, logs ``0 active driver sessions to
invalidate`` and exits.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def run(conn) -> None:
    # Count BEFORE so the operator log shows "X invalidated" not "0 deleted".
    async with conn.execute(
        "SELECT COUNT(*) FROM sessions "
        "WHERE user_id IN (SELECT user_id FROM users WHERE role='driver') "
        "  AND expires_at > datetime('now')"
    ) as cur:
        row = await cur.fetchone()
    to_invalidate = int(row[0]) if row and row[0] is not None else 0

    if to_invalidate == 0:
        logger.info(
            "sever_legacy: 0 active driver sessions to invalidate "
            "(nothing to do)"
        )
        return

    logger.info(
        "sever_legacy: %d active driver sessions to invalidate "
        "— drivers will re-login via users.invite_code",
        to_invalidate,
    )

    await conn.execute(
        "DELETE FROM sessions "
        "WHERE user_id IN (SELECT user_id FROM users WHERE role='driver') "
        "  AND expires_at > datetime('now')"
    )

    logger.info(
        "sever_legacy: invalidated %d driver session(s). "
        "Non-driver sessions untouched. Legacy columns "
        "(equipment.driver / driver_fio / tg_id / invite_code, "
        "users.default_equipment_id) remain in schema as DEPRECATED — "
        "drop scheduled for v2.7+.",
        to_invalidate,
    )

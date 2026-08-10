import asyncio
from unittest.mock import AsyncMock, patch

import aiosqlite
from fastapi import HTTPException

from web.routers import kp


class _FakeDb:
    def __init__(self, conn):
        self.conn = conn
        self.logs = []

    async def add_log(self, *args, **kwargs):
        self.logs.append((args, kwargs))


async def _make_db():
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(
        """
        CREATE TABLE applications (
            id INTEGER PRIMARY KEY,
            foreman_id INTEGER,
            smr_group_id TEXT,
            smr_status TEXT,
            kp_status TEXT,
            smr_filled_by_role TEXT,
            smr_accounted_by INTEGER,
            smr_accounted_at TEXT
        );
        CREATE TABLE application_hours (
            id INTEGER PRIMARY KEY, app_id INTEGER, is_additional INTEGER DEFAULT 0
        );
        CREATE TABLE application_kp (
            id INTEGER PRIMARY KEY, application_id INTEGER, is_additional INTEGER DEFAULT 0
        );
        CREATE TABLE application_extra_works (
            id INTEGER PRIMARY KEY, application_id INTEGER, is_additional INTEGER DEFAULT 0
        );
        INSERT INTO applications VALUES
            (1, 100, 'group-a', 'approved', 'approved', 'foreman', 500, '2026-08-10'),
            (2, 100, 'group-a', 'approved', 'approved', 'foreman', 500, '2026-08-10');
        INSERT INTO application_hours VALUES (1, 1, 0), (2, 2, 1);
        INSERT INTO application_kp VALUES (1, 1, 0), (2, 2, 1);
        INSERT INTO application_extra_works VALUES (1, 1, 0), (2, 2, 1);
        """
    )
    await conn.commit()
    return _FakeDb(conn)


def test_full_clear_removes_main_and_additional_rows_and_reopens_group():
    async def scenario():
        fake_db = await _make_db()
        audit = AsyncMock()
        try:
            with (
                patch.object(kp, "db", fake_db),
                patch.object(kp, "capture_smr_financial_snapshot", AsyncMock(return_value={"totals": {"hours": 8}})),
                patch.object(kp, "_audit_smr_change", audit),
                patch.object(kp, "get_application_number", AsyncMock(return_value="З-10082026-1")),
            ):
                result = await kp.clear_completed_smr_report(
                    1,
                    current_user={"tg_id": 100, "role": "foreman", "fio": "Прораб"},
                )

            assert result["application_ids"] == [1, 2]
            assert result["deleted"] == {"hours": 2, "works": 2, "extra_works": 2}
            for table in ("application_hours", "application_kp", "application_extra_works"):
                async with fake_db.conn.execute(f"SELECT COUNT(*) FROM {table}") as cur:
                    assert (await cur.fetchone())[0] == 0
            async with fake_db.conn.execute(
                "SELECT smr_group_id, smr_status, kp_status, smr_accounted_at FROM applications ORDER BY id"
            ) as cur:
                rows = await cur.fetchall()
            assert [row["smr_group_id"] for row in rows] == ["group-a", "group-a"]
            assert all(row["smr_status"] is None and row["kp_status"] is None for row in rows)
            assert all(row["smr_accounted_at"] is None for row in rows)
            assert audit.await_args.args[2] == "smr_report_cleared"
            assert audit.await_args.kwargs["force"] is True
            assert len(fake_db.logs) == 1
        finally:
            await fake_db.conn.close()

    asyncio.run(scenario())


def test_foreman_cannot_clear_another_foremans_ready_report():
    async def scenario():
        fake_db = await _make_db()
        try:
            with patch.object(kp, "db", fake_db):
                try:
                    await kp._require_smr_report_manager(
                        1,
                        {"tg_id": 999, "role": "foreman", "fio": "Другой прораб"},
                        completed_only=True,
                    )
                except HTTPException as exc:
                    assert exc.status_code == 403
                else:
                    raise AssertionError("foreign foreman access must be rejected")
        finally:
            await fake_db.conn.close()

    asyncio.run(scenario())

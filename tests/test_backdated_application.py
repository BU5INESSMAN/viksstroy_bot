import asyncio
import json
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import aiosqlite


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
for path in (ROOT, WEB):
    if path not in sys.path:
        sys.path.insert(0, path)

from services import app_service
from database.migrations import m_2026_08_backdated_apps_and_resource_releases


def test_backdated_application_is_completed_freed_and_not_published():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        await conn.executescript(
            """
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY AUTOINCREMENT, foreman_id INTEGER,
                foreman_name TEXT, team_id TEXT, object_id INTEGER,
                date_target TEXT, object_address TEXT, time_start TEXT,
                time_end TEXT, comment TEXT, status TEXT, selected_members TEXT,
                equipment_data TEXT, is_team_freed INTEGER, freed_team_ids TEXT,
                is_published INTEGER, completed_at TEXT, is_backdated INTEGER,
                backdated_created_at TEXT, public_number TEXT
            );
            CREATE TABLE application_drivers(
                application_id INTEGER, equipment_id INTEGER, driver_user_id INTEGER
            );
            CREATE TABLE team_members(
                id INTEGER PRIMARY KEY, fio TEXT, status TEXT,
                status_from TEXT, status_until TEXT
            );
            CREATE TABLE application_resource_releases(
                id INTEGER PRIMARY KEY, application_id INTEGER, resource_type TEXT,
                resource_id INTEGER, released_at TEXT, released_by INTEGER,
                created_at TEXT, UNIQUE(application_id,resource_type,resource_id)
            );
            """
        )
        fake_db = SimpleNamespace(
            conn=conn,
            get_user=AsyncMock(return_value={"user_id": 10, "fio": "Прораб Тест"}),
            add_log=AsyncMock(),
            check_resource_availability=AsyncMock(return_value=["занято"]),
        )
        with patch.object(app_service, "db", fake_db), \
             patch.object(app_service, "resolve_id", AsyncMock(return_value=10)), \
             patch.object(app_service, "ensure_app_columns", AsyncMock()), \
             patch.object(app_service, "_apply_driver_assignments", AsyncMock()):
            app_id, _, _, number = await app_service.create_application(
                10, "1,2", (date.today() - timedelta(days=1)).isoformat(), "Объект", "",
                "11,12", json.dumps([{"id": 7, "time_start": "08", "time_end": "17"}]), 3,
                driver_assignments=json.dumps([{"equipment_id": 7, "driver_user_id": 20}]),
                current_user={"role": "foreman"},
                is_backdated=True,
            )
        async with conn.execute("SELECT * FROM applications WHERE id=?", (app_id,)) as cur:
            row = dict(await cur.fetchone())
        assert row["status"] == "completed"
        assert row["is_published"] == 0
        assert row["is_backdated"] == 1
        assert row["is_team_freed"] == 1
        assert row["freed_team_ids"] == "1,2"
        assert json.loads(row["equipment_data"])[0]["is_freed"] is True
        assert number.startswith("З-")
        fake_db.check_resource_availability.assert_not_awaited()
        await conn.close()

    asyncio.run(scenario())


def test_backdated_release_migration_upgrades_existing_database_idempotently():
    async def scenario():
        with tempfile.TemporaryDirectory() as directory:
            conn = await aiosqlite.connect(Path(directory) / "existing.db")
            await conn.execute("CREATE TABLE applications(id INTEGER PRIMARY KEY)")
            await m_2026_08_backdated_apps_and_resource_releases.run(conn)
            await m_2026_08_backdated_apps_and_resource_releases.run(conn)
            await conn.commit()
            async with conn.execute("PRAGMA table_info(applications)") as cur:
                columns = {row[1] for row in await cur.fetchall()}
            assert {"is_backdated", "backdated_created_at"}.issubset(columns)
            async with conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='application_resource_releases'"
            ) as cur:
                assert await cur.fetchone()
            await conn.close()

    asyncio.run(scenario())

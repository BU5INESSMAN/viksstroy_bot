import asyncio
import json
import os
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import aiosqlite
from fastapi import HTTPException


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
for path in (ROOT, WEB):
    if path not in sys.path:
        sys.path.insert(0, path)

from database_deps import TZ_BARNAUL
from services import app_workflow


async def _database():
    conn = await aiosqlite.connect(":memory:")
    await conn.executescript(
        """
        CREATE TABLE applications(
            id INTEGER PRIMARY KEY, foreman_id INTEGER, public_number TEXT,
            object_address TEXT, team_id TEXT, freed_team_ids TEXT,
            is_team_freed INTEGER, equipment_data TEXT, status TEXT,
            date_target TEXT
        );
        CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE equipment(id INTEGER PRIMARY KEY, name TEXT, status TEXT);
        CREATE TABLE application_resource_releases(
            application_id INTEGER, resource_type TEXT, resource_id INTEGER,
            released_at TEXT, released_by INTEGER,
            UNIQUE(application_id,resource_type,resource_id)
        );
        INSERT INTO teams VALUES (2,'Бригада Б'),(1,'Бригада Я');
        INSERT INTO equipment VALUES (7,'Экскаватор','busy'),(8,'Кран','busy');
        """
    )
    return conn


def test_mass_release_uses_one_timestamp_and_keeps_id_name_pairs():
    async def scenario():
        conn = await _database()
        today = datetime.now(TZ_BARNAUL).date().isoformat()
        await conn.execute(
            "INSERT INTO applications VALUES (1,10,'З-140826-01','Объект','1,2','',0,?,'in_progress',?)",
            (json.dumps([{"id": 7, "name": "Экскаватор"}, {"id": 8, "name": "Кран"}], ensure_ascii=False), today),
        )
        await conn.commit()
        fake_db = SimpleNamespace(
            conn=conn,
            get_user=AsyncMock(return_value={"role": "foreman", "fio": "Прораб"}),
            add_log=AsyncMock(),
        )
        with patch.object(app_workflow, "db", fake_db), \
             patch.object(app_workflow, "resolve_id", AsyncMock(return_value=10)), \
             patch("services.app_service.ensure_app_columns", AsyncMock()), \
             patch.object(app_workflow, "notify_users", AsyncMock()):
            result = await app_workflow.release_resources(
                1, 10, team_ids="1,2", equipment_ids="7"
            )
            await asyncio.sleep(0)

        assert result["teams"] == [
            {"id": 1, "name": "Бригада Я"},
            {"id": 2, "name": "Бригада Б"},
        ]
        assert result["equipment"] == [{"id": 7, "name": "Экскаватор"}]
        async with conn.execute(
            "SELECT resource_type,resource_id,released_at FROM application_resource_releases ORDER BY resource_type,resource_id"
        ) as cur:
            releases = await cur.fetchall()
        assert len(releases) == 3
        assert {row[2] for row in releases} == {result["released_at"]}
        async with conn.execute("SELECT freed_team_ids,is_team_freed,equipment_data FROM applications") as cur:
            app = await cur.fetchone()
        assert app[0] == "1,2"
        assert app[1] == 1
        assert json.loads(app[2])[0]["is_freed"] is True
        async with conn.execute("SELECT status FROM equipment WHERE id=7") as cur:
            assert (await cur.fetchone())[0] == "free"
        await conn.close()

    asyncio.run(scenario())


def test_mass_release_rejects_foreign_application_and_non_foreman():
    async def scenario():
        conn = await _database()
        today = datetime.now(TZ_BARNAUL).date().isoformat()
        await conn.execute(
            "INSERT INTO applications VALUES (1,99,'З-140826-01','Объект','1','',0,'[]','in_progress',?)",
            (today,),
        )
        await conn.commit()
        fake_db = SimpleNamespace(
            conn=conn,
            get_user=AsyncMock(return_value={"role": "foreman", "fio": "Чужой прораб"}),
            add_log=AsyncMock(),
        )
        with patch.object(app_workflow, "db", fake_db), \
             patch.object(app_workflow, "resolve_id", AsyncMock(return_value=10)), \
             patch("services.app_service.ensure_app_columns", AsyncMock()):
            try:
                await app_workflow.release_resources(1, 10, team_ids="1")
                assert False, "foreign application must be rejected"
            except HTTPException as error:
                assert error.status_code == 403

            fake_db.get_user.return_value = {"role": "moderator", "fio": "Модератор"}
            try:
                await app_workflow.release_resources(1, 10, team_ids="1")
                assert False, "non-foreman must be rejected"
            except HTTPException as error:
                assert error.status_code == 403
        await conn.close()

    asyncio.run(scenario())

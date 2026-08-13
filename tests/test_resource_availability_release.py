import asyncio
import json
import os
import sys

import aiosqlite


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from database.apps_repo import AppsRepoMixin


def test_partially_released_team_and_equipment_are_available_independently():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        await conn.executescript(
            """
            CREATE TABLE objects(id INTEGER PRIMARY KEY,name TEXT);
            CREATE TABLE teams(id INTEGER PRIMARY KEY,name TEXT);
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY, team_id TEXT, equipment_data TEXT,
                object_id INTEGER, object_address TEXT, foreman_name TEXT,
                selected_members TEXT, freed_team_ids TEXT,
                is_team_freed INTEGER, date_target TEXT, status TEXT
            );
            INSERT INTO objects VALUES (1,'Первый объект');
            INSERT INTO teams VALUES (1,'Первая'),(2,'Вторая');
            """
        )
        await conn.execute(
            "INSERT INTO applications VALUES (1,'1,2',?,1,'','Прораб','11,22','1',0,'2026-08-14','in_progress')",
            (json.dumps([
                {"id": 7, "name": "Экскаватор", "time_start": "08", "time_end": "17", "is_freed": True},
                {"id": 8, "name": "Кран", "time_start": "08", "time_end": "17"},
            ], ensure_ascii=False),),
        )
        await conn.commit()
        repo = type("Repo", (AppsRepoMixin,), {"conn": conn})()

        released = await repo.check_resource_availability(
            "2026-08-14", 2, "1", json.dumps([{"id": 7, "name": "Экскаватор", "time_start": "08", "time_end": "17"}]),
            selected_members="11",
        )
        assert released == []

        busy = await repo.check_resource_availability(
            "2026-08-14", 2, "2", json.dumps([{"id": 8, "name": "Кран", "time_start": "08", "time_end": "17"}]),
            selected_members="22",
        )
        assert any("Вторая" in message for message in busy)
        assert any("Кран" in message for message in busy)
        await conn.close()

    asyncio.run(scenario())

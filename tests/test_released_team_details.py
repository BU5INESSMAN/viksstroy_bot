import asyncio
import os
import sys
from types import SimpleNamespace
from unittest.mock import patch

import aiosqlite


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
for path in (ROOT, WEB):
    if path not in sys.path:
        sys.path.insert(0, path)

from routers import teams


def test_team_details_ignores_individually_released_team():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        await conn.executescript(
            """
            CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT, icon TEXT);
            CREATE TABLE team_members(
                id INTEGER PRIMARY KEY, team_id INTEGER, fio TEXT, position TEXT,
                tg_user_id INTEGER, is_foreman INTEGER, status TEXT,
                status_from TEXT, status_until TEXT, status_reason TEXT
            );
            CREATE TABLE objects(id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY, team_id TEXT, selected_members TEXT,
                object_id INTEGER, object_address TEXT, date_target TEXT,
                status TEXT, freed_team_ids TEXT, is_team_freed INTEGER
            );
            INSERT INTO teams VALUES (1,'Первая',''),(2,'Вторая','');
            INSERT INTO team_members VALUES
                (11,1,'Первый рабочий','Монтажник',NULL,0,'available','','',''),
                (22,2,'Второй рабочий','Монтажник',NULL,0,'available','','','');
            INSERT INTO objects VALUES (1,'Объект');
            INSERT INTO applications VALUES
                (100,'1,2','11,22',1,'','2026-08-20','in_progress','1',0);
            """
        )
        fake_db = SimpleNamespace(conn=conn)
        with patch.object(teams, "db", fake_db):
            released = await teams.get_team_details(
                1, date="2026-08-20", current_user={"role": "superadmin", "tg_id": 1}
            )
            busy = await teams.get_team_details(
                2, date="2026-08-20", current_user={"role": "superadmin", "tg_id": 1}
            )
        assert released["members"][0]["is_used"] is False
        assert busy["members"][0]["is_used"] is True
        assert busy["members"][0]["used_in_app_id"] == 100
        await conn.close()

    asyncio.run(scenario())

import json
import unittest

import aiosqlite

from web.services.smr_completeness import get_smr_completeness
from web.services.smr_sections import (
    ensure_smr_team_sections,
    mark_payload_sections_submitted,
    set_smr_team_section_status,
)


class SmrTeamSectionsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.conn = await aiosqlite.connect(":memory:")
        self.conn.row_factory = aiosqlite.Row
        await self.conn.executescript(
            """
            CREATE TABLE applications (
                id INTEGER PRIMARY KEY, smr_group_id TEXT, team_id TEXT,
                selected_members TEXT
            );
            CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE team_members (
                id INTEGER PRIMARY KEY, team_id INTEGER, fio TEXT,
                position TEXT, is_foreman INTEGER
            );
            CREATE TABLE application_hours (
                id INTEGER PRIMARY KEY, app_id INTEGER, team_id INTEGER,
                user_id INTEGER, hours REAL, is_additional INTEGER
            );
            CREATE TABLE smr_team_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT, app_id INTEGER,
                team_id INTEGER, status TEXT, roster_json TEXT,
                not_worked_reason TEXT, updated_by INTEGER,
                updated_by_role TEXT, submitted_at TEXT, created_at TEXT,
                updated_at TEXT, UNIQUE(app_id,team_id)
            );
            INSERT INTO applications VALUES (1,NULL,'5','10,11');
            INSERT INTO teams VALUES (5,'Бригада 5');
            INSERT INTO team_members VALUES
                (10,5,'Иванов','Монтажник',1),
                (11,5,'Петров','Монтажник',0);
            """
        )
        self.db = type("Db", (), {"conn": self.conn})()

    async def asyncTearDown(self):
        await self.conn.close()

    async def test_explicit_zero_completes_frozen_roster(self):
        sections = await ensure_smr_team_sections(self.db, [1], commit=True)
        roster = json.loads(sections[0]["roster_json"])
        self.assertEqual([row["member_id"] for row in roster], [10, 11])
        await self.conn.executemany(
            "INSERT INTO application_hours VALUES (?,?,?,?,?,0)",
            [(1, 1, 5, 10, 8), (2, 1, 5, 11, 0)],
        )
        await self.conn.commit()
        result = await get_smr_completeness(self.db, [1])
        self.assertTrue(result[1]["is_complete"])

    async def test_not_worked_section_is_complete_without_hours(self):
        await ensure_smr_team_sections(self.db, [1], commit=True)
        await set_smr_team_section_status(
            self.db, 1, 5, "not_worked",
            actor_id=100, actor_role="foreman", commit=True,
        )
        result = await get_smr_completeness(self.db, [1])
        self.assertTrue(result[1]["is_complete"])
        self.assertEqual(result[1]["not_worked_sections"], 1)

    async def test_ad_hoc_workers_from_another_team_do_not_require_a_section(self):
        await ensure_smr_team_sections(self.db, [1], commit=True)
        await self.conn.execute(
            "INSERT INTO application_hours VALUES (3,1,15,99,8,0)"
        )
        await mark_payload_sections_submitted(
            self.db,
            [1],
            [
                {"source_application_id": 1, "team_id": 5, "user_id": 10, "hours": 8},
                {"source_application_id": 1, "team_id": 15, "user_id": 99, "hours": 8},
            ],
            actor_id=100,
            actor_role="foreman",
        )
        async with self.conn.execute(
            "SELECT team_id,status FROM smr_team_sections WHERE app_id=1 ORDER BY team_id"
        ) as cursor:
            rows = await cursor.fetchall()
        self.assertEqual([(row[0], row[1]) for row in rows], [(5, "submitted")])


if __name__ == "__main__":
    unittest.main()

import os
import sys
import unittest
from types import SimpleNamespace

import aiosqlite


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
SERVICES = os.path.join(WEB, "services")
for path in (ROOT, WEB, SERVICES):
    if path not in sys.path:
        sys.path.insert(0, path)

from resource_stats import drivers_overview, equipment_overview, teams_overview


class ResourceOverviewTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        await conn.executescript(
            """
            CREATE TABLE objects(id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE users(
                user_id INTEGER PRIMARY KEY, fio TEXT, role TEXT,
                is_active INTEGER, is_blacklisted INTEGER, is_deleted INTEGER,
                member_status TEXT, status_from TEXT, status_until TEXT
            );
            CREATE TABLE account_links(primary_id INTEGER, secondary_id INTEGER);
            CREATE TABLE team_members(
                id INTEGER PRIMARY KEY, team_id INTEGER, fio TEXT, position TEXT,
                tg_user_id INTEGER, status TEXT, status_from TEXT,
                status_until TEXT, is_foreman INTEGER
            );
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY, public_number TEXT, date_target TEXT,
                status TEXT, foreman_name TEXT, team_id TEXT,
                selected_members TEXT, equipment_data TEXT, object_id INTEGER,
                object_address TEXT, is_archived INTEGER DEFAULT 0,
                time_start TEXT, time_end TEXT
            );
            CREATE TABLE application_hours(
                app_id INTEGER, team_id INTEGER, user_id INTEGER, hours REAL
            );
            CREATE TABLE equipment(
                id INTEGER PRIMARY KEY, name TEXT, category TEXT, status TEXT,
                license_plate TEXT, default_driver_user_id INTEGER,
                is_active INTEGER
            );
            CREATE TABLE application_drivers(
                application_id INTEGER, equipment_id INTEGER, driver_user_id INTEGER
            );
            CREATE TABLE application_resource_releases(
                application_id INTEGER, resource_type TEXT, resource_id INTEGER,
                released_at TEXT
            );

            INSERT INTO objects VALUES(1, 'Объект Север');
            INSERT INTO teams VALUES(1, 'Бригада Один');
            INSERT INTO users VALUES(-500, 'Иванов Иван', 'driver', 1, 0, 0, 'available', NULL, NULL);
            INSERT INTO users VALUES(-2, 'Петров Пётр', 'driver', 0, 0, 0, 'available', NULL, NULL);
            INSERT INTO team_members VALUES(1, 1, 'Иванов Иван', 'машинист', -500, 'available', NULL, NULL, 1);
            INSERT INTO team_members VALUES(2, 1, 'Петров Пётр', 'рабочий', -2, 'available', NULL, NULL, 0);
            INSERT INTO applications VALUES(
                10, 'З-010826-01', '2026-08-01', 'completed', 'Прораб',
                '1', '1', '[{"id":7,"time_start":"08:00","time_end":"12:30"}]',
                1, '', 0, '08:00', '17:00'
            );
            INSERT INTO application_hours VALUES(10, 1, 1, 4.5);
            INSERT INTO equipment VALUES(7, 'Экскаватор', 'Спецтехника', 'free', 'А001АА22', -500, 1);
            INSERT INTO application_drivers VALUES(10, 7, -500);
            """
        )
        await conn.commit()
        self.conn = conn
        self.db = SimpleNamespace(conn=conn)

    async def asyncTearDown(self):
        await self.conn.close()

    async def test_teams_overview_counts_real_max_accounts_and_partial_work(self):
        result = await teams_overview(self.db, "all")
        self.assertEqual(result["metrics"][0]["value"], 1)
        self.assertEqual(result["metrics"][1]["value"], 2)
        self.assertEqual(result["metrics"][2]["value"], 1)
        row = result["rows"][0]
        self.assertEqual(row["partial_assignments"], 1)
        self.assertEqual(row["people_assignments"], 1)
        self.assertEqual(row["labor_hours"], 4.5)
        self.assertEqual([member["max_linked"] for member in row["members"]], [True, False])

    async def test_equipment_overview_uses_actual_shift_duration(self):
        result = await equipment_overview(self.db, "all")
        self.assertEqual(result["metrics"][0]["value"], 1)
        self.assertEqual(result["metrics"][3]["value"], 4.5)
        self.assertEqual(result["rows"][0]["objects_count"], 1)

    async def test_driver_overview_does_not_mark_placeholder_as_max_linked(self):
        result = await drivers_overview(self.db, "all")
        metrics = {item["label"]: item["value"] for item in result["metrics"]}
        self.assertIn(1, metrics.values())
        linked = {row["fio"]: bool(row["max_linked"]) for row in result["rows"]}
        self.assertEqual(linked, {"Иванов Иван": True, "Петров Пётр": False})
        active = next(row for row in result["rows"] if row["user_id"] == -500)
        self.assertEqual(active["assignments"], 1)
        self.assertEqual(active["equipment_count"], 1)


if __name__ == "__main__":
    unittest.main()

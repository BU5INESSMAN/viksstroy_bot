import os
import sys
import unittest

import aiosqlite


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
for path in (ROOT, WEB):
    if path not in sys.path:
        sys.path.insert(0, path)

SERVICES = os.path.join(WEB, "services")
if SERVICES not in sys.path:
    sys.path.insert(0, SERVICES)

from resource_stats import equipment_stats, object_resource_stats, team_stats


class ResourceStatisticsTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = type("DB", (), {})()
        self.db.conn = await aiosqlite.connect(":memory:")
        await self.db.conn.executescript(
            """
            CREATE TABLE objects(id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE team_members(id INTEGER PRIMARY KEY, team_id INTEGER);
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY, public_number TEXT, date_target TEXT,
                status TEXT, foreman_name TEXT, team_id TEXT,
                selected_members TEXT, equipment_data TEXT, object_id INTEGER,
                object_address TEXT, is_archived INTEGER DEFAULT 0
            );
            CREATE TABLE application_hours(app_id INTEGER, team_id INTEGER, hours REAL);

            INSERT INTO objects VALUES (1, 'Объект А'), (2, 'Объект Б');
            INSERT INTO team_members VALUES (10, 1), (11, 1);
            INSERT INTO applications VALUES
                (1, 'З-010826-01', '2026-08-01', 'completed', 'Прораб', '1', '10',
                 '[{"id":5,"time_start":"08:00","time_end":"10:00"}]', 1, '', 0),
                (2, 'З-010826-02', '2026-08-01', 'approved', 'Прораб', '1', '11',
                 '[{"id":5,"time_start":"13","time_end":"18"}]', 2, '', 0),
                (3, 'З-020826-01', '2026-08-02', 'cancelled', 'Прораб', '1', '10,11',
                 '[{"id":5,"time_start":"08","time_end":"18"}]', 1, '', 0);
            INSERT INTO application_hours VALUES (1, 1, 4), (2, 1, 6), (3, 1, 99);
            """
        )

    async def asyncTearDown(self):
        await self.db.conn.close()

    async def test_team_counts_partial_people_hours_and_two_objects(self):
        stats = await team_stats(self.db, 1, "all")
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["work_days"], 1)
        self.assertEqual(stats["objects"], ["Объект А", "Объект Б"])
        self.assertEqual(stats["partial_assignments"], 2)
        self.assertEqual(stats["people_assignments"], 2)
        self.assertEqual(stats["labor_hours"], 10)

    async def test_equipment_uses_shift_hours_not_whole_days(self):
        stats = await equipment_stats(self.db, 5, "all")
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["work_days"], 1)
        self.assertEqual(stats["work_hours"], 7)
        self.assertEqual(stats["objects"], ["Объект А", "Объект Б"])

    async def test_object_resource_summary_uses_partial_allocation(self):
        stats = await object_resource_stats(self.db, 1)
        self.assertEqual(stats["applications"], 1)
        self.assertEqual(stats["partial_teams"], 1)
        self.assertEqual(stats["people_assignments"], 1)
        self.assertEqual(stats["equipment_hours"], 2)

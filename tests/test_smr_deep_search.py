import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import aiosqlite


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
for path in (ROOT, WEB):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from routers import kp


class SmrDeepSearchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        conn = await aiosqlite.connect(":memory:")
        await conn.executescript(
            """
            CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE team_members(
                id INTEGER PRIMARY KEY, team_id INTEGER, fio TEXT, position TEXT
            );
            CREATE TABLE application_hours(
                app_id INTEGER, user_id INTEGER, team_id INTEGER, hours REAL
            );
            CREATE TABLE kp_catalog(
                id INTEGER PRIMARY KEY, category TEXT, name TEXT
            );
            CREATE TABLE application_kp(
                application_id INTEGER, kp_id INTEGER, unit TEXT, volume REAL
            );
            CREATE TABLE extra_works_catalog(
                id INTEGER PRIMARY KEY, name TEXT
            );
            CREATE TABLE application_extra_works(
                application_id INTEGER, kp_id INTEGER, extra_work_id INTEGER,
                custom_name TEXT, unit TEXT, volume REAL
            );

            INSERT INTO teams VALUES(4, 'Бригада Альфа');
            INSERT INTO team_members VALUES(21, 4, 'Иванов Андрей', 'бетонщик');
            INSERT INTO team_members VALUES(22, 4, 'Петров Николай', 'монтажник');
            INSERT INTO application_hours VALUES(70, 21, 4, 8);
            INSERT INTO kp_catalog VALUES(8, 'Благоустройство', 'Монтаж бордюра');
            INSERT INTO application_kp VALUES(70, 8, 'м', 15);
            INSERT INTO application_extra_works VALUES(70, NULL, NULL, 'Вывоз грунта', 'м3', 2);
            """
        )
        await conn.commit()
        self.conn = conn
        self.original_db = kp.db
        kp.db = SimpleNamespace(conn=conn)

    async def asyncTearDown(self):
        kp.db = self.original_db
        await self.conn.close()

    async def test_index_contains_exact_participant_and_all_report_works(self):
        apps = [{
            "id": 70,
            "public_number": "З-010826-01",
            "foreman_name": "Сидоров Сергей",
            "team_id": "4",
            "selected_members": "21,22",
            "date_target": "2026-08-01",
            "object_name": "Школа №1",
            "object_address": "улица Ленина 10",
            "equipment_data": '[{"name":"Экскаватор","license_plate":"А001АА22"}]',
        }]

        await kp._attach_smr_search_text(apps)

        search_text = apps[0]["search_text"]
        self.assertIn("Иванов Андрей", search_text)
        self.assertIn("бетонщик", search_text)
        self.assertNotIn("Петров Николай", search_text)
        self.assertIn("Монтаж бордюра", search_text)
        self.assertIn("Вывоз грунта", search_text)
        self.assertIn("А001АА22", search_text)


if __name__ == "__main__":
    unittest.main()

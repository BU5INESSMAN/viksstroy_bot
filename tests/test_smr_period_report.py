import unittest
from datetime import date
from io import BytesIO

import aiosqlite
from openpyxl import load_workbook

from web.services.smr_period_report import generate_period_report


class SmrPeriodReportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.conn = await aiosqlite.connect(":memory:")
        self.conn.row_factory = aiosqlite.Row
        await self.conn.executescript(
            """
            CREATE TABLE applications (
                id INTEGER PRIMARY KEY, date_target TEXT, smr_status TEXT,
                kp_status TEXT, object_id INTEGER, object_address TEXT
            );
            CREATE TABLE objects (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE team_members (id INTEGER PRIMARY KEY, fio TEXT);
            CREATE TABLE application_hours (
                id INTEGER PRIMARY KEY, app_id INTEGER, user_id INTEGER,
                hours REAL, participant_salary REAL, is_additional INTEGER
            );
            INSERT INTO objects VALUES (1,'ВОС 1'),(2,'База');
            INSERT INTO applications VALUES
                (1,'2026-07-10','approved',NULL,1,''),
                (2,'2026-07-11','approved',NULL,2,''),
                (3,'2026-07-12','in_progress','approved',2,'');
            INSERT INTO team_members VALUES
                (10,'Иванов Иван'),(11,'Петров Пётр'),(12,'Иванов Иван');
            INSERT INTO application_hours VALUES
                (1,1,10,8,4000,0),
                (2,1,10,2,1000,1),
                (3,2,10,4,2000,0),
                (4,2,11,0,0,0),
                (5,1,12,1,500,0),
                (6,3,11,99,99000,0);
            """
        )
        self.db = type("Db", (), {"conn": self.conn})()

    async def asyncTearDown(self):
        await self.conn.close()

    async def test_matches_reference_matrix_shape_and_totals(self):
        blob, filename, summary = await generate_period_report(
            self.db, date(2026, 7, 1), date(2026, 7, 31)
        )
        workbook = load_workbook(BytesIO(blob), data_only=True)
        sheet = workbook["Лист_1"]
        self.assertEqual(sheet["A2"].value, "Параметры:")
        self.assertEqual(sheet["C2"].value, "Период: 01.07.2026 - 31.07.2026")
        self.assertEqual(sheet["A4"].value, "Сотрудник")
        self.assertEqual(sheet["D5"].value, "Заработная плата")
        self.assertEqual(sheet["F5"].value, "Количество часов")
        self.assertIn("A4:C5", {str(value) for value in sheet.merged_cells.ranges})
        self.assertIn("D4:F4", {str(value) for value in sheet.merged_cells.ranges})
        self.assertEqual(sheet["A6"].value, "Иванов Иван")
        self.assertEqual(sheet["D6"].value, 2000)
        self.assertEqual(sheet["F6"].value, 4)
        self.assertEqual(sheet["G6"].value, 5000)
        self.assertEqual(sheet["H6"].value, 10)
        self.assertEqual(sheet["I6"].value, 7000)
        self.assertEqual(sheet["J6"].value, 14)
        self.assertEqual(sheet["A6"].value, "Иванов Иван")
        self.assertEqual(sheet["A7"].value, "Иванов Иван")
        self.assertNotEqual(sheet["I6"].value, sheet["I7"].value)
        self.assertEqual(sheet["A9"].value, "Итого")
        self.assertEqual(summary["employees"], 3)
        self.assertEqual(summary["objects"], 2)
        self.assertTrue(filename.endswith(".xlsx"))


if __name__ == "__main__":
    unittest.main()

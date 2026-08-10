import unittest

import sqlite3

from smr_calculations import (
    MAX_HOURS_PER_ROW,
    SmrNumberError,
    decimal_value,
)
from smr_data import get_smr_read_model


class AsyncCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        self.cursor.close()

    async def fetchone(self):
        return self.cursor.fetchone()

    async def fetchall(self):
        return self.cursor.fetchall()


class AsyncSqliteConnection:
    """Tiny stdlib adapter covering the read-model's async DB protocol."""

    def __init__(self):
        self.raw = sqlite3.connect(":memory:")
        self.raw.row_factory = sqlite3.Row

    def execute(self, sql, params=()):
        return AsyncCursor(self.raw.execute(sql, params))

    def executescript(self, sql):
        self.raw.executescript(sql)

    def close(self):
        self.raw.close()


class SmrNumberTests(unittest.TestCase):
    def test_rejects_non_finite_and_excess_hours(self):
        with self.assertRaises(SmrNumberError):
            decimal_value("nan", field="Часы", maximum=MAX_HOURS_PER_ROW)
        with self.assertRaises(SmrNumberError):
            decimal_value(25, field="Часы", maximum=MAX_HOURS_PER_ROW)

    def test_decimal_comma_and_rounding(self):
        self.assertEqual(str(decimal_value("1,2345", field="Объём")), "1.235")


class SmrReadModelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = type("Db", (), {})()
        self.db.conn = AsyncSqliteConnection()
        self.db.conn.executescript(
            """
            CREATE TABLE applications (id INTEGER PRIMARY KEY, smr_group_id TEXT);
            CREATE TABLE kp_catalog (id INTEGER PRIMARY KEY, category TEXT, name TEXT, unit TEXT);
            CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE users (user_id INTEGER PRIMARY KEY, fio TEXT, role TEXT);
            CREATE TABLE team_members (id INTEGER PRIMARY KEY, fio TEXT, position TEXT);
            CREATE TABLE extra_works_catalog (id INTEGER PRIMARY KEY, name TEXT, unit TEXT);
            CREATE TABLE application_kp (
                id INTEGER PRIMARY KEY, application_id INTEGER, kp_id INTEGER,
                volume REAL, unit TEXT, current_salary REAL, current_price REAL,
                team_id INTEGER, is_additional INTEGER, filled_at TEXT,
                filled_by_user_id INTEGER
            );
            CREATE TABLE application_extra_works (
                id INTEGER PRIMARY KEY, application_id INTEGER, kp_id INTEGER,
                extra_work_id INTEGER, custom_name TEXT, unit TEXT, volume REAL,
                salary REAL, price REAL, team_id INTEGER, is_additional INTEGER,
                filled_at TEXT, filled_by_user_id INTEGER
            );
            CREATE TABLE application_hours (
                id INTEGER PRIMARY KEY, app_id INTEGER, team_id INTEGER,
                user_id INTEGER, hours REAL, participant_salary REAL,
                is_additional INTEGER,
                filled_at TEXT, filled_by_user_id INTEGER
            );
            INSERT INTO applications VALUES (1, 'g1'), (2, 'g1');
            INSERT INTO kp_catalog VALUES (10, 'Монтаж', 'Работа', 'м2');
            INSERT INTO teams VALUES (5, 'Бригада');
            INSERT INTO users VALUES (100, 'Автор', 'foreman');
            INSERT INTO team_members VALUES (7, 'Рабочий', 'Монтажник');
            INSERT INTO application_kp VALUES
                (1, 1, 10, 2, 'м2', 10, 40, 5, 0, '2026-01-01', 100),
                (2, 2, 10, 1.5, 'м2', 10, 40, 5, 1, '2026-01-02', 100);
            INSERT INTO application_extra_works VALUES
                (1, 2, 10, 0, 'Доп. работа', 'м2', 3, 5, 20, 5, 1, '2026-01-02', 100);
            INSERT INTO application_hours VALUES
                (1, 1, 5, 7, 8, 4000, 0, '2026-01-01', 100),
                (2, 2, 5, 7, 2.5, 1250, 1, '2026-01-02', 100);
            """
        )

    async def asyncTearDown(self):
        self.db.conn.close()

    async def test_merged_main_and_addendum_totals_are_consistent(self):
        report = await get_smr_read_model(self.db, 2)
        self.assertEqual(report["application_ids"], [1, 2])
        self.assertEqual(report["totals"], {
            "hours": 10.5,
            "salary": 50.0,
            "participant_salary": 5250.0,
            "price": 200.0,
        })
        self.assertEqual(report["hours"][0]["participant_salary"], 4000)
        self.assertEqual(report["extra_works"][0]["kp_id"], 10)
        self.assertEqual(report["extra_works"][0]["name"], "Доп. работа")


if __name__ == "__main__":
    unittest.main()

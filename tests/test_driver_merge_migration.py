import unittest

import aiosqlite

from database.migrations.m_2026_08_merge_duplicate_max_drivers import run


class DriverMergeMigrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_unique_placeholder_is_merged_into_active_max_driver(self):
        conn = await aiosqlite.connect(":memory:")
        try:
            await conn.executescript(
                """
                CREATE TABLE users(user_id INTEGER PRIMARY KEY,fio TEXT,role TEXT,is_active INTEGER,is_deleted INTEGER);
                CREATE TABLE driver_categories(user_id INTEGER,category TEXT,PRIMARY KEY(user_id,category));
                CREATE TABLE equipment_driver_usage(equipment_id INTEGER,driver_user_id INTEGER,last_used_at TEXT,usage_count INTEGER,PRIMARY KEY(equipment_id,driver_user_id));
                CREATE TABLE application_drivers(application_id INTEGER,equipment_id INTEGER,driver_user_id INTEGER,PRIMARY KEY(application_id,equipment_id));
                CREATE TABLE equipment(id INTEGER PRIMARY KEY,default_driver_user_id INTEGER);
                INSERT INTO users VALUES(-10,'Иванов Иван Иванович','driver',0,0);
                INSERT INTO users VALUES(-999,'Иванов Иван Иванович','driver',1,0);
                INSERT INTO driver_categories VALUES(-10,'Самосвал');
                INSERT INTO equipment_driver_usage VALUES(7,-10,'2026-08-01',3);
                INSERT INTO application_drivers VALUES(5,7,-10);
                INSERT INTO equipment VALUES(7,-10);
                """
            )
            await run(conn)
            async with conn.execute("SELECT user_id FROM users ORDER BY user_id") as cur:
                self.assertEqual(await cur.fetchall(), [(-999,)])
            async with conn.execute("SELECT user_id,category FROM driver_categories") as cur:
                self.assertEqual(await cur.fetchall(), [(-999, 'Самосвал')])
            async with conn.execute("SELECT driver_user_id FROM application_drivers") as cur:
                self.assertEqual((await cur.fetchone())[0], -999)
            async with conn.execute("SELECT default_driver_user_id FROM equipment") as cur:
                self.assertEqual((await cur.fetchone())[0], -999)
        finally:
            await conn.close()

    async def test_ambiguous_names_are_not_merged(self):
        conn = await aiosqlite.connect(":memory:")
        try:
            await conn.executescript(
                """
                CREATE TABLE users(user_id INTEGER PRIMARY KEY,fio TEXT,role TEXT,is_active INTEGER,is_deleted INTEGER);
                CREATE TABLE driver_categories(user_id INTEGER,category TEXT,PRIMARY KEY(user_id,category));
                CREATE TABLE equipment_driver_usage(equipment_id INTEGER,driver_user_id INTEGER,last_used_at TEXT,usage_count INTEGER,PRIMARY KEY(equipment_id,driver_user_id));
                CREATE TABLE application_drivers(application_id INTEGER,equipment_id INTEGER,driver_user_id INTEGER,PRIMARY KEY(application_id,equipment_id));
                CREATE TABLE equipment(id INTEGER PRIMARY KEY,default_driver_user_id INTEGER);
                INSERT INTO users VALUES(-1,'Петров Петр','driver',0,0);
                INSERT INTO users VALUES(-2,'Петров Петр','driver',0,0);
                INSERT INTO users VALUES(-999,'Петров Петр','driver',1,0);
                """
            )
            await run(conn)
            async with conn.execute("SELECT COUNT(*) FROM users") as cur:
                self.assertEqual((await cur.fetchone())[0], 3)
        finally:
            await conn.close()


if __name__ == "__main__":
    unittest.main()

import os
import sys
import unittest

import aiosqlite


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if WEB not in sys.path:
    sys.path.insert(0, WEB)

from application_numbers import display_application_number, make_application_number
from database.migrations.m_2026_08_application_numbers_and_driver_roles import run
from database.migrations.m_2026_08_russian_application_numbers import run as run_russian_numbers


class ApplicationNumberHelpersTest(unittest.TestCase):
    def test_short_number_format_and_fallback(self):
        self.assertEqual(make_application_number("040826", 1), "З-040826-01")
        self.assertEqual(make_application_number("040826", 113), "З-040826-113")
        self.assertEqual(display_application_number(1034, "З-040826-17"), "З-040826-17")
        self.assertEqual(display_application_number(1034), "З-1034")


class ApplicationNumberMigrationTest(unittest.IsolatedAsyncioTestCase):
    async def test_backfills_stable_numbers_and_deleted_driver_role(self):
        db = await aiosqlite.connect(":memory:")
        await db.executescript(
            """
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY, created_at TEXT, date_target TEXT
            );
            CREATE TABLE users(
                user_id INTEGER PRIMARY KEY, role TEXT, invite_code TEXT,
                is_blacklisted INTEGER DEFAULT 0
            );
            INSERT INTO applications VALUES
                (1, '2026-08-04 01:00:00', '2026-08-05'),
                (2, '2026-08-04 02:00:00', '2026-08-06'),
                (3, '2026-08-05 02:00:00', '2026-08-07');
            INSERT INTO users VALUES (-10, NULL, 'INVITE', 0);
            """
        )
        await run(db)
        await db.commit()

        async with db.execute("SELECT public_number FROM applications ORDER BY id") as cur:
            self.assertEqual(
                [row[0] for row in await cur.fetchall()],
                ["З-260804-01", "З-260804-02", "З-260805-01"],
            )
        async with db.execute("SELECT role,is_blacklisted FROM users WHERE user_id=-10") as cur:
            self.assertEqual(await cur.fetchone(), ("driver", 1))
        await db.close()

    async def test_converts_existing_numbers_to_russian_date_order(self):
        db = await aiosqlite.connect(":memory:")
        await db.executescript(
            """
            CREATE TABLE applications(id INTEGER PRIMARY KEY, public_number TEXT UNIQUE);
            INSERT INTO applications VALUES
                (1, 'З-260804-01'),
                (2, 'З-260804-02'),
                (3, 'З-260805-01');
            """
        )
        await run_russian_numbers(db)
        await db.commit()
        async with db.execute("SELECT public_number FROM applications ORDER BY id") as cur:
            self.assertEqual(
                [row[0] for row in await cur.fetchall()],
                ["З-040826-01", "З-040826-02", "З-050826-01"],
            )
        await db.close()

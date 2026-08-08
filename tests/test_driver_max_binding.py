import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import aiosqlite


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
if str(WEB) not in sys.path:
    sys.path.insert(0, str(WEB))

from services.driver_service import _enrich_driver


class DriverMaxBindingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.conn = await aiosqlite.connect(":memory:")
        await self.conn.executescript(
            """
            CREATE TABLE driver_categories(user_id INTEGER, category TEXT);
            CREATE TABLE equipment_category_settings(category TEXT, icon TEXT);
            CREATE TABLE account_links(primary_id INTEGER, secondary_id INTEGER);
            CREATE TABLE users(user_id INTEGER PRIMARY KEY, is_active INTEGER);
            """
        )
        self.db = SimpleNamespace(conn=self.conn)

    async def asyncTearDown(self):
        await self.conn.close()

    async def test_active_negative_id_is_real_max_account(self):
        result = await _enrich_driver(self.db, {"user_id": -987654, "is_active": 1})
        self.assertFalse(result["is_synthetic"])
        self.assertTrue(result["max_linked"])
        self.assertEqual(result["max_id"], 987654)

    async def test_inactive_negative_id_is_placeholder(self):
        result = await _enrich_driver(self.db, {"user_id": -4, "is_active": 0})
        self.assertTrue(result["is_synthetic"])
        self.assertFalse(result["max_linked"])

    async def test_legacy_account_finds_max_link_in_either_direction(self):
        await self.conn.execute(
            "INSERT INTO account_links(primary_id,secondary_id) VALUES(?,?)",
            (123, -987654),
        )
        await self.conn.execute(
            "INSERT INTO users(user_id,is_active) VALUES(?,?)",
            (-987654, 1),
        )
        await self.conn.commit()
        result = await _enrich_driver(self.db, {"user_id": 123, "is_active": 1})
        self.assertTrue(result["max_linked"])
        self.assertEqual(result["max_id"], 987654)

    async def test_stale_link_to_inactive_placeholder_is_not_max_binding(self):
        await self.conn.execute(
            "INSERT INTO account_links(primary_id,secondary_id) VALUES(?,?)",
            (123, -12),
        )
        await self.conn.execute(
            "INSERT INTO users(user_id,is_active) VALUES(?,?)",
            (-12, 0),
        )
        await self.conn.commit()
        result = await _enrich_driver(self.db, {"user_id": 123, "is_active": 1})
        self.assertFalse(result["max_linked"])


if __name__ == "__main__":
    unittest.main()

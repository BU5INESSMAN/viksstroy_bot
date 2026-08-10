import asyncio
import json
import sqlite3
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
if str(WEB) not in sys.path:
    sys.path.insert(0, str(WEB))

# The production services package eagerly imports MAX SDK integrations. This
# isolated unit test only needs action_items + role_passwords, both stdlib-only.
services_package = types.ModuleType("services")
services_package.__path__ = [str(WEB / "services")]
sys.modules["services"] = services_package

from services.action_items import collect_action_items
from utils_fio import get_user_settings, merge_user_settings


class AsyncCursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self.description = cursor.description

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        self.cursor.close()

    async def fetchall(self):
        return self.cursor.fetchall()

    async def fetchone(self):
        return self.cursor.fetchone()


class AsyncConnection:
    def __init__(self):
        self.raw = sqlite3.connect(":memory:")

    def execute(self, sql, params=()):
        return AsyncCursor(self.raw.execute(sql, params))

    async def commit(self):
        self.raw.commit()


class FakeDB:
    def __init__(self):
        self.conn = AsyncConnection()


class ActionItemsTests(unittest.TestCase):
    def test_collects_workflow_and_data_problems_with_direct_links(self):
        db = FakeDB()
        db.conn.raw.executescript(
            """
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY, status TEXT, is_archived INTEGER,
                smr_group_id TEXT, kp_archived INTEGER, smr_status TEXT,
                kp_status TEXT, smr_accounted_at TEXT
            );
            CREATE TABLE object_requests(id INTEGER PRIMARY KEY, status TEXT);
            CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE team_members(
                id INTEGER PRIMARY KEY, team_id INTEGER, position TEXT,
                is_foreman INTEGER, tg_user_id INTEGER
            );
            CREATE TABLE objects(
                id INTEGER PRIMARY KEY, name TEXT, address TEXT, is_archived INTEGER
            );
            CREATE TABLE object_kp_plan(id INTEGER PRIMARY KEY, object_id INTEGER);
            CREATE TABLE equipment(
                id INTEGER PRIMARY KEY, name TEXT, category TEXT,
                license_plate TEXT, default_driver_user_id INTEGER, is_active INTEGER
            );
            CREATE TABLE users(
                user_id INTEGER PRIMARY KEY, role TEXT, is_blacklisted INTEGER,
                is_deleted INTEGER, is_active INTEGER
            );
            CREATE TABLE driver_categories(user_id INTEGER, category TEXT);
            CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);

            INSERT INTO applications VALUES(1,'waiting',0,'',0,'','',NULL);
            INSERT INTO applications VALUES(2,'completed',0,'g-2',0,'pending_review','submitted',NULL);
            INSERT INTO applications VALUES(3,'completed',0,'g-3',0,'approved','approved',NULL);
            INSERT INTO object_requests VALUES(1,'pending');
            INSERT INTO teams VALUES(7,'Монтажники');
            INSERT INTO team_members VALUES(1,7,'',0,NULL);
            INSERT INTO objects VALUES(9,'Склад','',0);
            INSERT INTO equipment VALUES(11,'Кран','','',NULL,1);
            INSERT INTO users VALUES(20,'',0,0,1);
            INSERT INTO users VALUES(21,'driver',0,0,0);
            """
        )

        result = asyncio.run(collect_action_items(db, "boss"))
        by_id = {item["id"]: item for item in result["items"]}

        self.assertIn("applications-waiting", by_id)
        self.assertIn("smr-pending", by_id)
        self.assertIn("smr-unaccounted", by_id)
        self.assertIn("object-requests", by_id)
        self.assertEqual(by_id["team-7"]["url"], "/resources?tab=teams&team_id=7")
        self.assertEqual(by_id["object-9"]["url"], "/objects?object_id=9&object_tab=kp")
        self.assertIn("equipment-11", by_id)
        self.assertIn("users-no-role", by_id)
        self.assertIn("drivers-no-category", by_id)
        self.assertIn("drivers-no-max", by_id)
        self.assertGreater(result["total"], result["groups"])

        moderator_result = asyncio.run(collect_action_items(db, "moderator"))
        self.assertNotIn(
            "users-no-role", {item["id"] for item in moderator_result["items"]}
        )

    def test_onboarding_completion_is_merged_per_role(self):
        first = merge_user_settings(
            "{}", {"onboarding_completed_roles": {"moderator": "3"}}
        )
        second = merge_user_settings(
            first, {"onboarding_completed_roles": {"hr": "3"}}
        )
        settings = get_user_settings(second)
        self.assertEqual(
            settings["onboarding_completed_roles"],
            {"moderator": "3", "hr": "3"},
        )

    def test_auto_publish_disable_has_immediate_and_scheduler_guards(self):
        dashboard = (WEB / "routers" / "dashboard.py").read_text(encoding="utf-8")
        scheduler = (WEB / "scheduler.py").read_text(encoding="utf-8")
        self.assertIn('/api/settings/auto-publish', dashboard)
        self.assertGreaterEqual(
            dashboard.count("DELETE FROM settings WHERE key IN ('smart_publish_at','smart_prompt_at')"),
            2,
        )
        self.assertIn("if auto_publish_enabled and re_prompt_row", scheduler)
        self.assertIn("if auto_publish_enabled and timer_row", scheduler)
        self.assertIn("if auto_publish_enabled and 12 <= now.hour <= 22", scheduler)


if __name__ == "__main__":
    unittest.main()

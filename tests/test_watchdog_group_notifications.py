import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from contextlib import closing

from scripts import watchdog


class WatchdogGroupNotificationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "viksstroy.db"
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
            conn.commit()
        self.original_db_file = watchdog.DB_FILE
        watchdog.DB_FILE = self.db_path

    def tearDown(self):
        watchdog.DB_FILE = self.original_db_file
        self.temp_dir.cleanup()

    def test_schedule_group_from_database_has_priority_over_environment(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)",
                ("max_group_chat_id", "-222"),
            )
            conn.commit()

        with patch.dict(os.environ, {"MAX_GROUP_CHAT_ID": "-111"}):
            self.assertEqual(watchdog.group_chat_id(), "-222")

    def test_group_send_failure_is_not_silenced(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)",
                ("max_group_chat_id", "-222"),
            )
            conn.commit()

        async def failed_send(_chat_id, _message):
            raise RuntimeError("MAX API unavailable")

        with patch.object(watchdog, "send_max", failed_send):
            with self.assertRaisesRegex(RuntimeError, "MAX API unavailable"):
                watchdog.dispatch_group("Update", "Details")

    def test_group_send_uses_schedule_chat(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)",
                ("max_group_chat_id", "-222"),
            )
            conn.commit()

        delivered = []

        async def record_send(chat_id, message):
            delivered.append((chat_id, message))

        with patch.object(watchdog, "send_max", record_send):
            watchdog.dispatch_group("Update", "Details")

        self.assertEqual(delivered, [(-222, "Update\n\nDetails")])


if __name__ == "__main__":
    unittest.main()

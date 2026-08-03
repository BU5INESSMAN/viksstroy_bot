import sqlite3
import unittest
from pathlib import Path

from smr_audit import canonical_json, diff_smr_snapshots, payload_hash


class SmrAuditHelpersTest(unittest.TestCase):
    def test_canonical_hash_ignores_dictionary_order(self):
        left = {"totals": {"price": 20, "salary": 10}, "application_ids": [2, 1]}
        right = {"application_ids": [2, 1], "totals": {"salary": 10, "price": 20}}
        self.assertEqual(canonical_json(left), canonical_json(right))
        self.assertEqual(payload_hash(left), payload_hash(right))

    def test_diff_reports_rate_total_and_added_work(self):
        before = {
            "works": [{"row_id": 5, "name": "Монтаж", "volume": 2, "price_rate": 100}],
            "extra_works": [],
            "totals": {"price": 200, "salary": 80, "hours": 4},
        }
        after = {
            "works": [{"row_id": 5, "name": "Монтаж", "volume": 3, "price_rate": 100}],
            "extra_works": [{"row_id": 9, "name": "Подрезка", "volume": 1, "price_rate": 50}],
            "totals": {"price": 350, "salary": 110, "hours": 4},
        }
        changes = diff_smr_snapshots(before, after)
        paths = {change["path"] for change in changes}
        self.assertIn("works[id:5].volume", paths)
        self.assertIn("extra_works[id:9]", paths)
        self.assertIn("totals.price", paths)
        self.assertIn("totals.salary", paths)
        self.assertNotIn("totals.hours", paths)


class SmrAuditSchemaTest(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        schema_path = Path(__file__).parents[1] / "database" / "schema.sql"
        self.conn.executescript(schema_path.read_text(encoding="utf-8"))

    def tearDown(self):
        self.conn.close()

    def test_audit_entries_are_append_only(self):
        self.conn.execute(
            """INSERT INTO smr_financial_audit
               (id, application_id, primary_application_id, event_type)
               VALUES (1, 1, 1, 'edit')"""
        )
        with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
            self.conn.execute("UPDATE smr_financial_audit SET event_type='delete' WHERE id=1")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
            self.conn.execute("DELETE FROM smr_financial_audit WHERE id=1")

    def test_catalog_versions_and_rows_are_immutable(self):
        self.conn.execute(
            "INSERT INTO kp_catalog_versions (id, version_number, catalog_hash) VALUES (1, 1, 'hash')"
        )
        self.conn.execute(
            "INSERT INTO kp_catalog_version_items (id, version_id, name) VALUES (1, 1, 'Работа')"
        )
        with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
            self.conn.execute("UPDATE kp_catalog_versions SET catalog_hash='other' WHERE id=1")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
            self.conn.execute("DELETE FROM kp_catalog_version_items WHERE id=1")


if __name__ == "__main__":
    unittest.main()

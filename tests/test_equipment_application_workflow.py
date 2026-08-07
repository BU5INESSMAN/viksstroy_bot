import unittest
from pathlib import Path
import tempfile

import aiosqlite

from database.migrations import m_2026_08_remove_detached_drivers


ROOT = Path(__file__).resolve().parents[1]


class EquipmentApplicationWorkflowTests(unittest.TestCase):
    def test_review_removal_cascades_driver_and_has_separate_replacements(self):
        edit_modal = (ROOT / "frontend/src/features/applications/components/EditAppModal.jsx").read_text(encoding="utf-8")
        selector = (ROOT / "frontend/src/features/applications/components/EquipmentSelector.jsx").read_text(encoding="utf-8")
        viewer = (ROOT / "frontend/src/features/applications/components/ViewAppModal.jsx").read_text(encoding="utf-8")

        self.assertIn("delete next[equip.id]", edit_modal)
        self.assertNotIn("if (!isReviewEdit) delete next[equip.id]", edit_modal)
        self.assertIn("currentDriver = nextAssignments[source.id]", edit_modal)
        self.assertIn("nextAssignments[replacement.id] = currentDriver", edit_modal)
        self.assertIn("Заменить технику", selector)
        self.assertIn("Снять технику и водителя", selector)
        self.assertNotIn("Водители без техники", edit_modal)
        self.assertNotIn("Водители без техники", viewer)

    def test_schedule_adds_plate_without_changing_equipment_name(self):
        schedule = (ROOT / "web/schedule_generator.py").read_text(encoding="utf-8")
        self.assertIn("e.license_plate", schedule)
        self.assertIn('f"{ename or \'—\'} [{license_plate}]"', schedule)
        self.assertNotIn('"title": "Водители без техники"', schedule)

    def test_legacy_detached_driver_rows_are_migrated(self):
        migrations = (ROOT / "database/migrations/__init__.py").read_text(encoding="utf-8")
        migration = (ROOT / "database/migrations/m_2026_08_remove_detached_drivers.py").read_text(encoding="utf-8")
        self.assertIn('"m_2026_08_remove_detached_drivers"', migrations)
        self.assertIn("equipment_id not in attached_ids", migration)
        self.assertIn("DELETE FROM application_drivers", migration)


class DetachedDriverMigrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_migration_keeps_attached_driver_and_removes_detached_driver(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "migration.db"
            conn = await aiosqlite.connect(db_path)
            try:
                await conn.execute("CREATE TABLE applications (id INTEGER PRIMARY KEY, equipment_data TEXT)")
                await conn.execute(
                    "CREATE TABLE application_drivers (application_id INTEGER, equipment_id INTEGER, driver_user_id INTEGER)"
                )
                await conn.execute("INSERT INTO applications VALUES (1, ?)", ('[{"id": 10}]',))
                await conn.executemany(
                    "INSERT INTO application_drivers VALUES (1, ?, ?)",
                    [(10, 100), (20, 200)],
                )
                await m_2026_08_remove_detached_drivers.run(conn)
                await conn.commit()
                async with conn.execute(
                    "SELECT equipment_id, driver_user_id FROM application_drivers ORDER BY equipment_id"
                ) as cur:
                    self.assertEqual(await cur.fetchall(), [(10, 100)])
            finally:
                await conn.close()


if __name__ == "__main__":
    unittest.main()

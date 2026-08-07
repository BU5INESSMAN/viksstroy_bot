import sys
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "web"))

spec = importlib.util.spec_from_file_location(
    "smr_report_filename_module", ROOT / "web" / "services" / "smr_report.py"
)
smr_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smr_report)
_build_report_filename = smr_report._build_report_filename
_format_work_date = smr_report._format_work_date


class SmrReportFilenameTests(unittest.TestCase):
    def test_work_date_uses_russian_order(self):
        self.assertEqual(_format_work_date("2026-08-07"), "07.08.2026")

    def test_filename_contains_object_number_and_work_date(self):
        self.assertEqual(
            _build_report_filename(
                object_name="ЖК Северный",
                app_id=42,
                public_number="З-260807-03",
                date_target="2026-08-09",
            ),
            "ЖК Северный - З-260807-03 - 09.08.2026.xlsx",
        )

    def test_filename_is_windows_safe_and_has_legacy_number_fallback(self):
        self.assertEqual(
            _build_report_filename(
                object_name='Объект: секция 1/2',
                app_id=42,
                public_number=None,
                date_target="2026-01-02",
            ),
            "Объект_ секция 1_2 - З-42 - 02.01.2026.xlsx",
        )


if __name__ == "__main__":
    unittest.main()

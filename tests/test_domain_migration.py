import json
import struct
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NEW_DOMAIN = "https://n.viksstroy.online"
OLD_DOMAIN = "https://miniapp.viks22.ru"


class DomainMigrationTests(unittest.TestCase):
    def test_generated_links_use_canonical_domain(self):
        runtime_files = [
            "main_max.py",
            "web/services/notifications.py",
            "web/services/publish_service.py",
            "web/services/ai_context.py",
            "web/routers/drivers.py",
            "web/routers/equipment.py",
            "web/routers/teams.py",
            "web/routers/support.py",
            "scripts/watchdog.py",
        ]
        combined = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in runtime_files)
        self.assertNotIn(OLD_DOMAIN, combined)
        self.assertIn(NEW_DOMAIN, combined)

    def test_driver_invite_has_a_public_frontend_route(self):
        app = (ROOT / "frontend/src/App.jsx").read_text(encoding="utf-8")
        layout = (ROOT / "frontend/src/components/Layout.jsx").read_text(encoding="utf-8")
        self.assertIn('path="/driver-invite/:code"', app)
        self.assertIn("'/driver-invite'", layout)


class PwaMigrationTests(unittest.TestCase):
    def test_manifest_has_stable_identity_and_valid_icon_size(self):
        manifest = json.loads((ROOT / "frontend/public/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["id"], "/")
        self.assertEqual(manifest["scope"], "/")

        png = (ROOT / "frontend/public/icon-512.png").read_bytes()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        width, height = struct.unpack(">II", png[16:24])
        self.assertEqual((width, height), (512, 512))

    def test_expired_push_response_is_not_checked_by_truthiness(self):
        source = (ROOT / "web/services/notifications.py").read_text(encoding="utf-8")
        self.assertIn("e.response is not None and e.response.status_code in (404, 410)", source)
        self.assertNotIn("key_prefix=", source)


if __name__ == "__main__":
    unittest.main()

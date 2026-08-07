import unittest
from pathlib import Path

from scripts.release_notify import _message


ROOT = Path(__file__).resolve().parents[1]


class ReleaseUpdateNotificationTests(unittest.TestCase):
    def test_message_formats_are_exact(self):
        self.assertEqual(
            _message("started", "2.18.2", "Исправления"),
            "Началось обновление до версии 2.18.2",
        )
        self.assertEqual(
            _message("completed", "2.18.2", "Исправления"),
            "Обновление завершено. Что нового: Исправления",
        )

    def test_update_notifications_are_opt_in_and_idempotent(self):
        update = (ROOT / "update.sh").read_text(encoding="utf-8")
        sender = (ROOT / "scripts/release_notify.py").read_text(encoding="utf-8")
        wrapper = (ROOT / "scripts/deploy_release.sh").read_text(encoding="utf-8")

        self.assertIn('SEND_UPDATE_NOTIFICATIONS="${SEND_UPDATE_NOTIFICATIONS:-0}"', update)
        self.assertIn('SEND_UPDATE_NOTIFICATIONS=0 ./update.sh', wrapper)
        self.assertIn('SEND_UPDATE_NOTIFICATIONS=1 ./update.sh', wrapper)
        self.assertIn('delivery_key = f"{args.deployment_id}:{args.event}"', sender)
        self.assertIn('if delivery_key in delivered:', sender)
        self.assertNotIn('notify_deploy "deploy_started"', update)
        self.assertNotIn('notify_deploy "deploy_succeeded"', update)


if __name__ == "__main__":
    unittest.main()

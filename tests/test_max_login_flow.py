import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MaxLoginFlowTests(unittest.TestCase):
    def test_auth_router_exposes_start_and_poll_endpoints(self):
        source = (ROOT / "web/routers/auth.py").read_text(encoding="utf-8")
        ast.parse(source)
        self.assertIn('"/api/auth/max-login/start"', source)
        self.assertIn('"/api/auth/max-login/poll"', source)
        self.assertIn("secrets.token_hex(16)", source)
        self.assertIn("secrets.compare_digest", source)
        self.assertIn("status = 'consuming'", source)
        self.assertIn("_max_login_rate_check(request)", source)

    def test_max_bot_approves_only_active_one_time_requests(self):
        source = (ROOT / "main_max.py").read_text(encoding="utf-8")
        ast.parse(source)
        self.assertIn('text.startswith("/start login_")', source)
        self.assertIn("status = 'pending' AND expires >= ?", source)
        self.assertIn("is_blacklisted", source)
        self.assertIn("is_deleted", source)

    def test_experimental_button_does_not_replace_code_login(self):
        source = (ROOT / "frontend/src/pages/Login.jsx").read_text(encoding="utf-8")
        self.assertIn("Войти через MAX", source)
        self.assertIn("Тестовый режим", source)
        self.assertIn("/api/auth/max-login/start", source)
        self.assertIn("/api/auth/max-login/poll", source)
        self.assertIn("/api/auth/code", source)
        self.assertIn("/web", source)


if __name__ == "__main__":
    unittest.main()

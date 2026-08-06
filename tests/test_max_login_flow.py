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
        self.assertIn('"/api/auth/devices/register"', source)
        self.assertIn('delivery": "max_dm"', source)
        self.assertNotIn('"deep_link"', source)

    def test_max_bot_approves_only_active_one_time_requests(self):
        source = (ROOT / "main_max.py").read_text(encoding="utf-8")
        ast.parse(source)
        self.assertIn('payload.startswith("login_approve|")', source)
        self.assertIn('payload.startswith("login_deny|")', source)
        self.assertIn("user_id = ? AND status = 'pending'", source)
        self.assertIn("status = 'pending' AND expires >= ?", source)

    def test_passwordless_buttons_do_not_remove_code_fallback(self):
        source = (ROOT / "frontend/src/pages/Login.jsx").read_text(encoding="utf-8")
        self.assertIn("Войти по ключу доступа", source)
        self.assertIn("Подтвердить через MAX", source)
        self.assertIn("/api/auth/max-login/start", source)
        self.assertIn("/api/auth/max-login/poll", source)
        self.assertIn("/api/auth/code", source)
        self.assertIn("/web", source)

    def test_passkey_endpoints_require_verification_and_user_presence(self):
        router = (ROOT / "web/routers/auth.py").read_text(encoding="utf-8")
        service = (ROOT / "web/services/passkeys.py").read_text(encoding="utf-8")
        ast.parse(router)
        ast.parse(service)
        for endpoint in (
            "/api/auth/passkeys/register/options",
            "/api/auth/passkeys/register/verify",
            "/api/auth/passkeys/login/options",
            "/api/auth/passkeys/login/verify",
        ):
            self.assertIn(endpoint, router)
        self.assertIn("ResidentKeyRequirement.REQUIRED", service)
        self.assertIn("UserVerificationRequirement.REQUIRED", service)
        self.assertIn("require_user_verification=True", service)


if __name__ == "__main__":
    unittest.main()

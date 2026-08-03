import re
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
if str(WEB) not in sys.path:
    sys.path.insert(0, str(WEB))

from role_config import ASSIGNABLE_ROLES, AUTO_ROLE_PROTECTED, ROLE_NAMES_RU, can_change_role


class _RoleDbStub:
    def __init__(self, superadmin_count=2):
        self.superadmin_count = superadmin_count

    async def count_users_by_role(self, role):
        return self.superadmin_count if role == "superadmin" else 0


class RoleGuardrailTests(unittest.IsolatedAsyncioTestCase):
    async def test_superadmin_can_assign_every_canonical_role(self):
        actor = {"user_id": 1, "role": "superadmin"}
        for index, role in enumerate(sorted(ASSIGNABLE_ROLES), start=10):
            target = {"user_id": index, "role": "worker"}
            allowed, reason = await can_change_role(actor, target, role, _RoleDbStub())
            self.assertTrue(allowed, f"{role}: {reason}")

    async def test_hr_role_is_assignable_by_boss(self):
        allowed, reason = await can_change_role(
            {"user_id": 1, "role": "boss"},
            {"user_id": 2, "role": "moderator"},
            "hr",
            _RoleDbStub(),
        )
        self.assertTrue(allowed, reason)

    async def test_unknown_and_self_role_changes_are_rejected(self):
        actor = {"user_id": 1, "role": "superadmin"}
        allowed, _ = await can_change_role(
            actor, {"user_id": 2, "role": "worker"}, "accountant", _RoleDbStub()
        )
        self.assertFalse(allowed)
        allowed, _ = await can_change_role(
            actor, {"user_id": 1, "role": "worker"}, "hr", _RoleDbStub()
        )
        self.assertFalse(allowed)

    async def test_last_superadmin_cannot_be_demoted(self):
        allowed, _ = await can_change_role(
            {"user_id": 1, "role": "superadmin"},
            {"user_id": 2, "role": "superadmin"},
            "boss",
            _RoleDbStub(superadmin_count=1),
        )
        self.assertFalse(allowed)


class RoleCatalogTests(unittest.TestCase):
    def test_frontend_and_backend_role_catalogs_match(self):
        source = (ROOT / "frontend/src/utils/roleConfig.js").read_text(encoding="utf-8")
        match = re.search(r"ROLE_ORDER\s*=\s*\[([^\]]+)]", source)
        self.assertIsNotNone(match)
        frontend_roles = set(re.findall(r"['\"]([a-z]+)['\"]", match.group(1)))
        self.assertEqual(frontend_roles, set(ASSIGNABLE_ROLES))

    def test_all_roles_have_names_and_elevated_roles_are_protected(self):
        self.assertEqual(set(ROLE_NAMES_RU), set(ASSIGNABLE_ROLES))
        self.assertTrue({"brigadier", "hr", "moderator", "boss", "superadmin"} <= AUTO_ROLE_PROTECTED)


if __name__ == "__main__":
    unittest.main()

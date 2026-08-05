import ast
import os
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NotificationRoutingTest(unittest.TestCase):
    def test_generic_notifier_never_calls_shared_chat_sender(self):
        """Generic notifications stay personal after the MAX-only migration."""
        path = os.path.join(ROOT, "web", "services", "notifications.py")
        with open(path, "r", encoding="utf-8") as source_file:
            source = source_file.read()
        tree = ast.parse(source)

        notify_users = next(
            node for node in ast.walk(tree)
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "notify_users"
        )
        called_names = {
            node.func.id
            for node in ast.walk(notify_users)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        }
        self.assertNotIn("notify_group_chat", called_names)
        self.assertNotIn("report_group", source)

    def test_shared_chat_id_is_only_used_by_schedule_publishers(self):
        allowed = {
            os.path.join("web", "schedule_generator.py"),
            os.path.join("web", "services", "max_api.py"),
            os.path.join("web", "services", "publish_service.py"),
        }
        consumers = set()
        web_root = os.path.join(ROOT, "web")
        for directory, _, filenames in os.walk(web_root):
            for filename in filenames:
                if not filename.endswith(".py"):
                    continue
                path = os.path.join(directory, filename)
                with open(path, "r", encoding="utf-8") as source_file:
                    if "get_max_group_id" in source_file.read():
                        consumers.add(os.path.relpath(path, ROOT))
        self.assertEqual(allowed, consumers)


if __name__ == "__main__":
    unittest.main()

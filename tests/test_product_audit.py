import asyncio
import sqlite3
from pathlib import Path
import sys

import aiosqlite

ROOT = Path(__file__).parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "web")]

from database.db_manager import DatabaseManager
from services.product_audit import build_insights, normalize_event, sanitize
from web.routers import audit as audit_router


def test_sanitizer_redacts_secrets_but_keeps_diagnostic_shape():
    result = sanitize({"field": "hours", "value_length": 2, "password": "123456", "nested": {"authToken": "secret"}})
    assert result == {"field": "hours", "value_length": 2, "password": "[скрыто]", "nested": {"authToken": "[скрыто]"}}


def test_normalizer_ignores_client_identity_and_query_values():
    event = normalize_event(
        {"event_name": "api_failure", "route": "/api/apps/15?token=secret", "user_id": 999,
         "status_code": "422", "duration_ms": "51", "outcome": "rejected", "metadata": {"password": "bad"}},
        user={"user_id": 42, "fio": "Тест", "role": "foreman"}, session="abc",
    )
    assert event["user_id"] == 42
    assert event["route"] == "/api/apps/15"
    assert event["metadata"]["password"] == "[скрыто]"
    assert event["status_code"] == 422 and event["duration_ms"] == 51
    invitation = normalize_event({"event_name": "page_view", "page": "/driver-invite/VERY-SECRET-CODE"})
    assert invitation["page"] == "/driver-invite/[код]"


def test_insights_find_failures_latency_and_repeated_clicks():
    rows = [
        {"route": "/api/x", "outcome": "error", "duration_ms": 2100, "event_name": "http_request"},
        {"route": "/api/x", "outcome": "error", "duration_ms": 1900, "event_name": "http_request"},
        {"page": "/kp", "element": "button:Далее", "outcome": "rejected", "event_name": "rage_click"},
        {"page": "/kp", "element": "button:Далее", "outcome": "rejected", "event_name": "rage_click"},
    ]
    insights = build_insights(rows)
    assert {item["kind"] for item in insights} == {"failure", "performance", "usability"}


def test_schema_and_repository_batch_are_idempotent(tmp_path):
    async def scenario():
        path = tmp_path / "audit.db"
        conn = sqlite3.connect(path)
        conn.executescript((ROOT / "database" / "schema.sql").read_text(encoding="utf-8"))
        conn.close()
        db = DatabaseManager(str(path))
        async with db.isolated_connection():
            event = normalize_event({"event_uuid": "same", "event_name": "click", "element": "button:Сохранить"})
            await db.append_product_audit_events([event, event])
            async with db.conn.execute("SELECT COUNT(*),metadata_json,client_json FROM product_audit_events") as cur:
                row = await cur.fetchone()
            assert row[0] == 1 and row[1] == "{}" and row[2] == "{}"
    asyncio.run(scenario())


def test_summary_endpoint_builds_review_data(tmp_path):
    async def scenario():
        path = tmp_path / "summary.db"
        conn = sqlite3.connect(path)
        conn.executescript((ROOT / "database" / "schema.sql").read_text(encoding="utf-8"))
        conn.close()
        manager = DatabaseManager(str(path))
        manager.conn = await aiosqlite.connect(path)
        manager.conn.row_factory = aiosqlite.Row
        original = audit_router.db
        audit_router.db = manager
        try:
            events = [
                normalize_event({"event_name": "page_view", "category": "navigation", "page": "/kp"}, user={"user_id": 1, "fio": "Прораб", "role": "foreman"}),
                normalize_event({"event_name": "api_failure", "route": "/api/kp", "outcome": "error", "error_message": "500"}, user={"user_id": 1, "fio": "Прораб", "role": "foreman"}),
            ]
            await manager.append_product_audit_events(events)
            result = await audit_router.summary(days=7, current_user={"role": "superadmin"})
            assert result["totals"]["events"] == 2
            assert result["totals"]["users"] == 1
            assert result["top_pages"][0] == {"name": "/kp", "count": 1}
        finally:
            audit_router.db = original
            await manager.conn.close()
    asyncio.run(scenario())


def test_existing_business_log_is_mirrored_without_notification_text(tmp_path):
    async def scenario():
        path = tmp_path / "business.db"
        conn = sqlite3.connect(path)
        conn.executescript((ROOT / "database" / "schema.sql").read_text(encoding="utf-8"))
        conn.close()
        manager = DatabaseManager(str(path))
        manager.conn = await aiosqlite.connect(path)
        manager.conn.row_factory = aiosqlite.Row
        try:
            await manager.add_log(0, "Система", "Секретный текст уведомления", target_type="notification", details="полный текст")
            async with manager.conn.execute("SELECT category,event_name,element,metadata_json FROM product_audit_events") as cur:
                row = await cur.fetchone()
            assert tuple(row[:3]) == ("notification", "notification_delivery", "Уведомление отправлено")
            assert "Секретный текст" not in row[3] and "полный текст" not in row[3]
        finally:
            await manager.conn.close()
    asyncio.run(scenario())

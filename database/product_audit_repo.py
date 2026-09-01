"""Persistence helpers for the privacy-safe product diagnostics journal."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone


class ProductAuditRepoMixin:
    async def append_product_audit_events(self, events: list[dict], *, commit: bool = True) -> int:
        if not events:
            return 0
        columns = (
            "event_uuid", "occurred_at", "source", "category", "event_name", "outcome", "severity",
            "user_id", "user_fio", "user_role", "session_hash", "request_id", "page", "route",
            "method", "status_code", "duration_ms", "element", "target_type", "target_id",
            "error_type", "error_message", "metadata_json", "client_json", "app_version",
        )
        values = []
        for event in events:
            row = dict(event)
            row["metadata_json"] = json.dumps(row.pop("metadata", {}), ensure_ascii=False, separators=(",", ":"))
            row["client_json"] = json.dumps(row.pop("client", {}), ensure_ascii=False, separators=(",", ":"))
            values.append(tuple(row.get(column) for column in columns))
        marks = ",".join("?" for _ in columns)
        await self.conn.executemany(
            f"INSERT OR IGNORE INTO product_audit_events ({','.join(columns)}) VALUES ({marks})",
            values,
        )
        if commit:
            await self.conn.commit()
        return len(values)

    async def cleanup_product_audit(self, days: int, *, commit: bool = True) -> int:
        threshold = (datetime.now(timezone.utc) - timedelta(days=max(7, min(int(days), 730)))).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        cursor = await self.conn.execute("DELETE FROM product_audit_events WHERE occurred_at < ?", (threshold,))
        if commit:
            await self.conn.commit()
        return max(0, cursor.rowcount or 0)

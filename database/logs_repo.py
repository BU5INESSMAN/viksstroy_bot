from datetime import datetime, timezone
import uuid


class LogsRepoMixin:

    async def add_log(self, tg_id: int, fio: str, action: str, target_type: str = None,
                      target_id: int = None, details: str = None):
        """Добавляет запись в журнал действий.

        `details` (v2.4.1 FIX 2) — произвольный многострочный текст, раскрываемый
        в UI (например, полный список получателей уведомления).
        """
        cursor = await self.conn.execute(
            "INSERT INTO logs (tg_id, fio, action, timestamp, target_type, target_id, details) "
            "VALUES (?, ?, ?, datetime('now', 'localtime'), ?, ?, ?)",
            (tg_id, fio, action, target_type, target_id, details or '')
        )
        # Mirror existing semantic business logs into the product journal so a
        # periodic review can connect a UI click/API call with the actual
        # operation result. Notification bodies/details are deliberately not
        # copied: only the delivery fact and target category are retained.
        try:
            async with self.conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_audit_events'") as check:
                has_product_audit = await check.fetchone()
            if has_product_audit:
                user_role = ""
                if tg_id:
                    async with self.conn.execute("SELECT role FROM users WHERE user_id=?", (tg_id,)) as user_cursor:
                        user_row = await user_cursor.fetchone()
                    user_role = user_row[0] if user_row else ""
                is_error = any(word in str(action or "").lower() for word in ("ошибка", "error", "не удалось"))
                safe_action = "Уведомление отправлено" if target_type == "notification" else str(action or "")[:500]
                await self.append_product_audit_events([{
                    "event_uuid": str(uuid.uuid4()),
                    "occurred_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    "source": "server", "category": "notification" if target_type == "notification" else "business",
                    "event_name": "notification_delivery" if target_type == "notification" else "business_action",
                    "outcome": "error" if is_error else "success", "severity": "error" if is_error else "info",
                    "user_id": tg_id or None, "user_fio": fio or "", "user_role": user_role or "",
                    "element": safe_action, "target_type": target_type or "", "target_id": str(target_id or ""),
                    "metadata": {"legacy_log_id": cursor.lastrowid, "has_legacy_details": bool(details)}, "client": {},
                }], commit=False)
        except Exception:
            # The established business operation must never fail merely because
            # optional diagnostics are unavailable during a migration/recovery.
            pass
        await self.conn.commit()

    async def get_recent_logs(self, limit: int = 50):
        """Получает последние записи журнала"""
        async with self.conn.execute("SELECT * FROM logs ORDER BY id DESC LIMIT ?", (limit,)) as cursor:
            cols = [col[0] for col in cursor.description]
            return [dict(zip(cols, row)) for row in await cursor.fetchall()]

    async def cleanup_old_logs(self, days: int):
        """Удаляет логи старше указанного количества дней"""
        await self.conn.execute(
            "DELETE FROM logs WHERE timestamp < datetime('now', 'localtime', ? || ' days')",
            (f'-{days}',)
        )
        await self.conn.commit()

class LogsRepoMixin:

    async def add_log(self, tg_id: int, fio: str, action: str, target_type: str = None,
                      target_id: int = None, details: str = None):
        """Добавляет запись в журнал действий.

        `details` (v2.4.1 FIX 2) — произвольный многострочный текст, раскрываемый
        в UI (например, полный список получателей уведомления).
        """
        await self.conn.execute(
            "INSERT INTO logs (tg_id, fio, action, timestamp, target_type, target_id, details) "
            "VALUES (?, ?, ?, datetime('now', 'localtime'), ?, ?, ?)",
            (tg_id, fio, action, target_type, target_id, details or '')
        )
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

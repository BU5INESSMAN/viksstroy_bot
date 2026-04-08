class LogsRepoMixin:

    async def add_log(self, tg_id: int, fio: str, action: str):
        """Добавляет запись в журнал действий"""
        # Поправка времени: SQLite использует UTC, можно будет поправить на фронте
        await self.conn.execute(
            "INSERT INTO logs (tg_id, fio, action, timestamp) VALUES (?, ?, ?, datetime('now', 'localtime'))",
            (tg_id, fio, action)
        )
        await self.conn.commit()

    async def get_recent_logs(self, limit: int = 50):
        """Получает последние записи журнала"""
        async with self.conn.execute("SELECT * FROM logs ORDER BY id DESC LIMIT ?", (limit,)) as cursor:
            cols = [col[0] for col in cursor.description]
            return [dict(zip(cols, row)) for row in await cursor.fetchall()]

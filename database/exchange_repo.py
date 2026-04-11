from datetime import datetime, timedelta
import pytz

TZ_BARNAUL = pytz.timezone("Asia/Barnaul")


class ExchangeRepoMixin:

    async def create_exchange(self, requester_id, requester_app_id, donor_id, donor_app_id, requested_equip_id, offered_equip_id):
        now = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d %H:%M:%S")
        cursor = await self.conn.execute(
            """INSERT INTO equipment_exchanges
               (requester_id, requester_app_id, donor_id, donor_app_id, requested_equip_id, offered_equip_id, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (requester_id, requester_app_id, donor_id, donor_app_id, requested_equip_id, offered_equip_id, now)
        )
        await self.conn.commit()
        return cursor.lastrowid

    async def get_exchange(self, exchange_id):
        async with self.conn.execute("SELECT * FROM equipment_exchanges WHERE id = ?", (exchange_id,)) as cur:
            row = await cur.fetchone()
            if row:
                return dict(zip([c[0] for c in cur.description], row))
            return None

    async def get_pending_exchanges_for_equip(self, equip_id):
        async with self.conn.execute(
            "SELECT * FROM equipment_exchanges WHERE status = 'pending' AND (requested_equip_id = ? OR offered_equip_id = ?)",
            (equip_id, equip_id)
        ) as cur:
            rows = await cur.fetchall()
            return [dict(zip([c[0] for c in cur.description], r)) for r in rows]

    async def get_pending_exchanges_for_user(self, user_id):
        async with self.conn.execute(
            "SELECT * FROM equipment_exchanges WHERE status = 'pending' AND requester_id = ?",
            (user_id,)
        ) as cur:
            rows = await cur.fetchall()
            return [dict(zip([c[0] for c in cur.description], r)) for r in rows]

    async def resolve_exchange(self, exchange_id, new_status):
        now = datetime.now(TZ_BARNAUL).strftime("%Y-%m-%d %H:%M:%S")
        await self.conn.execute(
            "UPDATE equipment_exchanges SET status = ?, resolved_at = ? WHERE id = ?",
            (new_status, now, exchange_id)
        )
        await self.conn.commit()

    async def get_expired_exchanges(self, minutes=30):
        cutoff = (datetime.now(TZ_BARNAUL) - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
        async with self.conn.execute(
            "SELECT * FROM equipment_exchanges WHERE status = 'pending' AND created_at <= ?",
            (cutoff,)
        ) as cur:
            rows = await cur.fetchall()
            return [dict(zip([c[0] for c in cur.description], r)) for r in rows]

    async def is_equip_in_pending_exchange(self, equip_id):
        async with self.conn.execute(
            "SELECT COUNT(*) FROM equipment_exchanges WHERE status = 'pending' AND (requested_equip_id = ? OR offered_equip_id = ?)",
            (equip_id, equip_id)
        ) as cur:
            count = (await cur.fetchone())[0]
            return count > 0

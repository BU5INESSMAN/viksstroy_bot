import uuid
import random
import string
import secrets


class TeamsRepoMixin:

    async def create_empty_team(self, creator_id: int):
        cursor = await self.conn.execute("INSERT INTO teams (name, creator_id) VALUES (?, ?)",
                                         ("Новая бригада", creator_id))
        await self.conn.commit()
        return cursor.lastrowid

    async def update_team_name(self, team_id: int, new_name: str):
        await self.conn.execute("UPDATE teams SET name = ? WHERE id = ?", (new_name, team_id))
        await self.conn.commit()

    async def delete_team(self, team_id: int):
        await self.conn.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
        await self.conn.execute("DELETE FROM teams WHERE id = ?", (team_id,))
        await self.conn.commit()

    async def get_all_teams(self):
        async with self.conn.execute("SELECT * FROM teams") as cursor:
            return await cursor.fetchall()

    async def get_team(self, team_id: int):
        async with self.conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)) as cursor:
            return await cursor.fetchone()

    async def get_team_full_data(self, team_id: int):
        cursor = await self.conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,))
        team = await cursor.fetchone()
        cursor = await self.conn.execute("SELECT * FROM team_members WHERE team_id = ?", (team_id,))
        members = await cursor.fetchall()
        has_leader = any(m['is_leader'] == 1 or m['position'].lower() == 'бригадир' for m in members)
        return dict(team), [dict(m) for m in members], has_leader

    async def get_team_members(self, team_id: int):
        async with self.conn.execute("SELECT * FROM team_members WHERE team_id = ?", (team_id,)) as cursor:
            return await cursor.fetchall()

    async def add_team_member(self, team_id: int, fio: str, position: str, is_leader: int = 0):
        await self.conn.execute("INSERT INTO team_members (team_id, fio, position, is_leader) VALUES (?, ?, ?, ?)",
                                (team_id, fio, position, is_leader))
        await self.conn.commit()

    async def remove_team_member(self, member_id: int):
        await self.conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
        await self.conn.commit()

    async def get_or_create_team_invite(self, team_id: int):
        """Возвращает существующий код и пароль бригады или создает новые (статичные ссылки)"""
        async with self.conn.execute(
            "SELECT invite_code, join_password FROM teams WHERE id = ?", (team_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row[0] and row[1]:
                return row[0], row[1]

        # Generate only missing codes
        invite_code = row[0] if (row and row[0]) else str(uuid.uuid4())[:8]
        join_password = row[1] if (row and row[1]) else ''.join(random.choices(string.digits, k=6))

        await self.conn.execute(
            "UPDATE teams SET invite_code = ?, join_password = ? WHERE id = ?",
            (invite_code, join_password, team_id)
        )
        await self.conn.commit()
        return invite_code, join_password

    async def generate_team_invite(self, team_id: int):
        """Возвращает существующий код бригады или создает новый (статичные ссылки, не перегенерируются)"""
        return await self.get_or_create_team_invite(team_id)

    async def get_team_by_invite(self, invite_code: str):
        """Ищет бригаду по коду ссылки"""
        async with self.conn.execute("SELECT * FROM teams WHERE invite_code = ?", (invite_code,)) as cursor:
            return await cursor.fetchone()

    async def get_unclaimed_workers(self, team_id: int):
        """Получает список участников бригады, которые еще не привязали свой аккаунт"""
        async with self.conn.execute(
                "SELECT * FROM team_members WHERE team_id = ? AND (tg_id IS NULL OR tg_id = 0)",
                (team_id,)
        ) as cursor:
            # Возвращаем список словарей (id, fio, position)
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in await cursor.fetchall()]

    async def claim_worker_slot(self, worker_id: int, tg_id: int = None, is_web_only: bool = False):
        """Привязывает конкретного человека из списка к его аккаунту"""
        if is_web_only:
            # Если человек без ТГ зашел через сайт, ставим фейковый ID (например, отрицательный),
            # чтобы слот считался занятым, но бот не пытался писать ему в ТГ.
            tg_id = -worker_id

        await self.conn.execute("UPDATE team_members SET tg_id = ? WHERE id = ?", (tg_id, worker_id))
        await self.conn.commit()

    async def get_member(self, member_id: int):
        async with self.conn.execute("SELECT * FROM team_members WHERE id = ?", (member_id,)) as cursor:
            return await cursor.fetchone()

    async def update_member(self, member_id: int, fio: str = None, position: str = None):
        if fio: await self.conn.execute("UPDATE team_members SET fio = ? WHERE id = ?", (fio, member_id))
        if position: await self.conn.execute("UPDATE team_members SET position = ? WHERE id = ?", (position, member_id))
        await self.conn.commit()

    async def get_or_create_invite_code(self, member_id: int):
        async with self.conn.execute("SELECT invite_code FROM team_members WHERE id = ?", (member_id,)) as cursor:
            row = await cursor.fetchone()
            if row and row['invite_code']:
                return row['invite_code']

        new_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
        await self.conn.execute("UPDATE team_members SET invite_code = ? WHERE id = ?", (new_code, member_id))
        await self.conn.commit()
        return new_code

    async def get_member_by_invite(self, code: str):
        async with self.conn.execute("SELECT * FROM team_members WHERE invite_code = ?", (code,)) as cursor:
            return await cursor.fetchone()

    async def register_member_tg(self, member_id: int, tg_id: int):
        await self.conn.execute("UPDATE team_members SET tg_user_id = ? WHERE id = ?", (tg_id, member_id))
        await self.conn.commit()

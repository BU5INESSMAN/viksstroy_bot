class UsersRepoMixin:

    async def get_user(self, user_id: int):
        async with self.conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cursor:
            return await cursor.fetchone()

    async def add_user(self, user_id: int, fio: str, role: str):
        if not self.conn: await self.init_db()
        # Разбиваем ФИО на составляющие чтобы сохранить согласованность
        # денормализованного поля fio с last/first/middle_name
        parts = (fio or '').strip().split()
        last_name = parts[0] if len(parts) > 0 else ''
        first_name = parts[1] if len(parts) > 1 else ''
        middle_name = parts[2] if len(parts) > 2 else ''
        # Используем INSERT OR REPLACE, чтобы избежать ошибки UNIQUE constraint failed
        await self.conn.execute("""
            INSERT OR REPLACE INTO users (user_id, fio, last_name, first_name, middle_name, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        """, (user_id, fio, last_name, first_name, middle_name, role))
        await self.conn.commit()

    async def get_all_users(self):
        async with self.conn.execute("SELECT user_id, fio, role, is_active, is_blacklisted FROM users") as cursor:
            return await cursor.fetchall()

    async def update_user_role(self, user_id: int, new_role: str):
        await self.conn.execute("UPDATE users SET role = ? WHERE user_id = ?", (new_role, user_id))
        await self.conn.commit()

    async def toggle_user_status(self, user_id: int, blacklist: int):
        await self.conn.execute("UPDATE users SET is_blacklisted = ?, failed_attempts = 0 WHERE user_id = ?",
                                (blacklist, user_id))
        await self.conn.commit()

    async def increment_failed_attempts(self, user_id: int):
        await self.conn.execute("UPDATE users SET failed_attempts = failed_attempts + 1 WHERE user_id = ?", (user_id,))
        await self.conn.commit()

    async def get_user_full_profile(self, target_id: int):
        """Получает полную информацию для профиля пользователя (включая бригаду)"""
        async with self.conn.execute("SELECT * FROM users WHERE user_id = ?", (target_id,)) as cur:
            user_row = await cur.fetchone()
        if not user_row: return None
        user_cols = [col[0] for col in cur.description]
        user_data = dict(zip(user_cols, user_row))

        # Ищем, состоит ли он в бригаде
        async with self.conn.execute("""
                                     SELECT tm.id as member_id, tm.position, t.id as team_id, t.name as team_name
                                     FROM team_members tm
                                              JOIN teams t ON tm.team_id = t.id
                                     WHERE tm.tg_id = ?
                                     """, (target_id,)) as cur:
            team_row = await cur.fetchone()

        if team_row:
            user_data['team_id'] = team_row[2]
            user_data['team_name'] = team_row[3]
            user_data['position'] = team_row[1]
            user_data['member_id'] = team_row[0]
        else:
            user_data['team_id'] = None
            user_data['team_name'] = None
            user_data['position'] = None
            user_data['member_id'] = None

        return user_data

    async def update_user_profile_data(self, target_id: int, fio: str, role: str):
        """Обновляет ФИО и Роль в главной таблице.

        Также обновляет last_name/first_name/middle_name на основе fio,
        чтобы денормализованное поле fio оставалось в синхронизации с
        новыми полями (см. web/utils_fio.py).
        """
        parts = (fio or '').strip().split()
        last_name = parts[0] if len(parts) > 0 else ''
        first_name = parts[1] if len(parts) > 1 else ''
        middle_name = parts[2] if len(parts) > 2 else ''
        await self.conn.execute(
            "UPDATE users SET fio = ?, last_name = ?, first_name = ?, middle_name = ?, role = ? WHERE user_id = ?",
            (fio, last_name, first_name, middle_name, role, target_id),
        )
        await self.conn.execute("UPDATE team_members SET fio = ? WHERE tg_id = ?",
                                (fio, target_id))  # Синхронизируем ФИО в бригаде
        await self.conn.commit()

    async def count_users_by_role(self, role: str) -> int:
        """Возвращает количество активных (не в черном списке) пользователей с ролью."""
        async with self.conn.execute(
            "SELECT COUNT(*) FROM users WHERE role = ? AND is_blacklisted = 0",
            (role,),
        ) as cur:
            row = await cur.fetchone()
        return int(row[0]) if row else 0

    async def update_user_settings(self, user_id: int, settings_json: str) -> None:
        """Сохраняет JSON-настройки пользователя."""
        await self.conn.execute(
            "UPDATE users SET settings = ? WHERE user_id = ?",
            (settings_json, user_id),
        )
        await self.conn.commit()

    async def update_user_avatar(self, tg_id: int, avatar_url: str):
        """Обновляет аватарку пользователя"""
        await self.conn.execute("UPDATE users SET avatar_url = ? WHERE user_id = ?", (avatar_url, tg_id))
        await self.conn.commit()

    async def get_admins_and_moderators(self):
        async with self.conn.execute("SELECT user_id FROM users WHERE role IN ('superadmin', 'moderator')") as cursor:
            rows = await cursor.fetchall()
            return [row['user_id'] for row in rows]

    async def get_specific_user_logs(self, tg_id: int, limit: int = 20):
        """Получает логи конкретного пользователя"""
        async with self.conn.execute("SELECT * FROM logs WHERE tg_id = ? ORDER BY id DESC LIMIT ?",
                                     (tg_id, limit)) as cur:
            cols = [col[0] for col in cur.description]
            return [dict(zip(cols, row)) for row in await cur.fetchall()]

import aiosqlite
import os
import logging


class DatabaseManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None

    async def init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.conn = await aiosqlite.connect(self.db_path)
        self.conn.row_factory = aiosqlite.Row

        if os.path.exists("database/schema.sql"):
            with open("database/schema.sql", "r", encoding="utf-8") as f:
                schema = f.read()
                await self.conn.executescript(schema)
                await self.conn.commit()

        try:
            await self.conn.execute("ALTER TABLE equipment ADD COLUMN is_active INTEGER DEFAULT 1")
        except Exception:
            pass
        try:
            await self.conn.execute("ALTER TABLE equipment ADD COLUMN driver_fio TEXT DEFAULT 'Не указан'")
        except Exception:
            pass
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN foreman_id INTEGER")
        except Exception:
            pass
        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN creator_id INTEGER")
        except Exception:
            pass

        await self.conn.commit()
        logging.info("База данных успешно инициализирована и обновлена.")

    async def close(self):
        if self.conn:
            await self.conn.close()

    # --- Пользователи ---
    async def get_user(self, user_id: int):
        async with self.conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cursor:
            return await cursor.fetchone()

    async def add_user(self, user_id: int, fio: str, role: str):
        await self.conn.execute("INSERT INTO users (user_id, fio, role, is_active) VALUES (?, ?, ?, 1)",
                                (user_id, fio, role))
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

    # --- Бригады ---
    async def get_object_history(self, user_id: int):
        async with self.conn.execute(
                "SELECT DISTINCT object_address FROM applications WHERE foreman_id = ? ORDER BY id DESC LIMIT 5",
                (user_id,)) as cursor:
            return await cursor.fetchall()

    async def create_empty_team(self, creator_id: int):
        cursor = await self.conn.execute("INSERT INTO teams (name, creator_id) VALUES (?, ?)",
                                         ("Новая бригада", creator_id))
        await self.conn.commit()
        return cursor.lastrowid

    async def update_team_name(self, team_id: int, new_name: str):
        await self.conn.execute("UPDATE teams SET name = ? WHERE id = ?", (new_name, team_id))
        await self.conn.commit()

    async def get_all_teams(self):
        async with self.conn.execute("SELECT * FROM teams") as cursor:
            return await cursor.fetchall()

    async def get_team_full_data(self, team_id: int):
        cursor = await self.conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,))
        team = await cursor.fetchone()
        cursor = await self.conn.execute("SELECT * FROM team_members WHERE team_id = ?", (team_id,))
        members = await cursor.fetchall()
        has_leader = any(m['position'].lower() == 'бригадир' for m in members)
        return dict(team), [dict(m) for m in members], has_leader

    async def get_team(self, team_id: int):
        async with self.conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)) as cursor:
            return await cursor.fetchone()

    async def get_team_members(self, team_id: int):
        async with self.conn.execute("SELECT * FROM team_members WHERE team_id = ?", (team_id,)) as cursor:
            return await cursor.fetchall()

    async def add_team_member(self, team_id: int, fio: str, position: str):
        await self.conn.execute("INSERT INTO team_members (team_id, fio, position) VALUES (?, ?, ?)",
                                (team_id, fio, position))
        await self.conn.commit()

    async def remove_team_member(self, member_id: int):
        await self.conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
        await self.conn.commit()

    async def delete_team(self, team_id: int):
        await self.conn.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
        await self.conn.execute("DELETE FROM teams WHERE id = ?", (team_id,))
        await self.conn.commit()

    # --- Техника и логика времени ---
    async def get_equipment_categories(self):
        async with self.conn.execute("SELECT DISTINCT category FROM equipment WHERE is_active = 1") as cursor:
            rows = await cursor.fetchall()
            return [row['category'] for row in rows]

    async def get_equipment(self, equip_id: int):
        async with self.conn.execute("SELECT * FROM equipment WHERE id = ?", (equip_id,)) as cursor:
            return await cursor.fetchone()

    async def get_equipment_by_category(self, category: str):
        """Возвращает всю активную технику в категории (занятость проверяется на этапе выбора времени)"""
        async with self.conn.execute("SELECT * FROM equipment WHERE category = ? AND is_active = 1",
                                     (category,)) as cursor:
            items = await cursor.fetchall()
            return [dict(i) for i in items]

    async def get_equipment_busy_intervals(self, equip_id: int, date_target: str):
        """Возвращает список занятых интервалов (time_start, time_end) для машины на конкретную дату"""
        async with self.conn.execute(
                "SELECT time_start, time_end FROM applications WHERE equipment_id = ? AND date_target = ? AND status != 'rejected'",
                (equip_id, date_target)
        ) as cursor:
            rows = await cursor.fetchall()
            return [(r['time_start'], r['time_end']) for r in rows]

    # --- Админ (Техника) ---
    async def add_equipment(self, name, category, driver_fio="Не указан"):
        await self.conn.execute("INSERT INTO equipment (name, category, driver_fio, is_active) VALUES (?, ?, ?, ?)",
                                (name, category, driver_fio, 1))
        await self.conn.commit()

    async def toggle_equipment_status(self, equip_id: int, is_active: int):
        await self.conn.execute("UPDATE equipment SET is_active = ? WHERE id = ?", (is_active, equip_id))
        await self.conn.commit()

    async def get_all_equipment_admin(self):
        async with self.conn.execute("SELECT * FROM equipment") as cursor:
            return await cursor.fetchall()

    # --- Заявки ---
    async def save_application(self, data: dict, foreman_id: int):
        cursor = await self.conn.execute(
            """INSERT INTO applications 
            (foreman_id, object_address, team_id, date_target, equipment_id, time_start, time_end, comment, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
            (foreman_id, data['object_address'], data['team_id'], data['date_target'],
             data['equipment_id'], data['time_start'], data['time_end'], data.get('comment', ''))
        )
        app_id = cursor.lastrowid
        for m_id in data['selected_member_ids']:
            await self.conn.execute("INSERT INTO application_selected_staff (app_id, member_id) VALUES (?, ?)",
                                    (app_id, m_id))
        await self.conn.commit()
        return app_id

    async def get_application_details(self, app_id: int):
        cursor = await self.conn.execute(
            """SELECT a.*, t.name as team_name, e.name as equip_name, e.driver_fio, u.fio as foreman_name
               FROM applications a
               LEFT JOIN teams t ON a.team_id = t.id
               LEFT JOIN equipment e ON a.equipment_id = e.id
               LEFT JOIN users u ON a.foreman_id = u.user_id
               WHERE a.id = ?""", (app_id,)
        )
        app = await cursor.fetchone()
        if not app: return None

        cursor = await self.conn.execute(
            """SELECT tm.fio, tm.position FROM application_selected_staff ast 
               JOIN team_members tm ON ast.member_id = tm.id WHERE ast.app_id = ?""", (app_id,)
        )
        staff = await cursor.fetchall()
        return {"details": dict(app), "staff": [dict(s) for s in staff]}

    async def update_app_status(self, app_id: int, status: str, rejection_reason: str = None):
        if rejection_reason:
            await self.conn.execute("UPDATE applications SET status = ?, rejection_reason = ? WHERE id = ?",
                                    (status, rejection_reason, app_id))
        else:
            await self.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (status, app_id))
        await self.conn.commit()

    async def get_pending_applications(self):
        async with self.conn.execute("SELECT id, object_address FROM applications WHERE status = 'pending'") as cursor:
            return await cursor.fetchall()

    async def get_user_applications(self, user_id: int):
        async with self.conn.execute("SELECT * FROM applications WHERE foreman_id = ? ORDER BY id DESC LIMIT 10",
                                     (user_id,)) as cursor:
            return await cursor.fetchall()

    async def get_admins_and_moderators(self):
        async with self.conn.execute("SELECT user_id FROM users WHERE role IN ('admin', 'moderator')") as cursor:
            rows = await cursor.fetchall()
            return [row['user_id'] for row in rows]

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

        import secrets, string
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
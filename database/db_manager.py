import aiosqlite
import os
import logging
from datetime import datetime


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

        # Автоматические миграции
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
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN is_published INTEGER DEFAULT 0")
        except Exception:
            pass

        await self.conn.commit()
        logging.info("База данных успешно инициализирована.")

    async def close(self):
        if self.conn:
            await self.conn.close()

    # --- СТАТИСТИКА ДЛЯ МОДЕРАТОРОВ ---
    async def get_foremen_count(self):
        async with self.conn.execute("SELECT COUNT(*) FROM users WHERE role = 'foreman' AND is_active = 1") as cursor:
            return (await cursor.fetchone())[0]

    async def get_today_apps_count(self):
        async with self.conn.execute(
                "SELECT COUNT(DISTINCT foreman_id) FROM applications WHERE status != 'rejected' AND date(created_at) = date('now', 'localtime')") as cursor:
            return (await cursor.fetchone())[0]

    async def get_missing_foremen_today(self):
        async with self.conn.execute("""
            SELECT user_id, fio 
            FROM users 
            WHERE role = 'foreman' AND is_active = 1
            AND user_id NOT IN (
                SELECT DISTINCT foreman_id 
                FROM applications 
                WHERE date(created_at) = date('now', 'localtime')
            )
        """) as cursor:
            return await cursor.fetchall()

    async def get_app_members_with_tg(self, app_id: int):
        async with self.conn.execute("""
            SELECT tm.tg_user_id, tm.fio, tm.position 
            FROM application_selected_staff ast 
            JOIN team_members tm ON ast.member_id = tm.id 
            WHERE ast.app_id = ? AND tm.tg_user_id IS NOT NULL
        """, (app_id,)) as cursor:
            return await cursor.fetchall()

    # --- Публикация в группу ---
    async def get_approved_apps_for_publish(self):
        """Берет все одобренные заявки, которые еще не были опубликованы в группе (обрабатывает NULL)"""
        async with self.conn.execute(
                "SELECT id FROM applications WHERE status = 'approved' AND (is_published = 0 OR is_published IS NULL)") as cursor:
            return await cursor.fetchall()

    async def mark_app_as_published(self, app_id: int):
        await self.conn.execute("UPDATE applications SET is_published = 1 WHERE id = ?", (app_id,))
        await self.conn.commit()

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
        has_leader = any(m['is_leader'] == 1 or m['position'].lower() == 'бригадир' for m in members)
        return dict(team), [dict(m) for m in members], has_leader

    async def get_team(self, team_id: int):
        async with self.conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)) as cursor:
            return await cursor.fetchone()

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

    async def delete_team(self, team_id: int):
        await self.conn.execute("DELETE FROM team_members WHERE team_id = ?", (team_id,))
        await self.conn.execute("DELETE FROM teams WHERE id = ?", (team_id,))
        await self.conn.commit()

    # --- Техника ---
    async def get_equipment_categories(self):
        async with self.conn.execute("SELECT DISTINCT category FROM equipment WHERE is_active = 1") as cursor:
            rows = await cursor.fetchall()
            return [row['category'] for row in rows]

    async def get_equipment(self, equip_id: int):
        async with self.conn.execute("SELECT * FROM equipment WHERE id = ?", (equip_id,)) as cursor:
            return await cursor.fetchone()

    async def get_equipment_by_category(self, category: str):
        async with self.conn.execute("SELECT * FROM equipment WHERE category = ? AND is_active = 1",
                                     (category,)) as cursor:
            items = await cursor.fetchall()
            return [dict(i) for i in items]

    async def get_equipment_busy_intervals(self, equip_id: int, date_target: str):
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

    async def add_equipment_bulk(self, equipment_list: list):
        await self.conn.executemany(
            "INSERT INTO equipment (name, category, driver_fio, is_active) VALUES (?, ?, ?, ?)",
            equipment_list
        )
        await self.conn.commit()

    async def toggle_equipment_status(self, equip_id: int, is_active: int):
        await self.conn.execute("UPDATE equipment SET is_active = ? WHERE id = ?", (is_active, equip_id))
        await self.conn.commit()

    async def get_all_equipment_admin(self):
        async with self.conn.execute("SELECT * FROM equipment") as cursor:
            return await cursor.fetchall()

    # --- Заявки ---
    async def save_application(self, data: dict, foreman_id: int):
        app_id = data.get('edit_app_id')

        if app_id:
            await self.conn.execute(
                """UPDATE applications 
                SET object_address=?, team_id=?, date_target=?, equipment_id=?, time_start=?, time_end=?, comment=?, status='pending', rejection_reason=NULL 
                WHERE id=?""",
                (data['object_address'], data['team_id'], data['date_target'], data['equipment_id'], data['time_start'],
                 data['time_end'], data.get('comment', ''), app_id)
            )
            await self.conn.execute("DELETE FROM application_selected_staff WHERE app_id=?", (app_id,))
            new_app_id = app_id
        else:
            cursor = await self.conn.execute(
                """INSERT INTO applications 
                (foreman_id, object_address, team_id, date_target, equipment_id, time_start, time_end, comment, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                (foreman_id, data['object_address'], data['team_id'], data['date_target'], data['equipment_id'],
                 data['time_start'], data['time_end'], data.get('comment', ''))
            )
            new_app_id = cursor.lastrowid

        for m_id in data['selected_member_ids']:
            await self.conn.execute("INSERT INTO application_selected_staff (app_id, member_id) VALUES (?, ?)",
                                    (new_app_id, m_id))
        await self.conn.commit()
        return new_app_id

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
            """SELECT ast.member_id, tm.fio, tm.position FROM application_selected_staff ast 
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

    # --- РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ ТЕХНИКИ ---
    async def update_equipment(self, equip_id: int, name: str = None, category: str = None, driver_fio: str = None):
        if name: await self.conn.execute("UPDATE equipment SET name = ? WHERE id = ?", (name, equip_id))
        if category: await self.conn.execute("UPDATE equipment SET category = ? WHERE id = ?", (category, equip_id))
        if driver_fio: await self.conn.execute("UPDATE equipment SET driver_fio = ? WHERE id = ?",
                                               (driver_fio, equip_id))
        await self.conn.commit()

    async def delete_equipment(self, equip_id: int):
        await self.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
        await self.conn.commit()

    # --- СТАТИСТИКА ЗАЯВОК И ОТЧЕТЫ ---
    async def get_general_statistics(self):
        stats = {}
        async with self.conn.execute(
                "SELECT count(*) FROM applications WHERE date(created_at) = date('now', 'localtime')") as c:
            stats['today_total'] = (await c.fetchone())[0]
        async with self.conn.execute(
                "SELECT count(*) FROM applications WHERE date(created_at) = date('now', 'localtime') AND status = 'approved'") as c:
            stats['today_approved'] = (await c.fetchone())[0]
        async with self.conn.execute(
                "SELECT count(*) FROM applications WHERE date(created_at) = date('now', 'localtime') AND status = 'rejected'") as c:
            stats['today_rejected'] = (await c.fetchone())[0]
        async with self.conn.execute(
                "SELECT count(*) FROM applications WHERE status = 'approved' AND (is_published = 0 OR is_published IS NULL)") as c:
            stats['waiting_publish'] = (await c.fetchone())[0]
        async with self.conn.execute('''
            SELECT e.name, COUNT(a.id) as cnt 
            FROM applications a 
            JOIN equipment e ON a.equipment_id = e.id 
            WHERE a.status = 'approved' 
            GROUP BY e.id ORDER BY cnt DESC LIMIT 3
        ''') as c:
            stats['top_equip'] = await c.fetchall()
        async with self.conn.execute('''
            SELECT u.fio, COUNT(a.id) as cnt 
            FROM applications a 
            JOIN users u ON a.foreman_id = u.user_id 
            WHERE a.status = 'approved' 
            GROUP BY u.user_id ORDER BY cnt DESC LIMIT 3
        ''') as c:
            stats['top_foremen'] = await c.fetchall()
        return stats

    async def get_daily_report(self, date_target: str):
        cursor = await self.conn.execute(
            """SELECT a.*, u.fio as foreman_fio, e.name as equip_name, e.driver_fio
               FROM applications a
               LEFT JOIN users u ON a.foreman_id = u.user_id
               LEFT JOIN equipment e ON a.equipment_id = e.id
               WHERE a.date_target = ? AND a.status = 'approved'""",
            (date_target,)
        )
        apps = await cursor.fetchall()
        report = []
        for app in apps:
            c2 = await self.conn.execute(
                """SELECT tm.fio, tm.position FROM application_selected_staff ast
                   JOIN team_members tm ON ast.member_id = tm.id
                   WHERE ast.app_id = ?""", (app['id'],)
            )
            members = await c2.fetchall()
            member_strs = [f"{m['fio']} ({m['position']})" for m in members]
            report.append({
                'info': dict(app),
                'members': member_strs
            })
        return report
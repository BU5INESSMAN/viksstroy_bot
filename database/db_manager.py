import aiosqlite
import os
import logging
from datetime import datetime
import uuid
import random
import string


class DatabaseManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None

    async def init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        # Добавлен таймаут для защиты от database is locked
        self.conn = await aiosqlite.connect(self.db_path, timeout=30.0)
        self.conn.row_factory = aiosqlite.Row

        # Оптимизация конкурентного доступа к SQLite
        await self.conn.execute("PRAGMA journal_mode=WAL;")
        await self.conn.execute("PRAGMA synchronous=NORMAL;")
        await self.conn.execute("PRAGMA busy_timeout=30000;")
        await self.conn.commit()

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
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN is_published INTEGER DEFAULT 0")
        except Exception:
            pass

        try:
            await self.conn.execute("UPDATE users SET role = 'superadmin' WHERE role = 'admin'")
        except Exception:
            pass

        await self.conn.commit()
        logging.info("База данных успешно инициализирована.")

    async def close(self):
        if self.conn:
            await self.conn.close()

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

    async def get_approved_apps_for_publish(self):
        async with self.conn.execute(
                "SELECT id FROM applications WHERE status = 'approved' AND (is_published = 0 OR is_published IS NULL)") as cursor:
            return await cursor.fetchall()

    async def mark_app_as_published(self, app_id: int):
        await self.conn.execute("UPDATE applications SET is_published = 1 WHERE id = ?", (app_id,))
        await self.conn.commit()

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
        async with self.conn.execute("SELECT user_id FROM users WHERE role IN ('superadmin', 'moderator')") as cursor:
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

    async def update_equipment(self, equip_id: int, name: str = None, category: str = None, driver_fio: str = None):
        if name: await self.conn.execute("UPDATE equipment SET name = ? WHERE id = ?", (name, equip_id))
        if category: await self.conn.execute("UPDATE equipment SET category = ? WHERE id = ?", (category, equip_id))
        if driver_fio: await self.conn.execute("UPDATE equipment SET driver_fio = ? WHERE id = ?",
                                               (driver_fio, equip_id))
        await self.conn.commit()

    async def delete_equipment(self, equip_id: int):
        await self.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
        await self.conn.commit()

    async def get_general_statistics(self):
        stats = {}
        async with self.conn.execute("SELECT count(*) FROM applications WHERE date(created_at) = date('now', 'localtime')") as c:
            stats['today_total'] = (await c.fetchone())[0]
        async with self.conn.execute("SELECT count(*) FROM applications WHERE date(created_at) = date('now', 'localtime') AND status = 'approved'") as c:
            stats['today_approved'] = (await c.fetchone())[0]
        async with self.conn.execute("SELECT count(*) FROM applications WHERE date(created_at) = date('now', 'localtime') AND status = 'rejected'") as c:
            stats['today_rejected'] = (await c.fetchone())[0]
        async with self.conn.execute("SELECT count(*) FROM applications WHERE status = 'approved' AND (is_published = 0 OR is_published IS NULL)") as c:
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

    async def upgrade_db_for_invites(self):
        """Безопасное добавление новых колонок для логики инвайтов"""
        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN invite_code TEXT")
            await self.conn.execute("ALTER TABLE teams ADD COLUMN join_password TEXT")
        except Exception:
            pass  # Колонки уже существуют

        try:
            # Добавляем привязку к Telegram ID в таблицу участников бригады
            await self.conn.execute("ALTER TABLE team_members ADD COLUMN tg_id INTEGER")
        except Exception:
            pass

        await self.conn.commit()

    async def generate_team_invite(self, team_id: int):
        """Генерирует уникальную ссылку и 6-значный пароль для бригады"""
        invite_code = str(uuid.uuid4())[:8]  # Короткий уникальный код
        join_password = ''.join(random.choices(string.digits, k=6))

        await self.conn.execute(
            "UPDATE teams SET invite_code = ?, join_password = ? WHERE id = ?",
            (invite_code, join_password, team_id)
        )
        await self.conn.commit()
        return invite_code, join_password

    async def get_or_create_team_invite(self, team_id: int):
        """Возвращает существующий код бригады или создает новый (статичные ссылки)"""
        # Проверяем, есть ли уже код у этой бригады
        async with self.conn.execute("SELECT invite_code FROM teams WHERE id = ?", (team_id,)) as cursor:
            row = await cursor.fetchone()
            if row and row[0]:
                return row[0]  # Возвращаем старый код

        # Если кода нет - генерируем один раз и навсегда
        invite_code = str(uuid.uuid4())[:8]
        await self.conn.execute(
            "UPDATE teams SET invite_code = ? WHERE id = ?",
            (invite_code, team_id)
        )
        await self.conn.commit()
        return invite_code

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

    async def upgrade_db_for_logs(self):
        """Создает таблицу для ведения журнала действий (логов)"""
        await self.conn.execute("""
                                CREATE TABLE IF NOT EXISTS logs
                                (
                                    id
                                    INTEGER
                                    PRIMARY
                                    KEY
                                    AUTOINCREMENT,
                                    tg_id
                                    INTEGER,
                                    fio
                                    TEXT,
                                    action
                                    TEXT,
                                    timestamp
                                    DATETIME
                                    DEFAULT
                                    CURRENT_TIMESTAMP
                                )
                                """)
        await self.conn.commit()

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

    async def upgrade_db_for_profiles(self):
        """Добавляет поддержку аватарок в БД"""
        try:
            await self.conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        except Exception:
            pass  # Колонка уже есть
        await self.conn.commit()

    async def update_user_avatar(self, tg_id: int, avatar_url: str):
        """Обновляет аватарку пользователя"""
        await self.conn.execute("UPDATE users SET avatar_url = ? WHERE user_id = ?", (avatar_url, tg_id))
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

    async def get_specific_user_logs(self, tg_id: int, limit: int = 20):
        """Получает логи конкретного пользователя"""
        async with self.conn.execute("SELECT * FROM logs WHERE tg_id = ? ORDER BY id DESC LIMIT ?",
                                     (tg_id, limit)) as cur:
            cols = [col[0] for col in cur.description]
            return [dict(zip(cols, row)) for row in await cur.fetchall()]

    async def update_user_profile_data(self, target_id: int, fio: str, role: str):
        """Обновляет ФИО и Роль в главной таблице"""
        await self.conn.execute("UPDATE users SET fio = ?, role = ? WHERE user_id = ?", (fio, role, target_id))
        await self.conn.execute("UPDATE team_members SET fio = ? WHERE tg_id = ?",
                                (fio, target_id))  # Синхронизируем ФИО в бригаде
        await self.conn.commit()

    async def upgrade_db_for_foreman(self):
        """Добавляет колонку для статуса бригадира в таблице состава бригад"""
        try:
            await self.conn.execute("ALTER TABLE team_members ADD COLUMN is_foreman INTEGER DEFAULT 0")
        except Exception:
            pass  # Колонка уже существует
        await self.conn.commit()
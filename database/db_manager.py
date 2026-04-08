import aiosqlite
import os
import logging
from datetime import datetime
import pandas as pd

from database.users_repo import UsersRepoMixin
from database.teams_repo import TeamsRepoMixin
from database.equipment_repo import EquipmentRepoMixin
from database.apps_repo import AppsRepoMixin
from database.logs_repo import LogsRepoMixin
from database.objects_repo import ObjectsRepoMixin
from database.kp_repo import KpRepoMixin  # <-- ПОДКЛЮЧЕН НОВЫЙ МИКСИН


class DatabaseManager(UsersRepoMixin, TeamsRepoMixin, EquipmentRepoMixin, AppsRepoMixin, LogsRepoMixin,
                      ObjectsRepoMixin, KpRepoMixin):
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None

    async def init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.conn = await aiosqlite.connect(self.db_path, timeout=30.0)
        self.conn.row_factory = aiosqlite.Row

        await self.conn.execute("PRAGMA journal_mode=WAL;")
        await self.conn.execute("PRAGMA synchronous=NORMAL;")
        await self.conn.execute("PRAGMA busy_timeout=30000;")
        await self.conn.commit()

        if os.path.exists("database/schema.sql"):
            with open("database/schema.sql", "r", encoding="utf-8") as f:
                schema = f.read()
                await self.conn.executescript(schema)
                await self.conn.commit()

        # Автоматические миграции
        try:
            await self.conn.execute("ALTER TABLE equipment ADD COLUMN is_active INTEGER DEFAULT 1")
        except:
            pass
        try:
            await self.conn.execute("ALTER TABLE equipment ADD COLUMN driver_fio TEXT DEFAULT 'Не указан'")
        except:
            pass
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN foreman_id INTEGER")
        except:
            pass
        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN creator_id INTEGER")
        except:
            pass
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN is_published INTEGER DEFAULT 0")
        except:
            pass
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN object_id INTEGER")
        except:
            pass

        # --- НОВАЯ МИГРАЦИЯ ДЛЯ СТАТУСА КП ---
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN kp_status TEXT DEFAULT 'none'")
        except:
            pass

        try:
            await self.conn.execute("UPDATE users SET role = 'superadmin' WHERE role = 'admin'")
        except:
            pass

        await self.conn.commit()

        await self.upgrade_db_for_invites()
        await self.upgrade_db_for_logs()
        await self.upgrade_db_for_profiles()
        await self.upgrade_db_for_foreman()

        # Импорт КП
        await self.import_kp_from_csv("КП.xlsx - СМР.csv")

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
                                     WHERE role = 'foreman'
                                       AND is_active = 1
                                       AND user_id NOT IN (SELECT DISTINCT foreman_id
                                                           FROM applications
                                                           WHERE
                                         date (created_at) = date ('now'
                                         , 'localtime')
                                         )
                                     """) as cursor:
            return await cursor.fetchall()

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
        async with self.conn.execute('''SELECT e.name, COUNT(a.id) as cnt
                                        FROM applications a
                                                 JOIN equipment e ON a.equipment_id = e.id
                                        WHERE a.status = 'approved'
                                        GROUP BY e.id
                                        ORDER BY cnt DESC LIMIT 3''') as c:
            stats['top_equip'] = await c.fetchall()
        async with self.conn.execute('''SELECT u.fio, COUNT(a.id) as cnt
                                        FROM applications a
                                                 JOIN users u ON a.foreman_id = u.user_id
                                        WHERE a.status = 'approved'
                                        GROUP BY u.user_id
                                        ORDER BY cnt DESC LIMIT 3''') as c:
            stats['top_foremen'] = await c.fetchall()
        return stats

    async def upgrade_db_for_invites(self):
        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN invite_code TEXT")
        except:
            pass
        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN join_password TEXT")
        except:
            pass
        try:
            await self.conn.execute("ALTER TABLE team_members ADD COLUMN tg_id INTEGER")
        except:
            pass
        await self.conn.commit()

    async def upgrade_db_for_logs(self):
        await self.conn.execute("""CREATE TABLE IF NOT EXISTS logs
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
                                   )""")
        await self.conn.commit()

    async def upgrade_db_for_profiles(self):
        try:
            await self.conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        except:
            pass
        await self.conn.commit()

    async def upgrade_db_for_foreman(self):
        try:
            await self.conn.execute("ALTER TABLE team_members ADD COLUMN is_foreman INTEGER DEFAULT 0")
        except:
            pass
        await self.conn.commit()

    async def import_kp_from_csv(self, file_path: str):
        if not os.path.exists(file_path): return
        async with self.conn.execute("SELECT COUNT(*) FROM kp_catalog") as cur:
            if (await cur.fetchone())[0] > 0: return

        try:
            df = pd.read_csv(file_path, header=None, dtype=str).fillna("")
            current_category = "Без категории"
            for index, row in df.iterrows():
                if index < 2: continue
                col_coef = str(row[2]).strip()
                col_name = str(row[3]).strip()
                col_old = str(row[4]).strip()
                col_unit = str(row[5]).strip()
                col_zp = str(row[7]).strip()

                if col_name and not col_zp and not col_unit:
                    current_category = col_name
                    continue
                if col_name and col_zp and col_zp.replace('.', '', 1).isdigit():
                    salary = float(col_zp)
                    price = salary * 4
                    coef = float(col_coef) if col_coef.replace('.', '', 1).isdigit() else 0.0
                    old_salary = float(col_old) if col_old.replace('.', '', 1).isdigit() else salary
                    await self.conn.execute(
                        "INSERT INTO kp_catalog (category, name, unit, coefficient, salary, price, old_salary) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (current_category, col_name, col_unit, coef, salary, price, old_salary))
            await self.conn.commit()
            logging.info("Справочник КП успешно импортирован из CSV!")
        except Exception as e:
            logging.error(f"Ошибка парсинга CSV: {e}")
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
from database.kp_repo import KpRepoMixin
from database.exchange_repo import ExchangeRepoMixin


class DatabaseManager(UsersRepoMixin, TeamsRepoMixin, EquipmentRepoMixin, AppsRepoMixin, LogsRepoMixin, ObjectsRepoMixin, KpRepoMixin, ExchangeRepoMixin):
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
            await self.conn.execute("ALTER TABLE applications ADD COLUMN object_id INTEGER")
        except Exception:
            pass
        try:
            await self.conn.execute("ALTER TABLE applications ADD COLUMN kp_status TEXT DEFAULT 'none'")
        except Exception:
            pass

        try:
            await self.conn.execute("ALTER TABLE equipment ADD COLUMN license_plate TEXT DEFAULT ''")
        except Exception:
            pass

        try:
            await self.conn.execute("UPDATE users SET role = 'superadmin' WHERE role = 'admin'")
        except Exception:
            pass

        try:
            await self.conn.execute("ALTER TABLE object_kp_plan ADD COLUMN target_volume REAL DEFAULT 0")
        except Exception:
            pass

        await self.conn.commit()

        # Stage 2 migrations
        for col_stmt in [
            "ALTER TABLE applications ADD COLUMN completed_at TIMESTAMP",
            "ALTER TABLE applications ADD COLUMN is_archived INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN last_used_objects TEXT DEFAULT '[]'",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass
        await self.conn.commit()

        # Stage 3 migrations
        for col_stmt in [
            "ALTER TABLE objects ADD COLUMN pdf_file_path TEXT DEFAULT ''",
            "ALTER TABLE applications ADD COLUMN kp_archived INTEGER DEFAULT 0",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass
        await self.conn.commit()

        await self.upgrade_db_for_invites()
        await self.upgrade_db_for_logs()
        await self.upgrade_db_for_profiles()
        await self.upgrade_db_for_foreman()
        await self.upgrade_db_for_account_linking()
        await self.upgrade_db_for_log_columns()
        await self.upgrade_db_for_sessions()
        await self.upgrade_db_for_online_and_notifications()
        await self.migrate_estimate_pdfs_to_files()

        # Инициализация справочника из последнего доступного файла
        latest_file = self.get_latest_catalog_path()
        if latest_file:
            await self.import_kp_from_excel(latest_file)

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
        async with self.conn.execute('''
                                     SELECT e.name, COUNT(a.id) as cnt
                                     FROM applications a
                                              JOIN equipment e ON a.equipment_id = e.id
                                     WHERE a.status = 'approved'
                                     GROUP BY e.id
                                     ORDER BY cnt DESC LIMIT 3
                                     ''') as c:
            stats['top_equip'] = await c.fetchall()
        async with self.conn.execute('''
                                     SELECT u.fio, COUNT(a.id) as cnt
                                     FROM applications a
                                              JOIN users u ON a.foreman_id = u.user_id
                                     WHERE a.status = 'approved'
                                     GROUP BY u.user_id
                                     ORDER BY cnt DESC LIMIT 3
                                     ''') as c:
            stats['top_foremen'] = await c.fetchall()
        return stats

    async def upgrade_db_for_invites(self):
        """Безопасное добавление новых колонок для логики инвайтов"""
        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN invite_code TEXT")
        except Exception:
            pass

        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN join_password TEXT")
        except Exception:
            pass

        try:
            await self.conn.execute("ALTER TABLE team_members ADD COLUMN tg_id INTEGER")
        except Exception:
            pass

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

    async def upgrade_db_for_profiles(self):
        """Добавляет поддержку аватарок в БД"""
        try:
            await self.conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        except Exception:
            pass  # Колонка уже есть
        await self.conn.commit()

    async def upgrade_db_for_foreman(self):
        """Добавляет колонку для статуса бригадира в таблице состава бригад"""
        try:
            await self.conn.execute("ALTER TABLE team_members ADD COLUMN is_foreman INTEGER DEFAULT 0")
        except Exception:
            pass  # Колонка уже существует
        await self.conn.commit()

    async def upgrade_db_for_account_linking(self):
        """Stage 5B-1: Добавляет поля для связывания аккаунтов TG <-> MAX"""
        for col_stmt in [
            "ALTER TABLE users ADD COLUMN linked_user_id INTEGER DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass  # Колонка уже существует
        await self.conn.commit()

    async def upgrade_db_for_sessions(self):
        """Таблица браузерных сессий для persistent login."""
        try:
            await self.conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL
                )
            """)
            await self.conn.commit()
        except Exception:
            pass

    async def upgrade_db_for_log_columns(self):
        """Stage 6.9: Добавляет target_type/target_id в таблицу логов + настройку хранения"""
        for col_stmt in [
            "ALTER TABLE logs ADD COLUMN target_type TEXT DEFAULT NULL",
            "ALTER TABLE logs ADD COLUMN target_id INTEGER DEFAULT NULL",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass
        # Настройка хранения логов
        try:
            await self.conn.execute(
                "INSERT INTO settings (key, value) SELECT 'log_retention_days', '90' "
                "WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'log_retention_days')"
            )
        except Exception:
            pass
        await self.conn.commit()

    async def upgrade_db_for_online_and_notifications(self):
        """Online tracking (last_active) + notification center table + file metadata."""
        try:
            await self.conn.execute("ALTER TABLE users ADD COLUMN last_active TIMESTAMP DEFAULT NULL")
        except Exception:
            pass
        for col_stmt in [
            "ALTER TABLE object_files ADD COLUMN original_name TEXT DEFAULT ''",
            "ALTER TABLE object_files ADD COLUMN file_size INTEGER DEFAULT 0",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass

        await self.conn.execute("""
            CREATE TABLE IF NOT EXISTS user_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL DEFAULT 'info',
                title TEXT NOT NULL,
                body TEXT DEFAULT '',
                is_read INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                link_url TEXT DEFAULT NULL
            )
        """)
        await self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_notif_user
            ON user_notifications(user_id, is_read, created_at DESC)
        """)
        await self.conn.commit()

    async def migrate_estimate_pdfs_to_files(self):
        """One-time migration: copy existing objects.pdf_file_path into object_files table."""
        try:
            async with self.conn.execute(
                "SELECT id, pdf_file_path FROM objects WHERE pdf_file_path IS NOT NULL AND pdf_file_path != ''"
            ) as cur:
                rows = await cur.fetchall()
            for row in rows:
                obj_id = row[0]
                pdf_path = row[1]
                async with self.conn.execute(
                    "SELECT id FROM object_files WHERE object_id = ? AND file_path = ?", (obj_id, pdf_path)
                ) as c2:
                    if await c2.fetchone():
                        continue  # Already migrated
                size = 0
                try:
                    import os
                    real = os.path.join("data", pdf_path.lstrip("/"))
                    if os.path.exists(real):
                        size = os.path.getsize(real)
                except Exception:
                    pass
                await self.conn.execute(
                    "INSERT INTO object_files (object_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)",
                    (obj_id, pdf_path, "Смета КП", size)
                )
            await self.conn.commit()
        except Exception:
            pass
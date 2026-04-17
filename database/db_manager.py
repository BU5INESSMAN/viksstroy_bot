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
        await self.upgrade_db_for_user_fio_split()
        await self.upgrade_db_for_icon_settings()
        await self.migrate_icon_keys_to_tabler()
        await self.upgrade_db_for_smr_units()
        await self.upgrade_application_extra_works_unit()
        await self.upgrade_db_for_smr_wizard()
        await self.repair_catalog_units_if_numeric()
        await self.sync_worker_specialties()

        # Employee status columns on team_members
        for col_stmt in [
            "ALTER TABLE team_members ADD COLUMN status TEXT DEFAULT 'available'",
            "ALTER TABLE team_members ADD COLUMN status_from TEXT DEFAULT NULL",
            "ALTER TABLE team_members ADD COLUMN status_until TEXT DEFAULT NULL",
            "ALTER TABLE team_members ADD COLUMN status_reason TEXT DEFAULT ''",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass
        await self.conn.commit()

        # Push notification subscriptions
        await self.conn.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)
        """)
        await self.conn.commit()

        # Import catalog only when table is empty (first run).
        # Skipping re-import on restart preserves kp_catalog IDs that
        # object_kp_plan and application_kp depend on.
        async with self.conn.execute("SELECT COUNT(*) FROM kp_catalog") as cur:
            catalog_count = (await cur.fetchone())[0]
        if catalog_count == 0:
            latest_file = self.get_latest_catalog_path()
            if latest_file:
                await self.import_kp_from_excel(latest_file)

        # Repair orphaned object_kp_plan rows whose kp_id no longer
        # exists in kp_catalog (caused by previous DELETE+INSERT imports
        # that changed AUTOINCREMENT IDs).
        await self.repair_orphaned_kp_references()

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
        """Stage 6.9: Добавляет target_type/target_id в таблицу логов + настройку хранения.
        v2.4.1 FIX 2: добавляет details для раскрываемого списка получателей.
        """
        for col_stmt in [
            "ALTER TABLE logs ADD COLUMN target_type TEXT DEFAULT NULL",
            "ALTER TABLE logs ADD COLUMN target_id INTEGER DEFAULT NULL",
            "ALTER TABLE logs ADD COLUMN details TEXT DEFAULT ''",
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

    async def sync_worker_specialties(self):
        """v2.4 FIX 7: one-time backfill — for every worker/driver/brigadier
        whose users.specialty is empty, copy the position from their
        team_members row (joined via tg_user_id → users.user_id).
        Idempotent — only touches rows with empty specialty."""
        try:
            cur = await self.conn.execute("""
                UPDATE users SET specialty = (
                    SELECT tm.position FROM team_members tm
                    WHERE tm.tg_user_id = users.user_id
                      AND tm.position IS NOT NULL AND TRIM(tm.position) != ''
                    LIMIT 1
                )
                WHERE role IN ('worker','driver','brigadier')
                  AND (specialty IS NULL OR specialty = '')
                  AND EXISTS (
                    SELECT 1 FROM team_members tm
                    WHERE tm.tg_user_id = users.user_id
                      AND tm.position IS NOT NULL AND TRIM(tm.position) != ''
                  )
            """)
            n = cur.rowcount if cur.rowcount is not None else 0
            await self.conn.commit()
            if n:
                logging.info(f"Worker specialty sync: backfilled {n} users from team position")
        except Exception as e:
            logging.error(f"Worker specialty sync failed: {e}")

    async def upgrade_db_for_smr_units(self):
        """Stage 10 + v2.4.2 FIX 3: denormalize `unit` onto object_kp_plan +
        application_kp so that UI reads don't require a JOIN. Legacy rows
        keep their unit even if the catalog entry is later edited.
        Idempotent — backfill re-runs every startup so late fixes to the
        catalog propagate to plan rows that still have empty/junk values."""
        for col_stmt in [
            "ALTER TABLE object_kp_plan ADD COLUMN unit TEXT DEFAULT ''",
            "ALTER TABLE application_kp ADD COLUMN unit TEXT DEFAULT ''",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass
        await self.conn.commit()

        # v2.4.2 FIX 3: Excel parser used to stringify NaN → 'nan' which
        # leaked into kp_catalog.unit. Scrub those to '' so COALESCE in
        # subsequent queries behaves correctly, and so the backfill below
        # reads clean source values.
        try:
            cur = await self.conn.execute(
                "UPDATE kp_catalog SET unit = '' "
                "WHERE unit IS NOT NULL AND LOWER(TRIM(unit)) IN ('nan','none','null')"
            )
            n = cur.rowcount if cur.rowcount is not None else 0
            await self.conn.commit()
            if n:
                logging.info(f"SMR units migration: cleaned {n} junk unit values in kp_catalog")
        except Exception as e:
            logging.error(f"SMR units migration (kp_catalog cleanup) failed: {e}")

        # v2.4.2 FIX 3: same scrub on already-denormalized rows.
        for tbl in ('object_kp_plan', 'application_kp'):
            try:
                cur = await self.conn.execute(
                    f"UPDATE {tbl} SET unit = '' "
                    f"WHERE unit IS NOT NULL AND LOWER(TRIM(unit)) IN ('nan','none','null')"
                )
                n = cur.rowcount if cur.rowcount is not None else 0
                await self.conn.commit()
                if n:
                    logging.info(f"SMR units migration: cleaned {n} junk unit values in {tbl}")
            except Exception as e:
                logging.error(f"SMR units migration ({tbl} cleanup) failed: {e}")

        # Backfill object_kp_plan from kp_catalog via the kp_id FK.
        # v2.4.2 FIX 3: also re-backfill rows whose catalog entry was
        # previously empty but is now populated — the WHERE clause catches
        # any plan row that still has an empty unit.
        try:
            cur = await self.conn.execute(
                """UPDATE object_kp_plan
                   SET unit = COALESCE(
                       NULLIF(TRIM((SELECT kc.unit FROM kp_catalog kc WHERE kc.id = object_kp_plan.kp_id)), ''),
                       unit,
                       ''
                   )
                   WHERE (unit IS NULL OR TRIM(unit) = '')
                     AND kp_id IS NOT NULL"""
            )
            plan_n = cur.rowcount if cur.rowcount is not None else 0
            await self.conn.commit()
            if plan_n:
                logging.info(f"SMR units migration: backfilled {plan_n} rows in object_kp_plan")
        except Exception as e:
            logging.error(f"SMR units migration (object_kp_plan) failed: {e}")

        # Backfill application_kp the same way
        try:
            cur = await self.conn.execute(
                """UPDATE application_kp
                   SET unit = COALESCE(
                       NULLIF(TRIM((SELECT kc.unit FROM kp_catalog kc WHERE kc.id = application_kp.kp_id)), ''),
                       unit,
                       ''
                   )
                   WHERE (unit IS NULL OR TRIM(unit) = '')
                     AND kp_id IS NOT NULL"""
            )
            app_n = cur.rowcount if cur.rowcount is not None else 0
            await self.conn.commit()
            if app_n:
                logging.info(f"SMR units migration: backfilled {app_n} rows in application_kp")
        except Exception as e:
            logging.error(f"SMR units migration (application_kp) failed: {e}")

    async def upgrade_db_for_smr_wizard(self):
        """v2.4.5 SMR wizard: hours tracking + authorship + group linking.

        - application_hours: per-user hours inside an application.
        - application_kp: who filled which row, when.
        - application_extra_works: same authorship columns.
        - applications: smr_group_id + smr_status + smr_filled_by_role.
        All ALTER statements are idempotent via try/except on "duplicate
        column" errors.
        """
        try:
            await self.conn.execute("""
                CREATE TABLE IF NOT EXISTS application_hours (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    app_id INTEGER NOT NULL,
                    team_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    hours REAL DEFAULT 0,
                    filled_by_user_id INTEGER,
                    filled_at TEXT
                )
            """)
            await self.conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_app_hours_app ON application_hours(app_id)"
            )
            await self.conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_app_hours_unique "
                "ON application_hours(app_id, team_id, user_id)"
            )
        except Exception as e:
            logging.error(f"application_hours table creation failed: {e}")

        for stmt in (
            "ALTER TABLE application_kp ADD COLUMN filled_by_user_id INTEGER",
            "ALTER TABLE application_kp ADD COLUMN filled_at TEXT",
            "ALTER TABLE application_extra_works ADD COLUMN filled_by_user_id INTEGER",
            "ALTER TABLE application_extra_works ADD COLUMN filled_at TEXT",
            "ALTER TABLE applications ADD COLUMN smr_group_id TEXT",
            "ALTER TABLE applications ADD COLUMN smr_status TEXT DEFAULT ''",
            "ALTER TABLE applications ADD COLUMN smr_filled_by_role TEXT DEFAULT ''",
        ):
            try:
                await self.conn.execute(stmt)
            except Exception:
                pass
        await self.conn.commit()

    async def upgrade_application_extra_works_unit(self):
        """v2.4.3: extra works now pick from kp_catalog so each row needs a
        denormalized unit. Also switches the picker source, but existing
        rows carry their custom_name + unit forward unchanged."""
        try:
            await self.conn.execute(
                "ALTER TABLE application_extra_works ADD COLUMN unit TEXT DEFAULT ''"
            )
            await self.conn.commit()
        except Exception:
            pass

    async def repair_catalog_units_if_numeric(self):
        """v2.4.3: older parser read unit from col F (old_salary) instead of
        col G, so kp_catalog.unit is full of numeric values for affected
        installs. If ANY row has a numeric-looking unit, re-parse the last
        uploaded catalog file with the fixed parser. If no file is on
        disk, scrub the junk so the UI stops rendering numbers-as-units.
        """
        try:
            async with self.conn.execute(
                "SELECT COUNT(*) FROM kp_catalog WHERE unit GLOB '[0-9]*'"
            ) as cur:
                row = await cur.fetchone()
                bad_count = row[0] if row else 0
        except Exception:
            return

        if not bad_count:
            return

        logging.warning(
            f"kp_catalog: found {bad_count} rows with numeric unit values — "
            "attempting auto-repair from last uploaded catalog file"
        )

        # Try to re-import from the last uploaded Excel on disk.
        try:
            path = self.get_latest_catalog_path()
            if path and os.path.exists(path):
                # Clear bad units first so the UPSERT can overwrite them cleanly.
                await self.conn.execute(
                    "UPDATE kp_catalog SET unit = '' WHERE unit GLOB '[0-9]*'"
                )
                await self.conn.commit()
                ok = await self.import_kp_from_excel(path)
                if ok:
                    logging.info(
                        f"kp_catalog: auto-repaired from {os.path.basename(path)}"
                    )
                else:
                    logging.error(
                        "kp_catalog: re-import failed — units cleared but NOT re-populated"
                    )
            else:
                # No file on disk — at least scrub the junk.
                await self.conn.execute(
                    "UPDATE kp_catalog SET unit = '' WHERE unit GLOB '[0-9]*'"
                )
                await self.conn.commit()
                logging.warning(
                    "kp_catalog: no catalog file on disk — junk unit values cleared. "
                    "Admin must re-upload the catalog to restore unit strings."
                )
        except Exception as e:
            logging.error(f"kp_catalog auto-repair failed: {e}")
            return

        # Re-run unit backfill on object_kp_plan + application_kp so the
        # newly fixed catalog values propagate to plan and history rows.
        for tbl, id_col in (("object_kp_plan", "kp_id"), ("application_kp", "kp_id")):
            try:
                await self.conn.execute(
                    f"""UPDATE {tbl}
                        SET unit = (
                            SELECT kc.unit FROM kp_catalog kc
                            WHERE kc.id = {tbl}.{id_col}
                              AND kc.unit IS NOT NULL AND kc.unit != ''
                              AND kc.unit NOT GLOB '[0-9]*'
                        )
                        WHERE (unit IS NULL OR unit = '' OR unit GLOB '[0-9]*')
                          AND {id_col} IS NOT NULL"""
                )
                await self.conn.commit()
            except Exception as e:
                logging.error(f"{tbl} unit re-backfill failed: {e}")

    async def upgrade_db_for_icon_settings(self):
        """Stage 6: icon column on teams + equipment_category_settings table."""
        try:
            await self.conn.execute("ALTER TABLE teams ADD COLUMN icon TEXT DEFAULT NULL")
        except Exception:
            pass
        try:
            await self.conn.execute("""
                CREATE TABLE IF NOT EXISTS equipment_category_settings (
                    category TEXT PRIMARY KEY,
                    icon TEXT DEFAULT NULL
                )
            """)
        except Exception:
            pass
        await self.conn.commit()

    async def migrate_icon_keys_to_tabler(self):
        """v2.4.5: icon picker switched from lucide-react to @tabler/icons-react.
        Remap any lucide keys stored in teams.icon / equipment_category_settings.icon
        to their Tabler equivalents. Idempotent — UPDATE WHERE won't match already-
        migrated rows."""
        key_map = {
            'wrench':       'tool',
            'hardhat':      'helmet',
            'users':        'usersGroup',
            'usercheck':    'user',
            'usercog':      'user',
            'construction': 'building',
            'warehouse':    'building',
            'paintbucket':  'bucket',
            'pipette':      'droplet',
            'cog':          'settings',
            'zap':          'bolt',
            'fuel':         'gasStation',
            'weight':       'truck',
            'container':    'bucket',
            'pickaxe':      'shovel',
            'scissors':     'tool',
            'axe':          'hammer',
            'compass':      'ruler',
            'gauge':        'settings',
        }
        remapped = 0
        try:
            for old_key, new_key in key_map.items():
                for table in ('teams', 'equipment_category_settings'):
                    try:
                        cur = await self.conn.execute(
                            f"UPDATE {table} SET icon = ? WHERE icon = ?",
                            (new_key, old_key),
                        )
                        remapped += cur.rowcount or 0
                    except Exception:
                        pass
            await self.conn.commit()
            if remapped:
                logging.info(f"Icon keys migrated lucide → tabler: {remapped} rows updated")
        except Exception as e:
            logging.error(f"Icon key migration failed: {e}")

    async def upgrade_db_for_user_fio_split(self):
        """Stage 2: add last_name/first_name/middle_name/specialty/settings
        columns and one-time split existing fio values into the new fields.
        Idempotent — safe on every restart."""
        for col_stmt in [
            "ALTER TABLE users ADD COLUMN last_name TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN first_name TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN middle_name TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN specialty TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN settings TEXT DEFAULT '{}'",
        ]:
            try:
                await self.conn.execute(col_stmt)
            except Exception:
                pass
        await self.conn.commit()

        # One-time FIO split: runs only for rows where all three name parts
        # are empty AND fio is non-empty. Second run finds nothing → no-op.
        try:
            async with self.conn.execute(
                """SELECT user_id, fio FROM users
                   WHERE (last_name IS NULL OR last_name = '')
                     AND (first_name IS NULL OR first_name = '')
                     AND fio IS NOT NULL AND fio != ''"""
            ) as cur:
                rows = await cur.fetchall()

            count = 0
            for row in rows:
                uid = row[0]
                fio = (row[1] or '').strip()
                if not fio:
                    continue
                parts = fio.split()
                last_name = parts[0] if len(parts) > 0 else ''
                first_name = parts[1] if len(parts) > 1 else ''
                middle_name = parts[2] if len(parts) > 2 else ''
                await self.conn.execute(
                    "UPDATE users SET last_name = ?, first_name = ?, middle_name = ? WHERE user_id = ?",
                    (last_name, first_name, middle_name, uid),
                )
                count += 1
            await self.conn.commit()
            if count:
                logging.info(f"FIO migration: split {count} users into last/first/middle")
        except Exception as e:
            logging.error(f"FIO migration failed: {e}")

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

    async def repair_orphaned_kp_references(self):
        """Remap object_kp_plan and application_kp rows whose kp_id points to
        a deleted kp_catalog entry.  Previous imports used DELETE+INSERT with
        AUTOINCREMENT, shifting all IDs each restart.  This migration remaps
        orphaned references back to the current catalog by positional offset."""
        try:
            # Find orphaned object_kp_plan rows (kp_id not in kp_catalog)
            async with self.conn.execute("""
                SELECT okp.id, okp.kp_id
                FROM object_kp_plan okp
                LEFT JOIN kp_catalog k ON okp.kp_id = k.id
                WHERE k.id IS NULL
            """) as cur:
                orphaned_plan = await cur.fetchall()

            if not orphaned_plan:
                return  # Nothing to repair

            # Get current catalog entries in insertion order
            async with self.conn.execute("SELECT id FROM kp_catalog ORDER BY id") as cur:
                catalog_list = [row[0] for row in await cur.fetchall()]

            if not catalog_list:
                return

            # The catalog is always imported from the same file in the same
            # row order, so old_id and new_id differ by a fixed offset.
            # Infer offset: old IDs started at min(orphaned), current at catalog[0].
            orphaned_ids = {row[1] for row in orphaned_plan}
            min_orphan = min(orphaned_ids)
            current_first = catalog_list[0]
            current_count = len(catalog_list)

            # Build old_id -> new_id mapping
            id_remap = {}
            for i, new_id in enumerate(catalog_list):
                old_id = min_orphan + i
                if old_id in orphaned_ids:
                    id_remap[old_id] = new_id

            # Apply remap to object_kp_plan
            repaired = 0
            for row in orphaned_plan:
                plan_row_id, old_kp_id = row[0], row[1]
                new_kp_id = id_remap.get(old_kp_id)
                if new_kp_id:
                    # Guard against duplicates after remap
                    async with self.conn.execute(
                        "SELECT object_id FROM object_kp_plan WHERE id = ?", (plan_row_id,)
                    ) as c2:
                        obj_row = await c2.fetchone()
                    if obj_row:
                        async with self.conn.execute(
                            "SELECT id FROM object_kp_plan WHERE object_id = ? AND kp_id = ?",
                            (obj_row[0], new_kp_id)
                        ) as c3:
                            if await c3.fetchone():
                                await self.conn.execute(
                                    "DELETE FROM object_kp_plan WHERE id = ?", (plan_row_id,))
                                continue
                    await self.conn.execute(
                        "UPDATE object_kp_plan SET kp_id = ? WHERE id = ?",
                        (new_kp_id, plan_row_id))
                    repaired += 1
                else:
                    await self.conn.execute(
                        "DELETE FROM object_kp_plan WHERE id = ?", (plan_row_id,))

            # Also repair orphaned application_kp rows
            async with self.conn.execute("""
                SELECT akp.id, akp.kp_id
                FROM application_kp akp
                LEFT JOIN kp_catalog k ON akp.kp_id = k.id
                WHERE k.id IS NULL
            """) as cur:
                orphaned_akp = await cur.fetchall()

            for row in orphaned_akp:
                akp_row_id, old_kp_id = row[0], row[1]
                new_kp_id = id_remap.get(old_kp_id)
                if new_kp_id:
                    await self.conn.execute(
                        "UPDATE application_kp SET kp_id = ? WHERE id = ?",
                        (new_kp_id, akp_row_id))

            await self.conn.commit()
            if repaired:
                logging.info(f"Repaired {repaired} orphaned KP plan references")
        except Exception as e:
            logging.error(f"Error repairing KP references: {e}")
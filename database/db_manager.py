import aiosqlite
import os
import secrets
import string
import logging


class DatabaseManager:
    def __init__(self, db_path: str):
        self.db_path = db_path

    async def __aenter__(self):
        self.conn = await aiosqlite.connect(self.db_path)
        self.conn.row_factory = aiosqlite.Row
        return self.conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.conn.close()

    async def init_db(self):
        """Инициализация таблиц по схеме из файла schema.sql"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        async with self as db:
            with open("database/schema.sql", "r", encoding="utf-8") as f:
                schema = f.read()
                await db.executescript(schema)
                await db.commit()
            logging.info("База данных успешно инициализирована.")

    # --- БЛОК ПОЛЬЗОВАТЕЛЕЙ И БЕЗОПАСНОСТИ ---

    async def get_user(self, user_id: int):
        """Получение данных пользователя для проверки прав и бана"""
        async with self as db:
            async with db.execute(
                    "SELECT fio, role, is_active, is_blacklisted, failed_attempts FROM users WHERE user_id = ?",
                    (user_id,)
            ) as cursor:
                return await cursor.fetchone()

    async def increment_failed_attempts(self, user_id: int):
        """Система штрафов: инкремент попыток и авто-бан при 3+ ошибках"""
        async with self as db:
            await db.execute(
                "INSERT INTO users (user_id, failed_attempts) VALUES (?, 1) "
                "ON CONFLICT(user_id) DO UPDATE SET failed_attempts = failed_attempts + 1",
                (user_id,)
            )
            await db.execute(
                "UPDATE users SET is_blacklisted = 1 WHERE user_id = ? AND failed_attempts >= 3",
                (user_id,)
            )
            await db.commit()

    async def register_by_password(self, user_id: int, fio: str, role: str):
        """Регистрация через ввод пароля (для модераторов/прорабов)"""
        async with self as db:
            await db.execute(
                "INSERT INTO users (user_id, fio, role, is_active, failed_attempts) VALUES (?, ?, ?, 1, 0) "
                "ON CONFLICT(user_id) DO UPDATE SET fio=?, role=?, is_active=1, failed_attempts=0",
                (user_id, fio, role, fio, role)
            )
            await db.commit()

    async def check_invite_code(self, code: str):
        """Проверка 8-значного кода при входе по ссылке"""
        async with self as db:
            async with db.execute(
                    "SELECT id, fio, team_id, position FROM team_members WHERE invite_code = ? AND tg_user_id IS NULL",
                    (code,)
            ) as cursor:
                return await cursor.fetchone()

    async def activate_by_invite(self, user_id: int, invite_code: str):
        """Привязка Telegram аккаунта к записи сотрудника по коду"""
        async with self as db:
            async with db.execute("SELECT fio, position FROM team_members WHERE invite_code = ?",
                                  (invite_code,)) as cursor:
                row = await cursor.fetchone()
            if row:
                await db.execute("UPDATE team_members SET tg_user_id = ? WHERE invite_code = ?", (user_id, invite_code))
                await db.execute(
                    "INSERT INTO users (user_id, fio, role, is_active) VALUES (?, ?, 'foreman', 1) "
                    "ON CONFLICT(user_id) DO UPDATE SET is_active=1, fio=?",
                    (user_id, row['fio'], row['fio'])
                )
                await db.commit()

    # --- БЛОК УПРАВЛЕНИЯ БРИГАДАМИ ---

    async def get_all_teams(self):
        """Получение всех бригад (общий доступ для всех прорабов)"""
        async with self as db:
            async with db.execute("SELECT * FROM teams ORDER BY id DESC") as cursor:
                return await cursor.fetchall()

    async def create_empty_team(self, creator_id: int):
        """Первичное создание бригады с временным именем"""
        async with self as db:
            cursor = await db.execute("INSERT INTO teams (name, creator_id) VALUES (?, ?)",
                                      ("Временное название", creator_id))
            team_id = cursor.lastrowid
            default_name = f"Бригада №{team_id}"
            await db.execute("UPDATE teams SET name = ? WHERE id = ?", (default_name, team_id))
            await db.commit()
            return team_id

    async def update_team_name(self, team_id: int, new_name: str):
        """Ручное переименование бригады"""
        async with self as db:
            await db.execute("UPDATE teams SET name = ? WHERE id = ?", (new_name, team_id))
            await db.commit()

    async def add_team_member(self, team_id: int, fio: str, position: str, is_leader: bool = False):
        """Добавление участника и генерация 8-значного кода. Авто-имя бригады, если это лидер."""
        alphabet = string.ascii_letters + string.digits
        invite_code = ''.join(secrets.choice(alphabet) for _ in range(8))
        async with self as db:
            await db.execute(
                "INSERT INTO team_members (team_id, fio, position, invite_code, is_leader) VALUES (?, ?, ?, ?, ?)",
                (team_id, fio, position, invite_code, 1 if is_leader else 0)
            )
            if is_leader:
                await db.execute("UPDATE teams SET name = ? WHERE id = ?", (f"Бригада {fio}", team_id))
            await db.commit()

    async def get_team_full_data(self, team_id: int):
        """Сбор всей информации о составе для отображения в меню"""
        async with self as db:
            async with db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)) as c1:
                team_row = await c1.fetchone()
            async with db.execute("SELECT * FROM team_members WHERE team_id = ?", (team_id,)) as c2:
                members_rows = await c2.fetchall()
            has_leader = any(m['is_leader'] for m in members_rows)
            return team_row, members_rows, has_leader

    async def delete_member(self, member_id: int):
        """Удаление сотрудника из состава бригады"""
        async with self as db:
            await db.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
            await db.commit()

    async def get_member_invite_code(self, member_id: int):
        """Получение кода для генерации DeepLink ссылки"""
        async with self as db:
            async with db.execute("SELECT invite_code FROM team_members WHERE id = ?", (member_id,)) as cursor:
                row = await cursor.fetchone()
                return row['invite_code'] if row else None

    # --- БЛОК ЗАЯВОК ---

    async def get_object_history(self, foreman_id: int):
        """Выборка последних 5 уникальных адресов прораба"""
        async with self as db:
            async with db.execute(
                    "SELECT DISTINCT object_address FROM applications WHERE foreman_id = ? ORDER BY id DESC LIMIT 5",
                    (foreman_id,)
            ) as cursor:
                return await cursor.fetchall()

    async def get_equipment_categories(self):
        """Список уникальных категорий техники"""
        async with self as db:
            async with db.execute("SELECT DISTINCT category FROM equipment ORDER BY category") as cursor:
                return await cursor.fetchall()

    async def get_equipment_by_category(self, category: str):
        """Техника выбранной категории"""
        async with self as db:
            async with db.execute("SELECT * FROM equipment WHERE category = ?", (category,)) as cursor:
                return await cursor.fetchall()

    async def get_busy_equipment_ids(self, date_str: str):
        """ID техники, которая уже занята (статус не rejected) на указанную дату"""
        async with self as db:
            async with db.execute(
                    "SELECT equipment_id FROM applications WHERE date_target = ? AND status IN ('pending', 'approved')",
                    (date_str,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [r['equipment_id'] for r in rows]

    async def save_application(self, data: dict, foreman_id: int):
        """Сохранение заявки и привязка выбранного персонала через Many-to-Many"""
        async with self as db:
            async with db.execute(
                    """INSERT INTO applications
                       (foreman_id, object_address, team_id, equipment_id, date_target, time_start, time_end, comment,
                        status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                    (foreman_id, data['object_address'], data['team_id'],
                     data['equipment_id'], data['date_target'], data['time_start'], data['time_end'],
                     data.get('comment', ''))
            ) as cursor:
                app_id = cursor.lastrowid

            for m_id in data.get('selected_member_ids', []):
                await db.execute("INSERT INTO application_selected_staff (app_id, member_id) VALUES (?, ?)",
                                 (app_id, m_id))

            await db.commit()
            return app_id

    async def get_application_details(self, app_id: int):
        """Получение полных данных о заявке для карточки модератора"""
        async with self as db:
            query = """
                    SELECT a.*, u.fio as foreman_name, e.name as equip_name, e.driver_fio, t.name as team_name
                    FROM applications a
                             JOIN users u ON a.foreman_id = u.user_id
                             JOIN equipment e ON a.equipment_id = e.id
                             JOIN teams t ON a.team_id = t.id
                    WHERE a.id = ? \
                    """
            async with db.execute(query, (app_id,)) as cursor:
                app = await cursor.fetchone()

            if not app: return None

            # Получаем список ФИО сотрудников, выбранных в заявку
            member_query = """
                           SELECT tm.fio, tm.position
                           FROM application_selected_staff ass
                                    JOIN team_members tm ON ass.member_id = tm.id
                           WHERE ass.app_id = ? \
                           """
            async with db.execute(member_query, (app_id,)) as cursor:
                members = await cursor.fetchall()

            return {"details": app, "staff": members}

    async def update_app_status(self, app_id: int, status: str, reason: str = None):
        """Смена статуса заявки (approved/rejected)"""
        async with self as db:
            await db.execute(
                "UPDATE applications SET status = ?, rejection_reason = ? WHERE id = ?",
                (status, reason, app_id)
            )
            await db.commit()

    async def get_daily_report(self, date_str: str):
        """Сбор всех одобренных заявок на конкретную дату для группы"""
        async with self as db:
            # Получаем все одобренные заявки
            query = """
                    SELECT a.id, \
                           a.object_address, \
                           a.time_start, \
                           a.time_end, \
                           a.comment,
                           u.fio  as foreman_fio, \
                           e.name as equip_name, \
                           e.driver_fio
                    FROM applications a
                             JOIN users u ON a.foreman_id = u.user_id
                             JOIN equipment e ON a.equipment_id = e.id
                    WHERE a.date_target = ? \
                      AND a.status = 'approved' \
                    """
            async with db.execute(query, (date_str,)) as cursor:
                apps = await cursor.fetchall()

            report_data = []
            for app in apps:
                # Для каждой заявки достаем список людей
                m_query = """
                          SELECT tm.fio \
                          FROM application_selected_staff ass \
                                   JOIN team_members tm ON ass.member_id = tm.id
                          WHERE ass.app_id = ? \
                          """
                async with db.execute(m_query, (app['id'],)) as m_cursor:
                    members = await m_cursor.fetchall()
                    member_list = [m['fio'] for m in members]

                report_data.append({
                    "info": app,
                    "members": member_list
                })
            return report_data

    async def get_admins_and_moderators(self):
        """Возвращает список ID всех админов и модераторов для рассылки"""
        async with self as db:
            async with db.execute(
                    "SELECT user_id FROM users WHERE role IN ('admin', 'moderator') AND is_active = 1"
            ) as cursor:
                rows = await cursor.fetchall()
                return [row['user_id'] for row in rows]

    async def get_pending_applications(self):
        """Возвращает список всех заявок со статусом 'pending'"""
        async with self as db:
            query = """
                    SELECT a.id, a.object_address, a.date_target, u.fio as foreman_name
                    FROM applications a
                             JOIN users u ON a.foreman_id = u.user_id
                    WHERE a.status = 'pending'
                    ORDER BY a.created_at ASC \
                    """
            async with db.execute(query) as cursor:
                return await cursor.fetchall()

    async def get_all_users(self):
        """Возвращает полный список пользователей для админ-панели"""
        async with self as db:
            query = "SELECT user_id, fio, role, is_active, is_blacklisted FROM users"
            async with db.execute(query) as cursor:
                return await cursor.fetchall()

    async def toggle_user_status(self, user_id: int, blacklist: int):
        """Блокировка или разблокировка пользователя"""
        async with self as db:
            await db.execute(
                "UPDATE users SET is_blacklisted = ?, failed_attempts = 0 WHERE user_id = ?",
                (blacklist, user_id)
            )
            await db.commit()

    async def get_equipment_categories(self):
        """Получает список всех уникальных категорий техники"""
        async with self as db:
            async with db.execute("SELECT DISTINCT category FROM equipment") as cursor:
                rows = await cursor.fetchall()
                return [row['category'] for row in rows]

    async def add_equipment(self, name: str, category: str, driver_fio: str):
        """Добавляет новую единицу техники в базу данных"""
        async with self as db:
            await db.execute(
                "INSERT INTO equipment (name, category, driver_fio, is_available) VALUES (?, ?, ?, 1)",
                (name, category, driver_fio)
            )
            await db.commit()
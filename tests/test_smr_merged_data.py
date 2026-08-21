import asyncio
from unittest.mock import patch

import aiosqlite

from database.kp_repo import KpRepoMixin
from web.routers import kp


class _MergedRepo(KpRepoMixin):
    def __init__(self, conn):
        self.conn = conn


def test_payload_rows_are_partitioned_by_source_application():
    rows = [
        {'source_application_id': 235, 'kp_id': 1},
        {'source_application_id': 236, 'kp_id': 1},
        {'source_application_id': 999, 'kp_id': 2},
        {'kp_id': 3},
    ]
    grouped = kp._rows_by_source_application(rows, [235, 236])
    assert [row['kp_id'] for row in grouped[235]] == [1, 2, 3]
    assert [row['kp_id'] for row in grouped[236]] == [1]


def test_single_brigade_extra_work_is_saved_with_team_and_replaced_cleanly():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        await conn.executescript(
            """
            CREATE TABLE applications (id INTEGER PRIMARY KEY, team_id TEXT);
            CREATE TABLE kp_catalog (
                id INTEGER PRIMARY KEY, name TEXT, unit TEXT,
                salary REAL, price REAL
            );
            CREATE TABLE extra_works_catalog (
                id INTEGER PRIMARY KEY, name TEXT, unit TEXT,
                salary REAL, price REAL
            );
            CREATE TABLE application_extra_works (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                application_id INTEGER, extra_work_id INTEGER, kp_id INTEGER,
                custom_name TEXT, unit TEXT, volume REAL, salary REAL,
                price REAL, filled_by_user_id INTEGER, filled_at TEXT,
                team_id INTEGER, is_additional INTEGER DEFAULT 0
            );
            INSERT INTO applications VALUES (235, '5');
            INSERT INTO kp_catalog VALUES (10, 'Газорезка', 'ч', 100, 200);
            """
        )
        old_db = kp.db
        kp.db = type("Db", (), {"conn": conn})()
        try:
            for volume in (2, 3):
                await kp._save_extra_works_inline(
                    235,
                    [{"kp_id": 10, "volume": volume}],
                    100,
                    "foreman",
                    team_scope=(set(), True),
                )
            async with conn.execute(
                "SELECT team_id, volume FROM application_extra_works"
            ) as cur:
                rows = await cur.fetchall()
            assert [(row[0], row[1]) for row in rows] == [(5, 3.0)]
        finally:
            kp.db = old_db
            await conn.close()

    asyncio.run(scenario())


def test_merged_works_include_secondary_object_and_primary_saved_value():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        await conn.executescript(
            """
            CREATE TABLE applications (id INTEGER PRIMARY KEY, object_id INTEGER);
            CREATE TABLE object_kp_plan (object_id INTEGER, kp_id INTEGER);
            CREATE TABLE kp_catalog (
                id INTEGER PRIMARY KEY, category TEXT, name TEXT, unit TEXT,
                salary REAL, price REAL
            );
            CREATE TABLE application_kp (
                id INTEGER PRIMARY KEY, application_id INTEGER, kp_id INTEGER,
                volume REAL, current_salary REAL, current_price REAL,
                team_id INTEGER, filled_by_user_id INTEGER, filled_at TEXT,
                is_additional INTEGER DEFAULT 0
            );
            CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE users (user_id INTEGER PRIMARY KEY, fio TEXT, role TEXT);

            INSERT INTO applications VALUES (235, 30), (236, 34);
            INSERT INTO kp_catalog VALUES
                (145943, 'А', 'Работа первого объекта', 'м', 10, 20),
                (146084, 'Б', 'Работа второго объекта', 'м', 30, 40),
                (146085, 'Б', 'Незаполненная работа второго объекта', 'шт', 50, 60),
                (150000, 'В', 'Одинаковая работа двух объектов', 'м', 70, 80);
            INSERT INTO object_kp_plan VALUES
                (30, 145943), (34, 146084), (34, 146085),
                (30, 150000), (34, 150000), (34, 150000);
            INSERT INTO teams VALUES (5, 'Бригада 5');
            INSERT INTO users VALUES (100, 'Прораб', 'foreman');
            -- A work unique to object 34 is intentionally stored on the
            -- primary application 235, as the production merged writer does.
            INSERT INTO application_kp VALUES
                (1, 235, 145943, 1.5, 10, 20, 5, 100, '2026-08-10T10:00:00', 0),
                (2, 235, 146084, 12.4, 30, 40, 5, 100, '2026-08-10T10:01:00', 0),
                (3, 235, 150000, 2, 70, 80, 5, 100, '2026-08-10T10:02:00', 0),
                (4, 236, 150000, 3, 70, 80, 5, 100, '2026-08-10T10:03:00', 0);
            """
        )
        try:
            rows = await _MergedRepo(conn).get_group_kp_items([235, 236])
            by_id = {int(row['kp_id']): row for row in rows}
            assert set(by_id) == {145943, 146084, 146085, 150000}
            assert by_id[146084]['volume'] == 12.4
            assert by_id[146084]['team_id'] == 5
            assert by_id[146084]['filled_by_fio'] == 'Прораб'
            assert by_id[146085]['volume'] == 0
            shared = [row for row in rows if int(row['kp_id']) == 150000]
            assert [row['source_application_id'] for row in shared] == [235, 236]
            assert [row['volume'] for row in shared] == [2, 3]
        finally:
            await conn.close()

    asyncio.run(scenario())


class _HoursDb:
    def __init__(self, conn):
        self.conn = conn

    async def get_app_hours(self, _app_id):
        return []

    async def get_teams_for_app(self, app_id):
        base = {'id': 5, 'name': 'Бригада 5', 'icon': ''}
        if app_id == 1:
            return [{**base, 'members': [
                {'id': 17, 'fio': 'Бригадир', 'is_foreman': 1},
                {'id': 18, 'fio': 'Рабочий А', 'is_foreman': 0},
            ]}]
        return [{**base, 'members': [
            {'id': 19, 'fio': 'Рабочий Б', 'is_foreman': 0},
            {'id': 20, 'fio': 'Рабочий В', 'is_foreman': 0},
        ]}]


def test_merged_hours_keep_same_team_separate_by_source_application():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        await conn.executescript(
            """
            CREATE TABLE applications (
                id INTEGER PRIMARY KEY, date_target TEXT, smr_group_id TEXT
            );
            INSERT INTO applications VALUES
                (1, '2026-08-10', 'merged'),
                (2, '2026-08-10', 'merged');
            """
        )
        fake_db = _HoursDb(conn)
        try:
            with patch.object(kp, 'db', fake_db):
                result = await kp.get_app_hours(
                    1,
                    current_user={'tg_id': 100, 'role': 'foreman'},
                )
            assert len(result) == 2
            assert [section['source_application_id'] for section in result] == [1, 2]
            assert [section['team_id'] for section in result] == [5, 5]
            assert [member['member_id'] for member in result[0]['members']] == [17, 18]
            assert [member['member_id'] for member in result[1]['members']] == [19, 20]
        finally:
            await conn.close()

    asyncio.run(scenario())

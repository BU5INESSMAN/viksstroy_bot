import asyncio

import aiosqlite

from database.migrations.m_2026_09_employee_identities import run as run_migration
from web.services.employee_identity import employee_audit, identity_map, merge_identities


class _Db:
    def __init__(self, conn):
        self.conn = conn


def test_employee_registry_preserves_deleted_ids_and_merges_without_rewriting_hours():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        try:
            await conn.executescript(
                """
                CREATE TABLE users(user_id INTEGER PRIMARY KEY, fio TEXT);
                CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT);
                CREATE TABLE team_members(
                    id INTEGER PRIMARY KEY,team_id INTEGER,fio TEXT,position TEXT,tg_user_id INTEGER
                );
                CREATE TABLE application_hours(
                    id INTEGER PRIMARY KEY,app_id INTEGER,team_id INTEGER,user_id INTEGER,hours REAL
                );
                CREATE TABLE smr_team_sections(
                    id INTEGER PRIMARY KEY,app_id INTEGER,team_id INTEGER,roster_json TEXT
                );
                INSERT INTO users VALUES(-100,'Иванов Иван Иванович');
                INSERT INTO teams VALUES(1,'А'),(2,'Б');
                INSERT INTO team_members VALUES
                    (10,1,'Иванов Иван','Монтажник',-100),
                    (11,2,'Иванов Иван Иванович','Монтажник',-100),
                    (20,1,'Петров Пётр','Сварщик',NULL);
                INSERT INTO application_hours VALUES
                    (1,1,1,10,8),(2,2,2,11,4),(3,3,3,91,6),(4,4,4,99,5);
                INSERT INTO smr_team_sections VALUES
                    (1,3,3,'[{"member_id":91,"fio":"Сидоров Сергей Сергеевич","position":"Рабочий"}]');
                """
            )
            await run_migration(conn)
            async with conn.execute("SELECT COUNT(*) FROM employee_identities") as cursor:
                first_identity_count = int((await cursor.fetchone())[0])
            await run_migration(conn)
            async with conn.execute("SELECT COUNT(*) FROM employee_identities") as cursor:
                assert int((await cursor.fetchone())[0]) == first_identity_count
            db = _Db(conn)
            mapping = await identity_map(db, {10, 11, 91, 99})
            assert mapping[10]["identity_id"] == mapping[11]["identity_id"]
            assert mapping[91]["canonical_fio"] == "Сидоров Сергей Сергеевич"
            assert mapping[99]["status"] == "unresolved"

            audit = await employee_audit(db)
            assert audit["metrics"]["current_cards"] == 3
            assert audit["metrics"]["orphan_hour_rows"] == 2
            assert audit["metrics"]["unresolved"] == 1

            target = mapping[10]["identity_id"]
            source = mapping[91]["identity_id"]
            before = conn.total_changes
            result = await merge_identities(
                db,
                target_identity_id=target,
                source_identity_ids=[source],
                actor_id=-1,
            )
            assert result["merged_identity_ids"] == [source]
            remapped = await identity_map(db, {91})
            assert remapped[91]["identity_id"] == target
            async with conn.execute("SELECT COUNT(*) FROM application_hours") as cursor:
                assert (await cursor.fetchone())[0] == 4
            assert conn.total_changes > before
        finally:
            await conn.close()

    asyncio.run(scenario())

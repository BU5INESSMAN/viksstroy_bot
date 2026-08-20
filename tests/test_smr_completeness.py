import asyncio

import aiosqlite

from web.services.smr_completeness import get_smr_completeness


class _Db:
    def __init__(self, conn):
        self.conn = conn


def test_merged_report_is_complete_only_after_every_brigade_section_is_saved():
    async def scenario():
        conn = await aiosqlite.connect(":memory:")
        conn.row_factory = aiosqlite.Row
        await conn.executescript(
            """
            CREATE TABLE applications(
                id INTEGER PRIMARY KEY, smr_group_id TEXT,
                team_id TEXT, selected_members TEXT
            );
            CREATE TABLE team_members(id INTEGER PRIMARY KEY, team_id INTEGER);
            CREATE TABLE application_hours(
                id INTEGER PRIMARY KEY, app_id INTEGER, team_id INTEGER,
                user_id INTEGER, hours REAL, is_additional INTEGER DEFAULT 0
            );
            INSERT INTO applications VALUES
                (1,'merged','10,11','101,201'),
                (2,'merged','12','301');
            INSERT INTO team_members VALUES (101,10),(201,11),(301,12);
            INSERT INTO application_hours VALUES
                (1,1,10,101,8,0),
                (2,2,12,301,0,0);
            """
        )
        db = _Db(conn)
        try:
            incomplete = await get_smr_completeness(db, [1, 2])
            assert incomplete[1]["is_complete"] is False
            assert incomplete[2]["is_complete"] is False
            assert incomplete[1]["missing_sections"] == 1

            # Zero hours is an explicitly completed value, not an empty field.
            await conn.execute(
                "INSERT INTO application_hours VALUES (3,1,11,201,0,0)"
            )
            await conn.commit()
            complete = await get_smr_completeness(db, [1, 2])
            assert complete[1]["is_complete"] is True
            assert complete[2]["is_complete"] is True
            assert complete[1]["missing_sections"] == 0
        finally:
            await conn.close()

    asyncio.run(scenario())

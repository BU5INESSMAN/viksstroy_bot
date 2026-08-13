import importlib.util
import sqlite3
import sys
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook

from smr_data import get_smr_read_model


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "web") not in sys.path:
    sys.path.insert(0, str(ROOT / "web"))
spec = importlib.util.spec_from_file_location(
    "smr_report_merged_objects", ROOT / "web" / "services" / "smr_report.py"
)
smr_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smr_report)


class _Cursor:
    def __init__(self, cursor):
        self.cursor = cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        self.cursor.close()

    async def fetchone(self):
        return self.cursor.fetchone()

    async def fetchall(self):
        return self.cursor.fetchall()


class _Connection:
    def __init__(self):
        self.raw = sqlite3.connect(":memory:")
        self.raw.row_factory = sqlite3.Row

    def execute(self, sql, params=()):
        return _Cursor(self.raw.execute(sql, params))


def _database():
    conn = _Connection()
    conn.raw.executescript(
        """
        CREATE TABLE applications (
            id INTEGER PRIMARY KEY, public_number TEXT, date_target TEXT,
            foreman_name TEXT, object_id INTEGER, object_address TEXT,
            team_id TEXT, selected_members TEXT, smr_group_id TEXT
        );
        CREATE TABLE objects (id INTEGER PRIMARY KEY, name TEXT, address TEXT);
        CREATE TABLE object_kp_plan (object_id INTEGER, kp_id INTEGER);
        CREATE TABLE kp_catalog (id INTEGER PRIMARY KEY, category TEXT, name TEXT, unit TEXT);
        CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE users (user_id INTEGER PRIMARY KEY, fio TEXT, role TEXT);
        CREATE TABLE team_members (id INTEGER PRIMARY KEY, fio TEXT, position TEXT);
        CREATE TABLE extra_works_catalog (id INTEGER PRIMARY KEY, name TEXT, unit TEXT);
        CREATE TABLE application_kp (
            id INTEGER PRIMARY KEY, application_id INTEGER, kp_id INTEGER,
            volume REAL, unit TEXT, current_salary REAL, current_price REAL,
            team_id INTEGER, is_additional INTEGER, filled_at TEXT,
            filled_by_user_id INTEGER
        );
        CREATE TABLE application_extra_works (
            id INTEGER PRIMARY KEY, application_id INTEGER, kp_id INTEGER,
            extra_work_id INTEGER, custom_name TEXT, unit TEXT, volume REAL,
            salary REAL, price REAL, team_id INTEGER, is_additional INTEGER,
            filled_at TEXT, filled_by_user_id INTEGER
        );
        CREATE TABLE application_hours (
            id INTEGER PRIMARY KEY, app_id INTEGER, team_id INTEGER,
            user_id INTEGER, hours REAL, participant_salary REAL,
            is_additional INTEGER, filled_at TEXT, filled_by_user_id INTEGER
        );

        INSERT INTO objects VALUES
            (30, 'Ливневая канализация', 'Советской Армии, 83а'),
            (34, 'Водопровод', 'Советской Армии, 83а');
        INSERT INTO applications VALUES
            (235, 'З-100826-01', '2026-08-10', 'Прораб', 30, '', '5', '17,18', 'g'),
            (236, 'З-100826-02', '2026-08-10', 'Прораб', 34, '', '5', '19,20', 'g');
        INSERT INTO kp_catalog VALUES
            (145943, 'Прочее', 'Шурфление', 'м3'),
            (146084, 'Трубы', 'Протаскивание трубы', 'м');
        INSERT INTO object_kp_plan VALUES (30, 145943), (34, 146084);
        INSERT INTO teams VALUES (5, 'Бригада 5');
        INSERT INTO users VALUES (100, 'Прораб', 'foreman');
        INSERT INTO team_members VALUES
            (17, 'Рабочий первого объекта', 'Монтажник'),
            (19, 'Рабочий второго объекта', 'Монтажник');
        -- Consolidated merged storage: every row physically belongs to 235.
        INSERT INTO application_kp VALUES
            (1, 235, 145943, 1.5, 'м3', 10, 20, 5, 0, '2026-08-10', 100),
            (2, 235, 146084, 12.4, 'м', 30, 40, 5, 0, '2026-08-10', 100);
        INSERT INTO application_hours VALUES
            (1, 235, 5, 17, 8, 0, 0, '2026-08-10', 100),
            (2, 235, 5, 19, 7, 0, 0, '2026-08-10', 100);
        """
    )
    return type("Db", (), {"conn": conn})()


def test_read_model_attributes_people_and_works_to_their_objects():
    import asyncio

    async def scenario():
        report = await get_smr_read_model(_database(), 235)
        works = {row['kp_id']: row for row in report['plan_works']}
        hours = {row['member_id']: row for row in report['hours']}
        assert works[145943]['object_name'] == 'Ливневая канализация'
        assert works[146084]['object_name'] == 'Водопровод'
        assert hours[17]['object_name'] == 'Ливневая канализация'
        assert hours[19]['object_name'] == 'Водопровод'

    asyncio.run(scenario())


def test_excel_lists_both_objects_and_separates_rows():
    import asyncio

    async def scenario():
        blob, filename = await smr_report.generate_smr_excel_bytes(_database(), 235)
        workbook = load_workbook(BytesIO(blob), data_only=True)
        assert "Объекты" in workbook.sheetnames
        assert filename.startswith("Ливневая канализация + Водопровод")
        object_rows = {
            workbook['Объекты'].cell(row, 2).value
            for row in range(2, workbook['Объекты'].max_row + 1)
        }
        assert object_rows == {'Ливневая канализация', 'Водопровод'}
        work_rows = {
            workbook['Работы'].cell(row, 4).value: workbook['Работы'].cell(row, 1).value
            for row in range(2, workbook['Работы'].max_row + 1)
        }
        assert work_rows == {
            'Шурфление': 'Ливневая канализация',
            'Протаскивание трубы': 'Водопровод',
        }
        hour_rows = {
            workbook['Часы'].cell(row, 4).value: workbook['Часы'].cell(row, 1).value
            for row in range(2, workbook['Часы'].max_row + 1)
        }
        assert hour_rows == {
            'Рабочий первого объекта': 'Ливневая канализация',
            'Рабочий второго объекта': 'Водопровод',
        }

    asyncio.run(scenario())

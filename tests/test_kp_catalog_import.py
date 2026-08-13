import asyncio
from pathlib import Path

import aiosqlite
from openpyxl import Workbook

from database.kp_repo import KpRepoMixin


class _Repo(KpRepoMixin):
    def __init__(self, conn):
        self.conn = conn
        self.last_kp_import_report = {}


async def _repo():
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    await conn.executescript(
        """
        CREATE TABLE kp_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT, name TEXT, unit TEXT, coefficient REAL,
            salary REAL, price REAL, old_salary REAL
        );
        """
    )
    return _Repo(conn)


def _save_workbook(path: Path, rows: list[list], *, sheet_name='СМР') -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def test_import_reads_only_d_e_g_h_and_ignores_calculation_columns(tmp_path):
    async def scenario():
        path = tmp_path / 'catalog.xlsx'
        _save_workbook(path, [
            ['служебное A', 'служебное B', 'НЕ ЧИСЛО В C', None, None, 'служебное F', None, None, '=1+1'],
            [None, None, None, 'Наименование работ', 'Цена с НДС для КП', 'БЫЛО в ЗП', 'Ед. изм.', 'ЗП', 'Расчёт'],
            ['любое', 'любое', 'текст', 'Земляные работы', 'неважно', '#N/A', None, None, '=1/0'],
            ['формула', 'заметка', 'вообще не цена', 'Разработка грунта', '1 250,50 ₽', 'ошибка', 'м3', '375,15 руб.', '=E4*2'],
            ['ещё', None, '#VALUE!', 'Монтаж трубы', 800, 'не используется', 'м', 240, None],
        ])
        repo = await _repo()
        try:
            assert await repo.import_kp_from_excel(str(path)) is True
            async with repo.conn.execute(
                "SELECT category,name,unit,coefficient,salary,price,old_salary "
                "FROM kp_catalog ORDER BY id"
            ) as cur:
                rows = [tuple(row) for row in await cur.fetchall()]
            assert rows == [
                ('Земляные работы', 'Разработка грунта', 'м3', 0.0, 375.15, 1250.5, 375.15),
                ('Земляные работы', 'Монтаж трубы', 'м', 0.0, 240.0, 800.0, 240.0),
            ]
            assert repo.last_kp_import_report['columns'] == {
                'name': 'D', 'price': 'E', 'unit': 'G', 'salary': 'H',
            }
            assert repo.last_kp_import_report['header_row'] == 2
            assert repo.last_kp_import_report['price_source'].endswith('колонка E')
        finally:
            await repo.conn.close()

    asyncio.run(scenario())


def test_import_reports_only_authoritative_financial_columns(tmp_path):
    async def scenario():
        path = tmp_path / 'bad.xlsx'
        _save_workbook(path, [
            [None, None, None, 'Наименование работ', 'Цена СМР', None, 'Ед. измерения', 'Цена ЗП'],
            [None, None, 999, 'Работа', 'не число', 777, 'шт', 'тоже не число'],
        ])
        repo = await _repo()
        try:
            assert await repo.import_kp_from_excel(str(path)) is False
            message = ' '.join(repo.last_kp_import_report['errors'])
            assert 'цена СМР (E)' in message
            assert 'расценка ЗП (H)' in message
            assert 'цена (C)' not in message
            async with repo.conn.execute('SELECT COUNT(*) FROM kp_catalog') as cur:
                assert (await cur.fetchone())[0] == 0
        finally:
            await repo.conn.close()

    asyncio.run(scenario())


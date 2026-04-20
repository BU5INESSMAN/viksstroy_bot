import json
import pandas as pd
from io import BytesIO
import os
import glob
from datetime import datetime
import logging


class KpRepoMixin:

    async def get_kp_dashboard_apps(self, tg_id: int, role: str, team_ids: list):
        """Распределяет заявки по вкладкам в зависимости от роли"""
        query = """
                SELECT a.*, o.name as obj_name, u.fio as foreman_name
                FROM applications a
                         LEFT JOIN objects o ON a.object_id = o.id
                         LEFT JOIN users u ON a.foreman_id = u.user_id
                WHERE a.status IN ('published', 'in_progress', 'completed')
                  AND (a.kp_archived = 0 OR a.kp_archived IS NULL)
                ORDER BY a.date_target DESC \
                """
        async with self.conn.execute(query) as cur:
            all_apps = [dict(row) for row in await cur.fetchall()]

        result = {"to_fill": [], "pending_review": [], "approved": []}

        for app in all_apps:
            kp_status = app.get('kp_status') or 'none'
            app_teams = [int(x) for x in str(app['team_id']).split(',')] if app['team_id'] and str(
                app['team_id']) != '0' else []

            is_my_team = any(t in app_teams for t in team_ids)
            is_my_foreman = app['foreman_id'] == tg_id
            is_office = role in ['moderator', 'boss', 'superadmin']

            if kp_status in ['none', 'rejected'] and (is_my_team or is_my_foreman or is_office):
                result["to_fill"].append(app)
            if kp_status == 'submitted' and (is_my_foreman or is_office):
                result["pending_review"].append(app)
            if kp_status == 'approved' and (is_office or is_my_foreman):
                result["approved"].append(app)

        return result

    async def get_app_kp_items(self, app_id: int):
        """Получает план КП объекта и подклеивает уже введенные объемы"""
        async with self.conn.execute("SELECT object_id FROM applications WHERE id = ?", (app_id,)) as cur:
            row = await cur.fetchone()
            if not row or not row[0]: return []
            obj_id = row[0]

        query = """
                SELECT k.id                    as kp_id, \
                       k.category, \
                       k.name, \
                       k.unit, \
                       k.salary, \
                       k.price,
                       COALESCE(akp.volume, 0) as volume,
                       akp.current_salary      as saved_salary,
                       akp.current_price       as saved_price
                FROM object_kp_plan okp
                         JOIN kp_catalog k ON okp.kp_id = k.id
                         LEFT JOIN application_kp akp ON k.id = akp.kp_id AND akp.application_id = ?
                WHERE okp.object_id = ?
                ORDER BY k.category, k.id \
                """
        async with self.conn.execute(query, (app_id, obj_id)) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def submit_kp_report(self, app_id: int, items: list, role: str, filled_by_user_id: int | None = None):
        # v2.4.3: foreman sends only {kp_id, volume}. Unit, salary, and
        # price are looked up from kp_catalog server-side so the frontend
        # never needs pricing data and cannot spoof it.
        # v2.4.5 (wizard): `filled_by_user_id` is stored per row for the
        # "Заполнил" column in the Excel report.
        from datetime import datetime as _dt
        _now = _dt.now().isoformat(timespec='seconds')
        kp_ids = [int(i['kp_id']) for i in items if int(i.get('kp_id') or 0) > 0]
        lookup: dict[int, dict] = {}
        if kp_ids:
            pl = ",".join("?" * len(kp_ids))
            async with self.conn.execute(
                f"SELECT id, unit, salary, price FROM kp_catalog WHERE id IN ({pl})", kp_ids
            ) as cur:
                for r in await cur.fetchall():
                    lookup[int(r[0])] = {
                        'unit': (r[1] or '').strip(),
                        'salary': float(r[2]) if r[2] is not None else 0.0,
                        'price': float(r[3]) if r[3] is not None else 0.0,
                    }

        await self.conn.execute("DELETE FROM application_kp WHERE application_id = ?", (app_id,))
        for item in items:
            try:
                volume = float(item.get('volume') or 0)
            except (TypeError, ValueError):
                volume = 0.0
            if volume <= 0:
                continue
            kp_id = int(item.get('kp_id') or 0)
            if not kp_id:
                continue
            meta = lookup.get(kp_id, {'unit': '', 'salary': 0.0, 'price': 0.0})
            # Office roles may override salary/price when editing a submitted
            # report — accept them only if explicitly provided, otherwise use
            # the catalog values.
            salary = item.get('salary')
            price = item.get('price')
            if role in ('moderator', 'boss', 'superadmin') and salary is not None and price is not None:
                try:
                    salary = float(salary)
                    price = float(price)
                except (TypeError, ValueError):
                    salary = meta['salary']
                    price = meta['price']
            else:
                salary = meta['salary']
                price = meta['price']
            # v2.4.3 per-brigade: optional team_id tag so the Excel report
            # can show a «Бригада» column and analytics can aggregate
            # by team. NULL / 0 → common mode (shared across all teams).
            try:
                team_id_raw = item.get('team_id')
                team_id = int(team_id_raw) if team_id_raw else None
                if team_id == 0:
                    team_id = None
            except (TypeError, ValueError):
                team_id = None
            await self.conn.execute(
                """INSERT INTO application_kp
                   (application_id, kp_id, volume, unit, current_salary, current_price,
                    filled_by_user_id, filled_at, team_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (app_id, kp_id, volume, meta['unit'], salary, price, filled_by_user_id, _now, team_id),
            )

        new_status = 'approved' if role in ['foreman', 'moderator', 'boss', 'superadmin'] else 'submitted'
        await self.conn.execute("UPDATE applications SET kp_status = ? WHERE id = ?", (new_status, app_id))
        await self.conn.commit()

    async def review_kp_report(self, app_id: int, action: str):
        new_status = 'approved' if action == 'approve' else 'rejected'
        await self.conn.execute("UPDATE applications SET kp_status = ? WHERE id = ?", (new_status, app_id))
        await self.conn.commit()

    async def update_kp_volumes_only(self, app_id: int, items: list):
        for item in items:
            await self.conn.execute("""
                                    UPDATE application_kp
                                    SET volume = ?
                                    WHERE application_id = ?
                                      AND kp_id = ?
                                    """, (item['volume'], app_id, item['kp_id']))
        await self.conn.commit()

    # ==========================================
    # ИМПОРТ И ЭКСПОРТ EXCEL ПРАЙС-ЛИСТА
    # ==========================================

    def get_latest_catalog_path(self):
        """Находит последний загруженный файл в папке catalogs"""
        dir_path = "data/kp_catalogs"
        if not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
            return None

        files = glob.glob(os.path.join(dir_path, "KP_catalog_*.xlsx"))
        if not files:
            return "КП.xlsx - СМР.csv" if os.path.exists("КП.xlsx - СМР.csv") else None

        return max(files, key=os.path.getctime)

    async def save_catalog_file(self, content: bytes):
        """Сохраняет загруженный Excel с меткой времени"""
        dir_path = "data/kp_catalogs"
        os.makedirs(dir_path, exist_ok=True)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        new_path = os.path.join(dir_path, f"KP_catalog_{timestamp}.xlsx")

        with open(new_path, "wb") as f:
            f.write(content)
        return new_path

    async def import_kp_from_excel(self, file_path: str):
        """Универсальный парсер Excel/CSV для обновления базы КП.
        Uses UPSERT by (category, name) to preserve existing IDs —
        critical because object_kp_plan and application_kp reference kp_catalog.id."""
        try:
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path, header=None, dtype=str).fillna("")
            else:
                df = pd.read_excel(file_path, header=None, dtype=str).fillna("")

            # Build lookup of existing entries: (category, name) -> id
            existing = {}
            async with self.conn.execute("SELECT id, category, name FROM kp_catalog") as cur:
                for row in await cur.fetchall():
                    existing[(row[1], row[2])] = row[0]

            def _clean(v):
                """Return trimmed string for a pandas cell, with NaN/None → ''."""
                if v is None:
                    return ''
                try:
                    if pd.isna(v):
                        return ''
                except Exception:
                    pass
                s = str(v).strip()
                if s.lower() in ('nan', 'none', 'null'):
                    return ''
                return s

            # v2.4.3 Column mapping for sheet "СМР":
            #   A (0) = coefficient, B (1) = multiplier (unused),
            #   C (2) = base price,  D (3) = work name,
            #   E (4) = price w/VAT, F (5) = old salary,
            #   G (6) = unit (шт/м/м2/…), H (7) = new salary.
            # Category rows: value in D, no value in G. Work rows: both.
            def _num(s):
                if not s:
                    return None
                try:
                    return float(s.replace(',', '.'))
                except ValueError:
                    return None

            current_category = "Без категории"
            for index, row in df.iterrows():
                if index < 2: continue

                col_name = _clean(row[3])
                col_unit = _clean(row[6]) if len(row) > 6 else ''
                col_price = _clean(row[2])
                col_old_salary = _clean(row[5]) if len(row) > 5 else ''
                col_salary = _clean(row[7]) if len(row) > 7 else ''
                col_coef = _clean(row[0])

                # If the stray "nan"/"None" leaked in, _clean already
                # normalized to ''. Guard against numeric-looking unit
                # strings (defensive — the correct column should be text).
                if col_unit and col_unit.replace('.', '', 1).replace(',', '', 1).isdigit():
                    col_unit = ''

                # Category row: has a name but no unit.
                if col_name and not col_unit:
                    current_category = col_name
                    continue

                # Work row: must have name, unit, and a numeric salary.
                salary = _num(col_salary)
                if not col_name or not col_unit or salary is None:
                    continue

                price = _num(col_price)
                if price is None:
                    price = salary * 4  # fallback for rows missing base price
                coef = _num(col_coef) or 0.0
                old_salary = _num(col_old_salary)
                if old_salary is None:
                    old_salary = salary

                key = (current_category, col_name)
                if key in existing:
                    await self.conn.execute("""
                        UPDATE kp_catalog SET unit=?, coefficient=?, salary=?, price=?, old_salary=?
                        WHERE id=?
                        """, (col_unit, coef, salary, price, old_salary, existing[key]))
                else:
                    await self.conn.execute("""
                        INSERT INTO kp_catalog (category, name, unit, coefficient, salary, price, old_salary)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (current_category, col_name, col_unit, coef, salary, price, old_salary))

            await self.conn.commit()
            logging.info(f"Справочник КП обновлен из файла: {file_path}")
            return True
        except Exception as e:
            logging.error(f"Ошибка парсинга каталога: {e}")
            return False

    async def generate_mass_excel(self, app_ids: list):
        """Генерирует сводный Excel отчет по заявкам"""
        if not app_ids: return None
        pl = ','.join(['?'] * len(app_ids))
        async with self.conn.execute(
                f"SELECT a.id, a.date_target, o.name as obj_name, a.team_id FROM applications a LEFT JOIN objects o ON a.object_id = o.id WHERE a.id IN ({pl}) ORDER BY a.date_target ASC",
                app_ids) as cur:
            apps_data = [dict(row) for row in await cur.fetchall()]
        async with self.conn.execute("SELECT id, name FROM teams") as cur:
            teams_map = {row[0]: row[1] for row in await cur.fetchall()}
        async with self.conn.execute(
                f"SELECT akp.application_id, k.category, k.name as job_name, k.unit, akp.volume, akp.current_salary as salary, akp.current_price as price FROM application_kp akp JOIN kp_catalog k ON akp.kp_id = k.id WHERE akp.application_id IN ({pl}) AND akp.volume > 0 ORDER BY akp.application_id, k.category, k.name",
                app_ids) as cur:
            kp_data = [dict(row) for row in await cur.fetchall()]

        rows = []
        for app in apps_data:
            t_ids = [int(x) for x in str(app['team_id']).split(',')] if app['team_id'] and str(
                app['team_id']) != '0' else []
            t_names = ", ".join([teams_map.get(tid, f"Бригада {tid}") for tid in t_ids])
            rows.append(["", "", "", "", "", "", ""])
            rows.append([f"ЗАЯВКА №{app['id']}", f"Дата: {app['date_target']}", f"Объект: {app['obj_name']}",
                         f"Бригады: {t_names}", "", "", ""])
            rows.append(["Категория", "Работа", "Ед. изм.", "Объем", "ЗП (ед)", "Сумма ЗП", "Сумма Цена"])
            app_total_salary = 0
            app_total_price = 0
            for kp in [k for k in kp_data if k['application_id'] == app['id']]:
                sum_sal = float(kp['volume']) * float(kp['salary'])
                sum_pr = float(kp['volume']) * float(kp['price'])
                app_total_salary += sum_sal
                app_total_price += sum_pr
                rows.append([kp['category'], kp['job_name'], kp['unit'], kp['volume'], kp['salary'], sum_sal, sum_pr])
            rows.append(["", "", "", "", "ИТОГО ПО ЗАЯВКЕ:", app_total_salary, app_total_price])

        df = pd.DataFrame(rows)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, header=False, sheet_name='Отчет КП')
        output.seek(0)
        return output
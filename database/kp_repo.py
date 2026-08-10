import json
import pandas as pd
from io import BytesIO
import os
import glob
from datetime import datetime
import logging

from smr_calculations import decimal_value, money_value


def _team_scope_where(team_scope):
    """NULL-aware SQL fragment + params for a (concrete_team_ids,
    include_common) authoritative write scope, to be ANDed after
    ``application_id = ?``. An empty scope returns ('0', []) so the DELETE
    matches nothing (never a bare ``IN ()``). Mirror of
    web.routers.kp._team_scope_where (kept local so the DB layer needs no
    cross-package import)."""
    concrete, include_common = team_scope
    parts, params = [], []
    ids = sorted({int(t) for t in (concrete or set())})
    if ids:
        parts.append(f"team_id IN ({','.join('?' * len(ids))})")
        params.extend(ids)
    if include_common:
        parts.append("team_id IS NULL")
    if not parts:
        return "0", []
    return "(" + " OR ".join(parts) + ")", params


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
            is_office = role in ['moderator', 'boss', 'superadmin', 'hr']

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

        # v2.9: carry akp.team_id (NULL = common mode) and the brigade name so
        # the fill/review UI can render and edit each brigade's volume as a
        # separate row. The LEFT JOIN to application_kp legitimately produces
        # MULTIPLE rows per kp_id when several brigades filled the same work
        # ("По бригадам" / model (a)). Do NOT collapse or GROUP BY kp_id here —
        # an unfilled/common plan item still returns its single base row
        # (team_id NULL, volume 0) exactly as before.
        query = """
                SELECT k.id                    as kp_id,
                       k.category,
                       k.name,
                       k.unit,
                       k.salary,
                       k.price,
                       COALESCE(akp.volume, 0) as volume,
                       akp.current_salary      as saved_salary,
                       akp.current_price       as saved_price,
                       akp.team_id             as team_id,
                       t.name                  as team_name
                FROM object_kp_plan okp
                         JOIN kp_catalog k ON okp.kp_id = k.id
                         LEFT JOIN application_kp akp ON k.id = akp.kp_id AND akp.application_id = ?
                             AND COALESCE(akp.is_additional, 0) = 0
                         LEFT JOIN teams t ON t.id = akp.team_id
                WHERE okp.object_id = ?
                ORDER BY k.category, k.id, akp.team_id
                """
        async with self.conn.execute(query, (app_id, obj_id)) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def submit_kp_report(self, app_id: int, items: list, role: str, filled_by_user_id: int | None = None, team_scope=None, *, commit: bool = True):
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

        unknown_kp_ids = sorted(set(kp_ids) - set(lookup))
        if unknown_kp_ids:
            from smr_calculations import SmrNumberError
            raise SmrNumberError(
                "Работы отсутствуют в текущем справочнике: "
                + ", ".join(map(str, unknown_kp_ids))
            )

        # v2.10 (D2/D3): scope the DELETE to the caller's authoritative team
        # buckets so a submit that does not carry every brigade's rows no
        # longer wipes the others. team_scope=None preserves the legacy
        # blanket behaviour for the dead /api/kp/apps/{id}/submit path.
        # v2.10 доп.отчёт: AND is_additional = 0 so a MAIN re-submit NEVER
        # deletes addendum rows (they live alongside, is_additional=1).
        if team_scope is None:
            await self.conn.execute(
                "DELETE FROM application_kp WHERE application_id = ? AND is_additional = 0",
                (app_id,),
            )
        else:
            _clause, _sparams = _team_scope_where(team_scope)
            await self.conn.execute(
                f"DELETE FROM application_kp WHERE application_id = ? AND is_additional = 0 AND {_clause}",
                (app_id, *_sparams),
            )
        for item in items:
            volume = float(decimal_value(item.get('volume'), field='Объём работы'))
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
            if role in ('moderator', 'boss', 'superadmin', 'hr') and salary is not None and price is not None:
                try:
                    salary = float(money_value(salary, field='Расценка ЗП'))
                    price = float(money_value(price, field='Цена'))
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
                    filled_by_user_id, filled_at, team_id, is_additional)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                (app_id, kp_id, volume, meta['unit'], salary, price, filled_by_user_id, _now, team_id),
            )

        new_status = 'approved' if role in ['foreman', 'moderator', 'boss', 'superadmin', 'hr'] else 'submitted'
        await self.conn.execute("UPDATE applications SET kp_status = ? WHERE id = ?", (new_status, app_id))
        if commit:
            await self.conn.commit()

    async def review_kp_report(self, app_id: int, action: str):
        new_status = 'approved' if action == 'approve' else 'rejected'
        await self.conn.execute("UPDATE applications SET kp_status = ? WHERE id = ?", (new_status, app_id))
        await self.conn.commit()

    async def update_kp_volumes_only(self, app_id: int, items: list):
        # v2.9: target a SINGLE brigade's row. team_id is NULL for common-mode
        # rows, so we use `team_id IS ?` (NULL-safe) — a NULL target matches the
        # common row, a concrete team_id matches only that brigade's row.
        # Editing one brigade's volume no longer mutates every row sharing kp_id.
        for item in items:
            raw_team = item.get('team_id')
            try:
                team_id = int(raw_team) if raw_team not in (None, '', 0, '0') else None
            except (TypeError, ValueError):
                team_id = None
            await self.conn.execute("""
                                    UPDATE application_kp
                                    SET volume = ?
                                    WHERE application_id = ?
                                      AND kp_id = ?
                                      AND team_id IS ?
                                    """, (item['volume'], app_id, item['kp_id'], team_id))
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
                book = pd.ExcelFile(file_path)
                sheet = "СМР" if "СМР" in book.sheet_names else book.sheet_names[0]
                df = pd.read_excel(book, sheet_name=sheet, header=None, dtype=str).fillna("")

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
                    from decimal import Decimal
                    value = Decimal(s.replace('\xa0', '').replace(' ', '').replace(',', '.'))
                    if not value.is_finite() or value < 0:
                        return None
                    return float(value)
                except Exception:
                    return None

            current_category = "Без категории"
            parsed_rows = []
            validation_errors = []
            seen_keys = set()
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

                # A work-looking row must be complete. C is the customer
                # price, H is the salary rate; prices are never synthesized.
                salary = _num(col_salary)
                if not col_name or not col_unit:
                    continue

                price = _num(col_price)
                if salary is None or price is None:
                    validation_errors.append(
                        f"строка {index + 1} «{col_name}»: цена (C) и расценка ЗП (H) должны быть числами не меньше нуля"
                    )
                    continue
                coef = _num(col_coef) or 0.0
                old_salary = _num(col_old_salary)
                if old_salary is None:
                    old_salary = salary

                key = (current_category, col_name)
                if key in seen_keys:
                    validation_errors.append(
                        f"строка {index + 1}: работа «{col_name}» повторяется в категории «{current_category}»"
                    )
                    continue
                seen_keys.add(key)
                parsed_rows.append((key, col_unit, coef, salary, price, old_salary))

            if not parsed_rows:
                validation_errors.append("в файле не найдено ни одной корректной работы")
            if validation_errors:
                self.last_kp_import_report = {
                    "ok": False, "rows": 0, "errors": validation_errors[:20],
                    "price_source": "лист СМР, колонка C",
                    "salary_source": "лист СМР, колонка H",
                }
                logging.error("Ошибка проверки каталога: %s", "; ".join(validation_errors[:5]))
                return False

            await self.conn.execute("SAVEPOINT kp_catalog_import")
            for key, col_unit, coef, salary, price, old_salary in parsed_rows:
                if key in existing:
                    await self.conn.execute("""
                        UPDATE kp_catalog SET unit=?, coefficient=?, salary=?, price=?, old_salary=?
                        WHERE id=?
                        """, (col_unit, coef, salary, price, old_salary, existing[key]))
                else:
                    await self.conn.execute("""
                        INSERT INTO kp_catalog (category, name, unit, coefficient, salary, price, old_salary)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (key[0], key[1], col_unit, coef, salary, price, old_salary))

            await self.conn.execute("RELEASE SAVEPOINT kp_catalog_import")
            await self.conn.commit()
            self.last_kp_import_report = {
                "ok": True, "rows": len(parsed_rows), "errors": [],
                "price_source": "лист СМР, колонка C",
                "salary_source": "лист СМР, колонка H",
            }
            logging.info(f"Справочник КП обновлен из файла: {file_path}")
            return True
        except Exception as e:
            try:
                await self.conn.execute("ROLLBACK TO SAVEPOINT kp_catalog_import")
                await self.conn.execute("RELEASE SAVEPOINT kp_catalog_import")
            except Exception:
                pass
            self.last_kp_import_report = {"ok": False, "rows": 0, "errors": [str(e)]}
            logging.error(f"Ошибка парсинга каталога: {e}")
            return False

    async def generate_mass_excel(self, app_ids: list):
        """Canonical mass export including merged reports, addenda, extras and hours."""
        if not app_ids:
            return None
        from smr_data import get_smr_read_model

        headers = [
            "Заявка", "Дата", "Объект", "Тип", "Бригада", "Работа / сотрудник",
            "Ед. / специальность", "Объём / часы", "ЗП участника", "ЗП за ед.", "Сумма ЗП",
            "Цена за ед.", "Сумма цены", "Доп. отчёт",
        ]
        rows = [headers]
        seen_groups = set()
        for requested_id in sorted({int(x) for x in app_ids if int(x) > 0}):
            report = await get_smr_read_model(self, requested_id)
            logical_ids = tuple(report.get("application_ids") or [])
            if not logical_ids or logical_ids in seen_groups:
                continue
            seen_groups.add(logical_ids)
            primary_id = report["primary_application_id"]
            async with self.conn.execute(
                "SELECT a.date_target,COALESCE(o.name,a.object_address,'') "
                "FROM applications a LEFT JOIN objects o ON o.id=a.object_id WHERE a.id=?",
                (primary_id,),
            ) as cur:
                meta = await cur.fetchone()
            date_target = meta[0] if meta else ""
            object_name = meta[1] if meta else ""
            app_label = ", ".join(f"№{x}" for x in logical_ids)

            for item in report.get("plan_works", []):
                volume = float(item.get("volume") or 0)
                salary = float(item.get("current_salary") or 0)
                price = float(item.get("current_price") or 0)
                rows.append([app_label, date_target, object_name, "Работа", item.get("team_name") or "",
                             item.get("name") or "", item.get("unit") or "", volume, "", salary,
                             round(volume * salary, 2), price, round(volume * price, 2),
                             "Да" if item.get("is_additional") else "Нет"])
            for item in report.get("extra_works", []):
                volume = float(item.get("volume") or 0)
                salary = float(item.get("salary") or 0)
                price = float(item.get("price") or 0)
                rows.append([app_label, date_target, object_name, "Доп. работа", item.get("team_name") or "",
                             item.get("name") or "", item.get("unit") or "", volume, "", salary,
                             round(volume * salary, 2), price, round(volume * price, 2),
                             "Да" if item.get("is_additional") else "Нет"])
            for item in report.get("hours", []):
                rows.append([app_label, date_target, object_name, "Часы", item.get("team_name") or "",
                             item.get("fio") or "", item.get("specialty") or "", float(item.get("hours") or 0),
                             float(item.get("participant_salary") or 0), "", "", "", "",
                             "Да" if item.get("is_additional") else "Нет"])
            totals = report.get("totals", {})
            rows.append([app_label, date_target, object_name, "ИТОГО", "", "", "",
                         totals.get("hours", 0), totals.get("participant_salary", 0), "",
                         totals.get("salary", 0), "",
                         totals.get("price", 0), ""])

        if len(rows) == 1:
            return None
        df = pd.DataFrame(rows[1:], columns=rows[0])
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Свод СМР')
            ws = writer.book['Свод СМР']
            ws.freeze_panes = 'A2'
            ws.auto_filter.ref = ws.dimensions
        output.seek(0)
        return output

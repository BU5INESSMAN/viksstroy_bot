import json
import pandas as pd
from io import BytesIO


class KpRepoMixin:

    async def get_kp_dashboard_apps(self, tg_id: int, role: str, team_ids: list):
        """Распределяет заявки по вкладкам в зависимости от роли"""
        query = """
                SELECT a.*, o.name as obj_name, u.fio as foreman_name
                FROM applications a
                         LEFT JOIN objects o ON a.object_id = o.id
                         LEFT JOIN users u ON a.foreman_id = u.user_id
                WHERE a.status IN ('published', 'in_progress', 'completed')
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

            # 1. Вкладка "К заполнению" (Бригадир/Рабочий своей бригады, или Прораб своей заявки)
            if kp_status in ['none', 'rejected'] and (is_my_team or is_my_foreman):
                result["to_fill"].append(app)

            # 2. Вкладка "На проверку" (Прораб проверяет своих, Офис видит всё)
            if kp_status == 'submitted' and (is_my_foreman or is_office):
                result["pending_review"].append(app)

            # 3. Вкладка "Одобренные" (Офис для экспорта, Прораб для просмотра своих)
            if kp_status == 'approved' and (is_office or is_my_foreman):
                result["approved"].append(app)

        return result

    async def get_app_kp_items(self, app_id: int):
        """Получает план КП объекта и подклеивает уже введенные объемы (если есть)"""
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

    async def submit_kp_report(self, app_id: int, items: list, role: str):
        """Сохраняет объемы. Если заполняет офис или прораб - сразу одобрено"""
        await self.conn.execute("DELETE FROM application_kp WHERE application_id = ?", (app_id,))

        for item in items:
            if float(item['volume']) > 0:
                await self.conn.execute("""
                                        INSERT INTO application_kp (application_id, kp_id, volume, current_salary, current_price)
                                        VALUES (?, ?, ?, ?, ?)
                                        """, (app_id, item['kp_id'], item['volume'], item['salary'], item['price']))

        new_status = 'approved' if role in ['foreman', 'moderator', 'boss', 'superadmin'] else 'submitted'
        await self.conn.execute("UPDATE applications SET kp_status = ? WHERE id = ?", (new_status, app_id))
        await self.conn.commit()

    async def review_kp_report(self, app_id: int, action: str):
        """Прораб одобряет или отклоняет отчет"""
        new_status = 'approved' if action == 'approve' else 'rejected'
        await self.conn.execute("UPDATE applications SET kp_status = ? WHERE id = ?", (new_status, app_id))
        await self.conn.commit()

    async def update_kp_volumes_only(self, app_id: int, items: list):
        """Офис редактирует цифры в уже одобренном отчете"""
        for item in items:
            await self.conn.execute("""
                                    UPDATE application_kp
                                    SET volume = ?
                                    WHERE application_id = ?
                                      AND kp_id = ?
                                    """, (item['volume'], app_id, item['kp_id']))
        await self.conn.commit()

    async def generate_mass_excel(self, app_ids: list):
        """Генерирует Excel файл с разделением по заявкам"""
        if not app_ids: return None

        pl = ','.join(['?'] * len(app_ids))

        # Получаем данные заявок
        apps_query = f"""
            SELECT a.id, a.date_target, o.name as obj_name, a.team_id
            FROM applications a
            LEFT JOIN objects o ON a.object_id = o.id
            WHERE a.id IN ({pl})
            ORDER BY a.date_target ASC
        """
        async with self.conn.execute(apps_query, app_ids) as cur:
            apps_data = [dict(row) for row in await cur.fetchall()]

        # Получаем названия бригад для расшифровки
        async with self.conn.execute("SELECT id, name FROM teams") as cur:
            teams_map = {row[0]: row[1] for row in await cur.fetchall()}

        # Получаем сами работы
        kp_query = f"""
            SELECT akp.application_id, k.category, k.name as job_name, k.unit, 
                   akp.volume, akp.current_salary as salary, akp.current_price as price
            FROM application_kp akp
            JOIN kp_catalog k ON akp.kp_id = k.id
            WHERE akp.application_id IN ({pl}) AND akp.volume > 0
            ORDER BY akp.application_id, k.category, k.name
        """
        async with self.conn.execute(kp_query, app_ids) as cur:
            kp_data = [dict(row) for row in await cur.fetchall()]

        # Формируем структуру для Pandas
        rows = []
        for app in apps_data:
            # Расшифровываем бригады
            t_ids = [int(x) for x in str(app['team_id']).split(',')] if app['team_id'] and str(
                app['team_id']) != '0' else []
            t_names = ", ".join([teams_map.get(tid, f"Бригада {tid}") for tid in t_ids])

            # Заголовок заявки
            rows.append(["", "", "", "", "", "", ""])
            rows.append([f"ЗАЯВКА №{app['id']}", f"Дата: {app['date_target']}", f"Объект: {app['obj_name']}",
                         f"Бригады: {t_names}", "", "", ""])
            rows.append(["Категория", "Работа", "Ед. изм.", "Объем", "ЗП (ед)", "Сумма ЗП", "Сумма Цена"])

            app_total_salary = 0
            app_total_price = 0

            # Данные работ по заявке
            app_kps = [k for k in kp_data if k['application_id'] == app['id']]
            for kp in app_kps:
                sum_sal = float(kp['volume']) * float(kp['salary'])
                sum_pr = float(kp['volume']) * float(kp['price'])
                app_total_salary += sum_sal
                app_total_price += sum_pr
                rows.append([kp['category'], kp['job_name'], kp['unit'], kp['volume'], kp['salary'], sum_sal, sum_pr])

            # Итого по заявке
            rows.append(["", "", "", "", "ИТОГО ПО ЗАЯВКЕ:", app_total_salary, app_total_price])

        df = pd.DataFrame(rows)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, header=False, sheet_name='Отчет КП')

            # Автоширина колонок
            worksheet = writer.sheets['Отчет КП']
            worksheet.column_dimensions['A'].width = 25
            worksheet.column_dimensions['B'].width = 40
            worksheet.column_dimensions['C'].width = 15
            worksheet.column_dimensions['D'].width = 15
            worksheet.column_dimensions['E'].width = 15
            worksheet.column_dimensions['F'].width = 15
            worksheet.column_dimensions['G'].width = 15

        output.seek(0)
        return output
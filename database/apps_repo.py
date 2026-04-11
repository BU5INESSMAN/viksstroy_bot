class AppsRepoMixin:

    async def save_application(self, data: dict, foreman_id: int):
        app_id = data.get('edit_app_id')

        if app_id:
            await self.conn.execute(
                """UPDATE applications
                   SET object_address=?,
                       team_id=?,
                       date_target=?,
                       equipment_id=?,
                       time_start=?,
                       time_end=?,
                       comment=?,
                       status='pending',
                       rejection_reason=NULL
                   WHERE id = ?""",
                (data['object_address'], data['team_id'], data['date_target'], data['equipment_id'], data['time_start'],
                 data['time_end'], data.get('comment', ''), app_id)
            )
            await self.conn.execute("DELETE FROM application_selected_staff WHERE app_id=?", (app_id,))
            new_app_id = app_id
        else:
            cursor = await self.conn.execute(
                """INSERT INTO applications
                   (foreman_id, object_address, team_id, date_target, equipment_id, time_start, time_end, comment,
                    status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                (foreman_id, data['object_address'], data['team_id'], data['date_target'], data['equipment_id'],
                 data['time_start'], data['time_end'], data.get('comment', ''))
            )
            new_app_id = cursor.lastrowid

        for m_id in data['selected_member_ids']:
            await self.conn.execute("INSERT INTO application_selected_staff (app_id, member_id) VALUES (?, ?)",
                                    (new_app_id, m_id))
        await self.conn.commit()
        return new_app_id

    async def get_application_details(self, app_id: int):
        cursor = await self.conn.execute(
            """SELECT a.*, t.name as team_name, e.name as equip_name, e.driver_fio, u.fio as foreman_name
               FROM applications a
                        LEFT JOIN teams t ON a.team_id = t.id
                        LEFT JOIN equipment e ON a.equipment_id = e.id
                        LEFT JOIN users u ON a.foreman_id = u.user_id
               WHERE a.id = ?""", (app_id,)
        )
        app = await cursor.fetchone()
        if not app: return None

        cursor = await self.conn.execute(
            """SELECT ast.member_id, tm.fio, tm.position
               FROM application_selected_staff ast
                        JOIN team_members tm ON ast.member_id = tm.id
               WHERE ast.app_id = ?""", (app_id,)
        )
        staff = await cursor.fetchall()
        return {"details": dict(app), "staff": [dict(s) for s in staff]}

    async def update_app_status(self, app_id: int, status: str, rejection_reason: str = None):
        if rejection_reason:
            await self.conn.execute("UPDATE applications SET status = ?, rejection_reason = ? WHERE id = ?",
                                    (status, rejection_reason, app_id))
        else:
            await self.conn.execute("UPDATE applications SET status = ? WHERE id = ?", (status, app_id))
        await self.conn.commit()

    async def get_pending_applications(self):
        async with self.conn.execute("SELECT id, object_address FROM applications WHERE status = 'pending'") as cursor:
            return await cursor.fetchall()

    async def get_user_applications(self, user_id: int):
        async with self.conn.execute("SELECT * FROM applications WHERE foreman_id = ? ORDER BY id DESC LIMIT 10",
                                     (user_id,)) as cursor:
            return await cursor.fetchall()

    async def get_daily_report(self, date_target: str):
        cursor = await self.conn.execute(
            """SELECT a.*, u.fio as foreman_fio, e.name as equip_name, e.driver_fio
               FROM applications a
                        LEFT JOIN users u ON a.foreman_id = u.user_id
                        LEFT JOIN equipment e ON a.equipment_id = e.id
               WHERE a.date_target = ?
                 AND a.status = 'approved'""",
            (date_target,)
        )
        apps = await cursor.fetchall()
        report = []
        for app in apps:
            c2 = await self.conn.execute(
                """SELECT tm.fio, tm.position
                   FROM application_selected_staff ast
                            JOIN team_members tm ON ast.member_id = tm.id
                   WHERE ast.app_id = ?""", (app['id'],)
            )
            members = await c2.fetchall()
            member_strs = [f"{m['fio']} ({m['position']})" for m in members]
            report.append({
                'info': dict(app),
                'members': member_strs
            })
        return report

    async def get_object_history(self, user_id: int):
        async with self.conn.execute(
                "SELECT DISTINCT object_address FROM applications WHERE foreman_id = ? ORDER BY id DESC LIMIT 5",
                (user_id,)) as cursor:
            return await cursor.fetchall()

    async def get_app_members_with_tg(self, app_id: int):
        async with self.conn.execute("""
                                     SELECT tm.tg_user_id, tm.fio, tm.position
                                     FROM application_selected_staff ast
                                              JOIN team_members tm ON ast.member_id = tm.id
                                     WHERE ast.app_id = ?
                                       AND tm.tg_user_id IS NOT NULL
                                     """, (app_id,)) as cursor:
            return await cursor.fetchall()

    async def get_approved_apps_for_publish(self):
        async with self.conn.execute(
                "SELECT id FROM applications WHERE status = 'approved' AND (is_published = 0 OR is_published IS NULL)") as cursor:
            return await cursor.fetchall()

    async def mark_app_as_published(self, app_id: int):
        await self.conn.execute("UPDATE applications SET is_published = 1 WHERE id = ?", (app_id,))
        await self.conn.commit()

    async def check_resource_availability(self, date_target: str, object_id: int, team_ids: str, equip_data: str, exclude_app_id: int = None):
        """Строгая проверка занятости бригад и техники с учётом временных слотов"""
        import json
        import logging
        logger = logging.getLogger(__name__)
        occupied_resources = []

        def _to_minutes(t) -> int:
            s = str(t)
            if ':' in s:
                parts = s.split(':')
                return int(parts[0]) * 60 + int(parts[1])
            return int(s) * 60

        # Fetch ALL applications for the target date where status != 'rejected'
        query = """
                SELECT a.id, a.team_id, a.equipment_data, o.name as obj_name, a.object_address, a.foreman_name
                FROM applications a
                         LEFT JOIN objects o ON a.object_id = o.id
                WHERE a.date_target = ?
                  AND a.status NOT IN ('rejected', 'cancelled')
                  AND a.is_team_freed = 0
                """
        params = [date_target]
        if exclude_app_id:
            query += " AND a.id != ?"
            params.append(exclude_app_id)

        async with self.conn.execute(query, params) as cur:
            active_apps = await cur.fetchall()

        # Parse requested team IDs
        target_teams = [t.strip() for t in str(team_ids).split(',')] if team_ids and str(team_ids) != '0' else []

        # Parse requested equipment with time windows
        target_equip_map = {}  # id_str -> {time_start, time_end, name}
        if equip_data:
            try:
                raw = equip_data if isinstance(equip_data, str) else json.dumps(equip_data)
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    for e in parsed:
                        if isinstance(e, dict) and 'id' in e:
                            target_equip_map[str(e['id'])] = {
                                'time_start': _to_minutes(e.get('time_start', '08')),
                                'time_end': _to_minutes(e.get('time_end', '17')),
                                'name': e.get('name', f"Техника #{e['id']}"),
                            }
            except (json.JSONDecodeError, TypeError, KeyError):
                pass

        for eid, info in target_equip_map.items():
            logger.info(f"Equipment validation: equip_id={eid}, date={date_target}, "
                        f"new_time={info['time_start']//60:02d}:{info['time_start']%60:02d}-{info['time_end']//60:02d}:{info['time_end']%60:02d}")

        # Iterate through fetched apps and check conflicts
        for app in active_apps:
            app_team = str(app[1]) if app[1] is not None else ""
            app_equip_raw = str(app[2]) if app[2] is not None else ""
            obj_name = app[3] or app[4] or "Неизвестный объект"
            foreman_name = app[5] or ""

            # Team conflict check
            if target_teams and app_team and app_team != '0':
                app_team_list = [t.strip() for t in app_team.split(',') if t.strip() and t.strip() != '0']
                for t in target_teams:
                    if t in app_team_list:
                        occupied_resources.append(f"❌ Бригада (ID: {t}) уже занята на объекте «{obj_name}»")

            # Equipment conflict check with time-overlap
            if target_equip_map and app_equip_raw:
                try:
                    app_eq_parsed = json.loads(app_equip_raw)
                    if isinstance(app_eq_parsed, list):
                        for ae in app_eq_parsed:
                            if not isinstance(ae, dict) or ae.get('is_freed'):
                                continue
                            ae_id = str(ae.get('id', ''))
                            if ae_id not in target_equip_map:
                                continue
                            # Time overlap: new_start < existing_end AND new_end > existing_start
                            ae_start = _to_minutes(ae.get('time_start', '08'))
                            ae_end = _to_minutes(ae.get('time_end', '17'))
                            new = target_equip_map[ae_id]
                            has_overlap = new['time_start'] < ae_end and new['time_end'] > ae_start
                            logger.info(
                                f"  Existing app #{app[0]}: equip={ae_id}, "
                                f"time={ae_start//60:02d}:{ae_start%60:02d}-{ae_end//60:02d}:{ae_end%60:02d}, "
                                f"vs new={new['time_start']//60:02d}:{new['time_start']%60:02d}-{new['time_end']//60:02d}:{new['time_end']%60:02d}, "
                                f"overlap={has_overlap}"
                            )
                            if has_overlap:
                                ae_ts = f"{ae_start // 60:02d}:{ae_start % 60:02d}"
                                ae_te = f"{ae_end // 60:02d}:{ae_end % 60:02d}"
                                occupied_resources.append(
                                    f"❌ Техника «{new['name']}» занята {ae_ts}-{ae_te} на объекте «{obj_name}» ({foreman_name})"
                                )
                except (json.JSONDecodeError, TypeError, KeyError):
                    pass

        return occupied_resources
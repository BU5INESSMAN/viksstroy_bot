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

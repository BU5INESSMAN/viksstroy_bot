class ObjectsRepoMixin:

    async def get_objects(self, include_archived=False):
        """Возвращает список всех объектов"""
        query = "SELECT * FROM objects ORDER BY id DESC" if include_archived else "SELECT * FROM objects WHERE is_archived = 0 ORDER BY id DESC"
        async with self.conn.execute(query) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def create_object(self, name: str, address: str):
        """Создает новый объект"""
        cursor = await self.conn.execute("INSERT INTO objects (name, address) VALUES (?, ?)", (name, address))
        await self.conn.commit()
        return cursor.lastrowid

    async def update_object(self, obj_id: int, name: str, address: str, default_teams: str, default_equip: str):
        """Обновляет информацию об объекте и ресурсы по умолчанию"""
        await self.conn.execute(
            "UPDATE objects SET name=?, address=?, default_team_ids=?, default_equip_ids=? WHERE id=?",
            (name, address, default_teams, default_equip, obj_id)
        )
        await self.conn.commit()

    async def archive_object(self, obj_id: int):
        """Переводит объект в архив"""
        await self.conn.execute("UPDATE objects SET is_archived = 1 WHERE id = ?", (obj_id,))
        await self.conn.commit()

    async def restore_object(self, obj_id: int):
        """Восстанавливает объект из архива"""
        await self.conn.execute("UPDATE objects SET is_archived = 0 WHERE id = ?", (obj_id,))
        await self.conn.commit()

    # ==========================================
    # РАБОТА С ПЛАНАМИ КП ОБЪЕКТА
    # ==========================================

    async def get_kp_catalog(self):
        """Возвращает весь глобальный справочник КП"""
        async with self.conn.execute("SELECT * FROM kp_catalog ORDER BY category, id") as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def get_object_kp_plan(self, object_id: int):
        """Возвращает назначенные КП для конкретного объекта"""
        async with self.conn.execute("""
            SELECT k.*, okp.id as plan_id, okp.target_volume
            FROM object_kp_plan okp
            JOIN kp_catalog k ON okp.kp_id = k.id
            WHERE okp.object_id = ?
            ORDER BY k.category, k.id
        """, (object_id,)) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def add_kp_to_object(self, object_id: int, kp_ids: list, target_volumes: dict = None):
        """Полностью перезаписывает план КП для объекта с плановыми объемами.

        Копирует unit из kp_catalog в момент вставки, чтобы строка плана
        сохраняла единицу измерения даже если справочник позже изменится.
        """
        if target_volumes is None:
            target_volumes = {}

        # Batch-lookup units for the given kp_ids
        units: dict[int, str] = {}
        if kp_ids:
            pl = ",".join("?" * len(kp_ids))
            async with self.conn.execute(
                f"SELECT id, unit FROM kp_catalog WHERE id IN ({pl})", list(kp_ids)
            ) as cur:
                for r in await cur.fetchall():
                    units[int(r[0])] = (r[1] or '').strip()

        await self.conn.execute("DELETE FROM object_kp_plan WHERE object_id = ?", (object_id,))
        for kp_id in kp_ids:
            tv = target_volumes.get(str(kp_id), 0)
            unit = units.get(int(kp_id), '')
            await self.conn.execute(
                "INSERT INTO object_kp_plan (object_id, kp_id, target_volume, unit) VALUES (?, ?, ?, ?)",
                (object_id, kp_id, tv, unit)
            )
        await self.conn.commit()

    # ==========================================
    # ФАЙЛЫ ОБЪЕКТА (PDF)
    # ==========================================

    async def get_object_files(self, object_id: int):
        async with self.conn.execute(
            "SELECT * FROM object_files WHERE object_id = ? ORDER BY uploaded_at DESC", (object_id,)
        ) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def add_object_file(self, object_id: int, file_path: str, original_name: str = '', file_size: int = 0):
        await self.conn.execute(
            "INSERT INTO object_files (object_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)",
            (object_id, file_path, original_name, file_size)
        )
        await self.conn.commit()

    async def delete_object_file(self, file_id: int):
        async with self.conn.execute("SELECT file_path FROM object_files WHERE id = ?", (file_id,)) as cur:
            row = await cur.fetchone()
        if row:
            await self.conn.execute("DELETE FROM object_files WHERE id = ?", (file_id,))
            await self.conn.commit()
            return dict(row).get('file_path')
        return None

    # ==========================================
    # СТАТИСТИКА ОБЪЕКТА
    # ==========================================

    async def get_object_stats(self, object_id: int):
        """Возвращает сводную статистику: план vs факт по каждому виду работ"""
        # Stage 10: unit prefers the denormalized plan.unit, falls back to
        # catalog when the plan row's unit is still empty.
        # v2.4.2/v2.4.3: filter 'nan'/'none'/'null' AND purely numeric
        # junk left by the old parser bug (unit was read from the salary
        # column, so many rows have values like "320" or "400").
        query = """
            SELECT k.id as kp_id, k.category, k.name,
                   COALESCE(
                       NULLIF(
                           CASE WHEN LOWER(TRIM(okp.unit)) IN ('nan','none','null')
                                  OR TRIM(okp.unit) GLOB '[0-9]*' THEN ''
                                ELSE TRIM(okp.unit) END,
                           ''),
                       NULLIF(
                           CASE WHEN LOWER(TRIM(k.unit)) IN ('nan','none','null')
                                  OR TRIM(k.unit) GLOB '[0-9]*' THEN ''
                                ELSE TRIM(k.unit) END,
                           ''),
                       ''
                   ) as unit,
                   okp.target_volume,
                   COALESCE(SUM(akp.volume), 0) as completed_volume
            FROM object_kp_plan okp
            JOIN kp_catalog k ON okp.kp_id = k.id
            LEFT JOIN application_kp akp ON akp.kp_id = k.id
                AND akp.application_id IN (
                    SELECT a.id FROM applications a
                    WHERE a.object_id = ? AND a.kp_status = 'approved'
                )
            WHERE okp.object_id = ?
            GROUP BY k.id
            ORDER BY k.category, k.id
        """
        async with self.conn.execute(query, (object_id, object_id)) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def get_object_history(self, object_id: int):
        """Хронологическая история выполненных объемов по датам/заявкам.

        v2.4.8: drop the `kp_status = 'approved'` filter — the SMR wizard
        flow leaves brigadier submissions in `kp_status = 'submitted' /
        smr_status = 'pending_review'` until a foreman reviews them. The
        work itself has been reported, so it should appear in history.
        We still require akp.volume > 0 to hide empty rows, and surface
        `smr_status` + authorship so the UI can flag pending entries.
        """
        query = """
            SELECT a.id as app_id,
                   a.date_target,
                   a.smr_status,
                   a.smr_filled_by_role,
                   k.category,
                   k.name,
                   COALESCE(
                       NULLIF(
                           CASE WHEN LOWER(TRIM(akp.unit)) IN ('nan','none','null')
                                  OR TRIM(akp.unit) GLOB '[0-9]*' THEN ''
                                ELSE TRIM(akp.unit) END,
                           ''),
                       NULLIF(
                           CASE WHEN LOWER(TRIM(k.unit)) IN ('nan','none','null')
                                  OR TRIM(k.unit) GLOB '[0-9]*' THEN ''
                                ELSE TRIM(k.unit) END,
                           ''),
                       ''
                   ) as unit,
                   akp.volume,
                   akp.filled_at,
                   u_filled.fio as filled_by_fio,
                   u_filled.role as filled_by_role
            FROM application_kp akp
            JOIN applications a ON akp.application_id = a.id
            JOIN kp_catalog k ON akp.kp_id = k.id
            LEFT JOIN users u_filled ON u_filled.user_id = akp.filled_by_user_id
            WHERE a.object_id = ? AND akp.volume > 0
            ORDER BY a.date_target DESC, akp.filled_at DESC, k.category, k.id
        """
        async with self.conn.execute(query, (object_id,)) as cur:
            return [dict(row) for row in await cur.fetchall()]
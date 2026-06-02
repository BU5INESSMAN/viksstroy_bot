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
                    WHERE a.object_id = ?
                      AND (
                        a.kp_status IN ('approved', 'submitted')
                        OR a.smr_status IN ('approved', 'pending_review')
                        OR a.status = 'completed'
                      )
                )
            WHERE okp.object_id = ?
            GROUP BY k.id
            ORDER BY k.category, k.id
        """
        async with self.conn.execute(query, (object_id, object_id)) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def get_object_extra_works_stats(self, object_id: int):
        """Сводные «дополнительные работы» по объекту.

        application_extra_works → extra_works_catalog через extra_work_id
        (НЕ kp_catalog). Название берём сначала из custom_name (если пустое
        — из справочника). Единицу — из aew.unit (денормализована с v2.4.3),
        иначе из справочника. Работы без названия и нулевые объёмы
        пропускаем.
        """
        query = """
            SELECT
                COALESCE(NULLIF(TRIM(aew.custom_name), ''), ewc.name, 'Без названия') AS name,
                COALESCE(
                    NULLIF(
                        CASE WHEN LOWER(TRIM(aew.unit)) IN ('nan','none','null')
                               OR TRIM(aew.unit) GLOB '[0-9]*' THEN ''
                             ELSE TRIM(aew.unit) END,
                        ''),
                    NULLIF(
                        CASE WHEN LOWER(TRIM(ewc.unit)) IN ('nan','none','null')
                               OR TRIM(ewc.unit) GLOB '[0-9]*' THEN ''
                             ELSE TRIM(ewc.unit) END,
                        ''),
                    'шт'
                ) AS unit,
                SUM(aew.volume) AS completed_volume
            FROM application_extra_works aew
            LEFT JOIN extra_works_catalog ewc ON ewc.id = aew.extra_work_id
            JOIN applications a ON a.id = aew.application_id
            WHERE a.object_id = ?
              AND (
                a.kp_status IN ('approved', 'submitted')
                OR a.smr_status IN ('approved', 'pending_review')
                OR a.status = 'completed'
              )
              AND aew.volume > 0
            GROUP BY COALESCE(NULLIF(TRIM(aew.custom_name), ''), ewc.name)
            ORDER BY name
        """
        try:
            async with self.conn.execute(query, (object_id,)) as cur:
                return [dict(row) for row in await cur.fetchall()]
        except Exception:
            return []

    async def get_object_history(self, object_id: int):
        """Хронологическая история выполненных работ по датам/заявкам.

        v2.9: broadened from a plan-only read to a UNION ALL across all
        three SMR sources, because most reported work does NOT live in
        application_kp:
          - 'plan'  → application_kp        (KP plan works)
          - 'extra' → application_extra_works (доп. работы)
          - 'hours' → application_hours     (per-member hours)
        Each row carries an `entry_type` discriminator so the UI can render
        the three kinds in separate sub-sections. Hours rows take the MEMBER
        name from team_members (application_hours.user_id == team_members.id;
        unlinked staff have no users row), reusing the canonical join from
        hours_repo.get_app_hours.

        v2.4.8 (kept): NO status filter — brigadier submissions sit in
        pending_review until reviewed but the work is already reported, so
        it belongs in history. Each arm filters only by object id and a
        positive quantity (volume > 0 / hours > 0).

        Unified columns (same order in every arm):
            entry_type, app_id, date_target, smr_status, smr_filled_by_role,
            category, name, unit, volume, hours, team_id, team_name,
            filled_at, filled_by_fio, filled_by_role
        """
        query = """
            SELECT * FROM (
                -- Arm A: plan works (application_kp)
                SELECT 'plan'                  AS entry_type,
                       a.id                    AS app_id,
                       a.date_target           AS date_target,
                       a.smr_status            AS smr_status,
                       a.smr_filled_by_role    AS smr_filled_by_role,
                       k.category              AS category,
                       k.name                  AS name,
                       COALESCE(
                           NULLIF(CASE WHEN LOWER(TRIM(akp.unit)) IN ('nan','none','null')
                                         OR TRIM(akp.unit) GLOB '[0-9]*' THEN ''
                                       ELSE TRIM(akp.unit) END, ''),
                           NULLIF(CASE WHEN LOWER(TRIM(k.unit)) IN ('nan','none','null')
                                         OR TRIM(k.unit) GLOB '[0-9]*' THEN ''
                                       ELSE TRIM(k.unit) END, ''),
                           ''
                       )                       AS unit,
                       akp.volume              AS volume,
                       NULL                    AS hours,
                       akp.team_id             AS team_id,
                       t.name                  AS team_name,
                       akp.filled_at           AS filled_at,
                       uf.fio                  AS filled_by_fio,
                       uf.role                 AS filled_by_role
                FROM application_kp akp
                JOIN applications a ON akp.application_id = a.id
                JOIN kp_catalog k ON akp.kp_id = k.id
                LEFT JOIN teams t ON t.id = akp.team_id
                LEFT JOIN users uf ON uf.user_id = akp.filled_by_user_id
                WHERE a.object_id = ? AND akp.volume > 0

                UNION ALL

                -- Arm B: extra works (application_extra_works)
                SELECT 'extra'                 AS entry_type,
                       a.id                    AS app_id,
                       a.date_target           AS date_target,
                       a.smr_status            AS smr_status,
                       a.smr_filled_by_role    AS smr_filled_by_role,
                       NULL                    AS category,
                       COALESCE(NULLIF(TRIM(e.custom_name), ''), ewc.name, 'Без названия') AS name,
                       COALESCE(
                           NULLIF(CASE WHEN LOWER(TRIM(e.unit)) IN ('nan','none','null')
                                         OR TRIM(e.unit) GLOB '[0-9]*' THEN ''
                                       ELSE TRIM(e.unit) END, ''),
                           NULLIF(CASE WHEN LOWER(TRIM(ewc.unit)) IN ('nan','none','null')
                                         OR TRIM(ewc.unit) GLOB '[0-9]*' THEN ''
                                       ELSE TRIM(ewc.unit) END, ''),
                           'шт'
                       )                       AS unit,
                       e.volume                AS volume,
                       NULL                    AS hours,
                       e.team_id               AS team_id,
                       t.name                  AS team_name,
                       e.filled_at             AS filled_at,
                       uf.fio                  AS filled_by_fio,
                       uf.role                 AS filled_by_role
                FROM application_extra_works e
                JOIN applications a ON e.application_id = a.id
                LEFT JOIN extra_works_catalog ewc ON ewc.id = e.extra_work_id
                LEFT JOIN teams t ON t.id = e.team_id
                LEFT JOIN users uf ON uf.user_id = e.filled_by_user_id
                WHERE a.object_id = ? AND e.volume > 0

                UNION ALL

                -- Arm C: per-member hours (application_hours)
                SELECT 'hours'                 AS entry_type,
                       a.id                    AS app_id,
                       a.date_target           AS date_target,
                       a.smr_status            AS smr_status,
                       a.smr_filled_by_role    AS smr_filled_by_role,
                       NULL                    AS category,
                       tm.fio                  AS name,
                       'ч'                     AS unit,
                       NULL                    AS volume,
                       ah.hours                AS hours,
                       ah.team_id              AS team_id,
                       t.name                  AS team_name,
                       ah.filled_at            AS filled_at,
                       uf.fio                  AS filled_by_fio,
                       uf.role                 AS filled_by_role
                FROM application_hours ah
                JOIN applications a ON ah.app_id = a.id
                LEFT JOIN team_members tm ON tm.id = ah.user_id
                LEFT JOIN teams t ON t.id = ah.team_id
                LEFT JOIN users uf ON uf.user_id = ah.filled_by_user_id
                WHERE a.object_id = ? AND ah.hours > 0
            )
            ORDER BY date_target DESC, app_id,
                     CASE entry_type WHEN 'plan' THEN 0 WHEN 'extra' THEN 1 ELSE 2 END
        """
        try:
            async with self.conn.execute(query, (object_id, object_id, object_id)) as cur:
                return [dict(row) for row in await cur.fetchall()]
        except Exception:
            return []
class ObjectsRepoMixin:

    async def get_objects(self, include_archived=False):
        """Возвращает список всех объектов"""
        query = "SELECT * FROM objects ORDER BY id DESC" if include_archived else "SELECT * FROM objects WHERE is_archived = 0 ORDER BY id DESC"
        async with self.conn.execute(query) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def create_object(self, name: str, address: str):
        """Создает новый объект"""
        await self.conn.execute("INSERT INTO objects (name, address) VALUES (?, ?)", (name, address))
        await self.conn.commit()

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
            SELECT k.*, okp.id as plan_id
            FROM object_kp_plan okp
            JOIN kp_catalog k ON okp.kp_id = k.id
            WHERE okp.object_id = ?
            ORDER BY k.category, k.id
        """, (object_id,)) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def add_kp_to_object(self, object_id: int, kp_ids: list):
        """Полностью перезаписывает план КП для объекта"""
        await self.conn.execute("DELETE FROM object_kp_plan WHERE object_id = ?", (object_id,))
        for kp_id in kp_ids:
            await self.conn.execute("INSERT INTO object_kp_plan (object_id, kp_id) VALUES (?, ?)", (object_id, kp_id))
        await self.conn.commit()
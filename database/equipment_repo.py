class EquipmentRepoMixin:

    async def get_equipment(self, equip_id: int):
        async with self.conn.execute("SELECT * FROM equipment WHERE id = ?", (equip_id,)) as cursor:
            return await cursor.fetchone()

    async def get_equipment_by_category(self, category: str):
        async with self.conn.execute("SELECT * FROM equipment WHERE category = ? AND is_active = 1",
                                     (category,)) as cursor:
            items = await cursor.fetchall()
            return [dict(i) for i in items]

    async def get_all_equipment_admin(self):
        async with self.conn.execute("SELECT * FROM equipment") as cursor:
            return await cursor.fetchall()

    async def get_equipment_categories(self):
        async with self.conn.execute("SELECT DISTINCT category FROM equipment WHERE is_active = 1") as cursor:
            rows = await cursor.fetchall()
            return [row['category'] for row in rows]

    async def get_equipment_busy_intervals(self, equip_id: int, date_target: str):
        async with self.conn.execute(
                "SELECT time_start, time_end FROM applications WHERE equipment_id = ? AND date_target = ? AND status != 'rejected'",
                (equip_id, date_target)
        ) as cursor:
            rows = await cursor.fetchall()
            return [(r['time_start'], r['time_end']) for r in rows]

    async def add_equipment(self, name, category, driver_fio="Не указан"):
        await self.conn.execute("INSERT INTO equipment (name, category, driver_fio, is_active) VALUES (?, ?, ?, ?)",
                                (name, category, driver_fio, 1))
        await self.conn.commit()

    async def add_equipment_bulk(self, equipment_list: list):
        await self.conn.executemany(
            "INSERT INTO equipment (name, category, driver_fio, is_active) VALUES (?, ?, ?, ?)",
            equipment_list
        )
        await self.conn.commit()

    async def update_equipment(self, equip_id: int, name: str = None, category: str = None, driver_fio: str = None):
        if name: await self.conn.execute("UPDATE equipment SET name = ? WHERE id = ?", (name, equip_id))
        if category: await self.conn.execute("UPDATE equipment SET category = ? WHERE id = ?", (category, equip_id))
        if driver_fio: await self.conn.execute("UPDATE equipment SET driver_fio = ? WHERE id = ?",
                                               (driver_fio, equip_id))
        await self.conn.commit()

    async def delete_equipment(self, equip_id: int):
        await self.conn.execute("DELETE FROM equipment WHERE id = ?", (equip_id,))
        await self.conn.commit()

    async def toggle_equipment_status(self, equip_id: int, is_active: int):
        await self.conn.execute("UPDATE equipment SET is_active = ? WHERE id = ?", (is_active, equip_id))
        await self.conn.commit()

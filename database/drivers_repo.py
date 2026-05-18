"""Driver-specific repo mixin.

Drivers are users with role='driver'. They link to equipment categories
many-to-many via `driver_categories`. Each driver may have ONE optional
`default_equipment_id`. Per-equipment popularity is tracked in
`equipment_driver_usage`.

Synthetic IDs: drivers created via moderator + invite (not yet redeemed)
get negative user_id values to avoid collision with real platform IDs.
On redemption the row is migrated to the real positive (TG) or negative-
MAX (pseudo_tg = -max_id) id via :py:meth:`redeem_synthetic_driver`.
"""
from datetime import datetime


class DriversRepoMixin:

    # ---- read --------------------------------------------------------

    async def list_drivers(self) -> list[dict]:
        """All users where role='driver' with categories + default equipment."""
        sql = """
            SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
                   u.invite_code, u.default_equipment_id, u.is_active,
                   e.name AS default_equipment_name,
                   e.category AS default_equipment_category,
                   al.secondary_id AS max_id
            FROM users u
            LEFT JOIN equipment e ON e.id = u.default_equipment_id
            LEFT JOIN account_links al ON al.primary_id = u.user_id
            WHERE u.role = 'driver' AND u.is_blacklisted = 0
            ORDER BY u.last_name, u.first_name
        """
        async with self.conn.execute(sql) as cur:
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in await cur.fetchall()]

        for d in rows:
            d["categories"] = await self._driver_categories(d["user_id"])
            uid = int(d["user_id"])
            # tg_id: positive user_id IS the tg_id; negative = MAX (pseudo)
            d["tg_id"] = uid if uid > 0 else None
            if uid < 0:
                d["max_id"] = -uid
            d["linked"] = uid > 0 or d.get("max_id") is not None and uid < 0
            # synthetic-not-yet-redeemed if id<0 AND no MAX link AND not active
            d["pending_redeem"] = uid < 0 and (d.get("max_id") is None or d.get("is_active") == 0) and bool(d.get("invite_code"))

        return rows

    async def get_driver(self, user_id: int) -> dict | None:
        sql = """
            SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
                   u.invite_code, u.default_equipment_id, u.is_active,
                   e.name AS default_equipment_name,
                   e.category AS default_equipment_category
            FROM users u
            LEFT JOIN equipment e ON e.id = u.default_equipment_id
            WHERE u.user_id = ? AND u.role = 'driver'
        """
        async with self.conn.execute(sql, (user_id,)) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            cols = [c[0] for c in cur.description]
            d = dict(zip(cols, row))
        d["categories"] = await self._driver_categories(user_id)
        return d

    async def _driver_categories(self, user_id: int) -> list[dict]:
        async with self.conn.execute(
            """SELECT dc.category, ecs.icon
               FROM driver_categories dc
               LEFT JOIN equipment_category_settings ecs ON ecs.category = dc.category
               WHERE dc.user_id = ?""",
            (user_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [{"name": r[0], "icon": r[1]} for r in rows]

    # ---- write -------------------------------------------------------

    async def _next_negative_user_id(self) -> int:
        async with self.conn.execute("SELECT MIN(user_id) FROM users") as cur:
            row = await cur.fetchone()
        cur_min = row[0] if row and row[0] is not None else 0
        return min(cur_min, 0) - 1

    async def create_driver(
        self,
        *,
        last_name: str,
        first_name: str,
        middle_name: str | None,
        category_names: list[str],
        default_equipment_id: int | None,
        invite_code: str,
    ) -> int:
        from utils_fio import format_fio

        new_id = await self._next_negative_user_id()
        full_fio = format_fio(last_name, first_name, middle_name or "")
        await self.conn.execute(
            """INSERT INTO users
               (user_id, fio, last_name, first_name, middle_name,
                role, is_active, invite_code, default_equipment_id, created_at)
               VALUES (?, ?, ?, ?, ?, 'driver', 0, ?, ?, datetime('now'))""",
            (new_id, full_fio, last_name, first_name, middle_name or "",
             invite_code, default_equipment_id),
        )
        for cat in (category_names or []):
            await self.conn.execute(
                "INSERT OR IGNORE INTO driver_categories (user_id, category) VALUES (?, ?)",
                (new_id, cat),
            )
        await self.conn.commit()
        return new_id

    async def update_driver(
        self,
        user_id: int,
        *,
        last_name: str | None = None,
        first_name: str | None = None,
        middle_name: str | None = None,
        category_names: list[str] | None = None,
        default_equipment_id: int | None = ...,  # sentinel: not passed
    ) -> None:
        from utils_fio import format_fio

        # Fetch current name parts so we can recompute the denormalized fio
        async with self.conn.execute(
            "SELECT last_name, first_name, middle_name FROM users WHERE user_id = ?",
            (user_id,),
        ) as cur:
            cur_row = await cur.fetchone()
        if not cur_row:
            return
        cur_last, cur_first, cur_middle = cur_row[0] or "", cur_row[1] or "", cur_row[2] or ""

        new_last = last_name if last_name is not None else cur_last
        new_first = first_name if first_name is not None else cur_first
        new_middle = middle_name if middle_name is not None else cur_middle
        new_fio = format_fio(new_last, new_first, new_middle)

        sets = ["last_name = ?", "first_name = ?", "middle_name = ?", "fio = ?"]
        vals: list = [new_last, new_first, new_middle, new_fio]

        if default_equipment_id is not ...:
            sets.append("default_equipment_id = ?")
            vals.append(default_equipment_id)

        vals.append(user_id)
        await self.conn.execute(
            f"UPDATE users SET {', '.join(sets)} WHERE user_id = ?",
            vals,
        )

        if category_names is not None:
            await self.conn.execute(
                "DELETE FROM driver_categories WHERE user_id = ?", (user_id,)
            )
            for cat in category_names:
                await self.conn.execute(
                    "INSERT OR IGNORE INTO driver_categories (user_id, category) VALUES (?, ?)",
                    (user_id, cat),
                )

        await self.conn.commit()

    async def delete_driver(self, user_id: int) -> None:
        # FK ON DELETE CASCADE handles driver_categories + equipment_driver_usage.
        await self.conn.execute("DELETE FROM users WHERE user_id = ? AND role = 'driver'", (user_id,))
        await self.conn.commit()

    async def regenerate_driver_invite(self, user_id: int) -> str | None:
        from web.utils import generate_invite_code

        async with self.conn.execute(
            "SELECT 1 FROM users WHERE user_id = ? AND role = 'driver'", (user_id,)
        ) as cur:
            if not await cur.fetchone():
                return None
        code = generate_invite_code(12)
        await self.conn.execute(
            "UPDATE users SET invite_code = ? WHERE user_id = ?", (code, user_id)
        )
        await self.conn.commit()
        return code

    # ---- selection / popularity --------------------------------------

    async def get_drivers_for_equipment(self, equipment_id: int) -> dict:
        """Return drivers split into 'primary' (same category) and
        'other_grouped' (drivers from OTHER categories grouped by category).

        Primary sort order:
          1. default_equipment_id == equipment_id (default driver)
          2. equipment_driver_usage.last_used_at DESC
          3. equipment_driver_usage.usage_count DESC
          4. last_name, first_name
        """
        async with self.conn.execute(
            "SELECT id, name, category FROM equipment WHERE id = ?",
            (equipment_id,),
        ) as cur:
            eq_row = await cur.fetchone()
        if not eq_row:
            return {"primary": [], "other_grouped": [], "equipment": None}
        eq_id_db, eq_name, eq_category = eq_row[0], eq_row[1], eq_row[2] or ""

        async with self.conn.execute(
            "SELECT icon FROM equipment_category_settings WHERE category = ?", (eq_category,)
        ) as cur:
            cat_icon_row = await cur.fetchone()
        cat_icon = cat_icon_row[0] if cat_icon_row else None

        # Primary: drivers whose categories include eq.category
        primary_sql = """
            SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
                   u.default_equipment_id,
                   COALESCE(edu.usage_count, 0) AS usage_count,
                   edu.last_used_at
            FROM users u
            JOIN driver_categories dc ON dc.user_id = u.user_id
            LEFT JOIN equipment_driver_usage edu
                   ON edu.driver_user_id = u.user_id
                  AND edu.equipment_id = ?
            WHERE u.role = 'driver'
              AND u.is_blacklisted = 0
              AND dc.category = ?
            ORDER BY (u.default_equipment_id = ?) DESC,
                     edu.last_used_at DESC,
                     edu.usage_count DESC,
                     u.last_name, u.first_name
        """
        async with self.conn.execute(primary_sql, (eq_id_db, eq_category, eq_id_db)) as cur:
            cols = [c[0] for c in cur.description]
            primary_rows = [dict(zip(cols, r)) for r in await cur.fetchall()]
        for d in primary_rows:
            d["is_default"] = (d.get("default_equipment_id") == eq_id_db)

        # Others: drivers NOT in primary, grouped by THEIR categories
        primary_ids = {d["user_id"] for d in primary_rows}
        if primary_ids:
            excl = "AND u.user_id NOT IN (" + ",".join("?" * len(primary_ids)) + ")"
            params = list(primary_ids)
        else:
            excl = ""
            params = []

        others_sql = f"""
            SELECT u.user_id, u.fio, u.last_name, u.first_name, u.middle_name,
                   u.default_equipment_id,
                   dc.category,
                   ecs.icon AS category_icon,
                   COALESCE(SUM(edu.usage_count), 0) AS usage_count_total,
                   MAX(edu.last_used_at) AS last_used_at
            FROM users u
            JOIN driver_categories dc ON dc.user_id = u.user_id
            LEFT JOIN equipment_category_settings ecs ON ecs.category = dc.category
            LEFT JOIN equipment_driver_usage edu ON edu.driver_user_id = u.user_id
            WHERE u.role = 'driver'
              AND u.is_blacklisted = 0
              AND dc.category != ?
              {excl}
            GROUP BY u.user_id, dc.category
            ORDER BY dc.category, usage_count_total DESC, u.last_name, u.first_name
        """
        async with self.conn.execute(others_sql, [eq_category] + params) as cur:
            cols = [c[0] for c in cur.description]
            other_rows = [dict(zip(cols, r)) for r in await cur.fetchall()]

        grouped: dict[str, dict] = {}
        for d in other_rows:
            cat = d["category"]
            if cat not in grouped:
                grouped[cat] = {
                    "category": cat,
                    "category_icon": d.get("category_icon"),
                    "drivers": [],
                }
            grouped[cat]["drivers"].append({
                "user_id": d["user_id"],
                "fio": d["fio"],
                "last_name": d["last_name"],
                "first_name": d["first_name"],
                "middle_name": d["middle_name"],
                "is_default": d.get("default_equipment_id") == eq_id_db,
                "usage_count": d.get("usage_count_total", 0),
                "last_used_at": d.get("last_used_at"),
            })

        return {
            "equipment": {
                "id": eq_id_db,
                "name": eq_name,
                "category": eq_category,
                "category_icon": cat_icon,
            },
            "primary": primary_rows,
            "other_grouped": list(grouped.values()),
        }

    async def record_driver_usage(self, equipment_id: int, driver_user_id: int) -> None:
        """Upsert: increment usage_count and refresh last_used_at."""
        now = datetime.utcnow().isoformat(timespec="seconds")
        await self.conn.execute(
            """INSERT INTO equipment_driver_usage (equipment_id, driver_user_id, last_used_at, usage_count)
               VALUES (?, ?, ?, 1)
               ON CONFLICT(equipment_id, driver_user_id) DO UPDATE
               SET usage_count = usage_count + 1,
                   last_used_at = excluded.last_used_at""",
            (equipment_id, driver_user_id, now),
        )
        await self.conn.commit()

    # ---- redemption: synthetic ID swap --------------------------------

    async def find_user_by_invite_code(self, invite_code: str) -> dict | None:
        async with self.conn.execute(
            "SELECT user_id, fio, role FROM users WHERE invite_code = ?",
            (invite_code,),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        return {"user_id": row[0], "fio": row[1], "role": row[2]}

    async def redeem_synthetic_driver(
        self,
        synthetic_user_id: int,
        real_user_id: int,
    ) -> bool:
        """Swap a synthetic-ID (user_id < 0) driver row to `real_user_id`.

        Cascades updates to driver_categories and equipment_driver_usage.
        Returns False if the synthetic row no longer exists or the real id
        is already taken by a different user.

        Caller MUST pass a real platform id:
          - Telegram users: positive tg_id.
          - MAX-only users: -max_id (pseudo_tg_id pattern used elsewhere).
        """
        if synthetic_user_id >= 0:
            return False
        if synthetic_user_id == real_user_id:
            return False

        async with self.conn.execute(
            "SELECT * FROM users WHERE user_id = ? AND role = 'driver'",
            (synthetic_user_id,),
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return False
            cols = [c[0] for c in cur.description]
            synth = dict(zip(cols, row))

        async with self.conn.execute(
            "SELECT user_id FROM users WHERE user_id = ?", (real_user_id,)
        ) as cur:
            existing = await cur.fetchone()

        try:
            if existing:
                # Real user already exists — promote them, copy invite/default_equipment.
                await self.conn.execute(
                    """UPDATE users
                       SET role = 'driver',
                           is_active = 1,
                           invite_code = COALESCE(invite_code, ?),
                           default_equipment_id = COALESCE(default_equipment_id, ?),
                           fio = COALESCE(NULLIF(fio, ''), ?),
                           last_name = COALESCE(NULLIF(last_name, ''), ?),
                           first_name = COALESCE(NULLIF(first_name, ''), ?),
                           middle_name = COALESCE(NULLIF(middle_name, ''), ?)
                       WHERE user_id = ?""",
                    (
                        synth.get("invite_code"),
                        synth.get("default_equipment_id"),
                        synth.get("fio"),
                        synth.get("last_name"),
                        synth.get("first_name"),
                        synth.get("middle_name"),
                        real_user_id,
                    ),
                )
            else:
                await self.conn.execute(
                    """INSERT INTO users
                       (user_id, fio, last_name, first_name, middle_name,
                        role, is_active, invite_code, default_equipment_id, created_at)
                       VALUES (?, ?, ?, ?, ?, 'driver', 1, ?, ?, datetime('now'))""",
                    (
                        real_user_id,
                        synth.get("fio"),
                        synth.get("last_name"),
                        synth.get("first_name"),
                        synth.get("middle_name"),
                        synth.get("invite_code"),
                        synth.get("default_equipment_id"),
                    ),
                )

            # Cascade driver_categories
            await self.conn.execute(
                """INSERT OR IGNORE INTO driver_categories (user_id, category)
                   SELECT ?, category FROM driver_categories WHERE user_id = ?""",
                (real_user_id, synthetic_user_id),
            )
            await self.conn.execute(
                "DELETE FROM driver_categories WHERE user_id = ?", (synthetic_user_id,)
            )

            # Cascade equipment_driver_usage (merge counters if any)
            await self.conn.execute(
                """INSERT INTO equipment_driver_usage
                   (equipment_id, driver_user_id, last_used_at, usage_count)
                   SELECT equipment_id, ?, last_used_at, usage_count
                   FROM equipment_driver_usage WHERE driver_user_id = ?
                   ON CONFLICT(equipment_id, driver_user_id) DO UPDATE
                   SET usage_count = equipment_driver_usage.usage_count + excluded.usage_count,
                       last_used_at = CASE
                           WHEN excluded.last_used_at > equipment_driver_usage.last_used_at
                           THEN excluded.last_used_at
                           ELSE equipment_driver_usage.last_used_at
                       END""",
                (real_user_id, synthetic_user_id),
            )
            await self.conn.execute(
                "DELETE FROM equipment_driver_usage WHERE driver_user_id = ?",
                (synthetic_user_id,),
            )

            # Finally remove the synthetic row.
            await self.conn.execute(
                "DELETE FROM users WHERE user_id = ?", (synthetic_user_id,)
            )
            await self.conn.commit()
            return True
        except Exception:
            await self.conn.rollback()
            raise

    async def get_drivers_for_app_summary(self, app_id: int) -> list[dict]:
        """Helper used by notifications when assignments live in
        application_drivers (commit 3). Stub returns []; will be wired
        up after the junction table lands."""
        return []

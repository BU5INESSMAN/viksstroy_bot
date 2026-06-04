"""SMR wizard: hours tracking per team member per application.

Schema decision — `application_hours.user_id` stores `team_members.id`
(not `users.user_id`). Many team members are "unlinked" staff — they
have no TG/MAX account yet still need hours recorded. The foreign key
declaration in schema.sql points at users(user_id) for convention, but
the FK is not enforced by SQLite unless PRAGMA foreign_keys = ON, which
this project does not set.

Rationale: mirrors the existing pattern used by
`application_selected_staff.member_id`, which also stores
`team_members.id`.
"""

from datetime import datetime


def _parse_team_ids(team_id_field: str) -> list[int]:
    if not team_id_field:
        return []
    out: list[int] = []
    for part in str(team_id_field).split(','):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


class HoursRepoMixin:

    async def get_app_hours(self, app_id: int, include_additional: bool = False) -> list[dict]:
        """Return hours rows for the application with FIO/specialty joined from
        team_members and the author's FIO from users.

        v2.10: by default returns only MAIN rows (is_additional=0) — the
        editable SMR wizard must seed only the main report, else addendum
        hours would be re-absorbed/double-counted on a main re-submit. Pass
        include_additional=True (e.g. the read-only view / roster checks) to
        also get доп.отчёт rows. is_additional is selected so callers can
        badge addendum rows.
        """
        add_filter = "" if include_additional else " AND COALESCE(ah.is_additional, 0) = 0"
        query = f"""
            SELECT
                ah.id,
                ah.app_id,
                ah.team_id,
                ah.user_id AS member_id,
                ah.hours,
                ah.filled_by_user_id,
                ah.filled_at,
                COALESCE(ah.is_additional, 0) AS is_additional,
                tm.fio AS fio,
                tm.position AS specialty,
                tm.tg_user_id AS tg_user_id,
                tm.status AS member_status,
                tm.status_from AS status_from,
                tm.status_until AS status_until,
                t.name AS team_name,
                t.icon AS team_icon,
                filled_u.fio AS filled_by_fio,
                filled_u.role AS filled_by_role
            FROM application_hours ah
            LEFT JOIN team_members tm ON tm.id = ah.user_id
            LEFT JOIN teams t ON t.id = ah.team_id
            LEFT JOIN users filled_u ON filled_u.user_id = ah.filled_by_user_id
            WHERE ah.app_id = ?{add_filter}
            ORDER BY t.name, tm.is_foreman DESC, tm.fio
        """
        async with self.conn.execute(query, (app_id,)) as cur:
            return [dict(r) for r in await cur.fetchall()]

    async def save_app_hours(self, app_id: int, hours_data: list[dict], filled_by_user_id: int):
        """Upsert hours rows. `hours_data` items: {team_id, user_id, hours}
        — where `user_id` is actually team_members.id (see module docstring).
        """
        now = datetime.now().isoformat(timespec='seconds')
        for item in hours_data:
            try:
                team_id = int(item['team_id'])
                member_id = int(item['user_id'])
                hours = float(item.get('hours') or 0)
            except (KeyError, TypeError, ValueError):
                continue
            # v2.10: main hours write is_additional=0. ON CONFLICT target now
            # carries the partial-index predicate (WHERE is_additional = 0) so
            # it matches idx_app_hours_unique's partial form; addendum rows
            # (is_additional=1) are outside the index and never conflict here.
            await self.conn.execute(
                """
                INSERT INTO application_hours
                    (app_id, team_id, user_id, hours, filled_by_user_id, filled_at, is_additional)
                VALUES (?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT(app_id, team_id, user_id) WHERE is_additional = 0 DO UPDATE SET
                    hours = excluded.hours,
                    filled_by_user_id = excluded.filled_by_user_id,
                    filled_at = excluded.filled_at
                """,
                (app_id, team_id, member_id, hours, filled_by_user_id, now),
            )
        await self.conn.commit()

    async def get_teams_for_app(self, app_id: int) -> list[dict]:
        """Return teams assigned to the application with their members.

        Reads `applications.team_id` as a comma-separated list of team ids
        (existing convention — see frontend `useAppForm.js`).
        """
        async with self.conn.execute(
            "SELECT team_id, selected_members FROM applications WHERE id = ?", (app_id,)
        ) as cur:
            app_row = await cur.fetchone()
        if not app_row:
            return []

        team_ids = _parse_team_ids(app_row['team_id'])
        # v2.4.5: keep the list of selected member ids — step 1 only shows
        # members who were actually assigned to this application.
        selected_raw = app_row['selected_members'] or ''
        selected_ids: set[int] = set()
        for part in str(selected_raw).split(','):
            part = part.strip()
            if part.isdigit():
                selected_ids.add(int(part))

        if not team_ids:
            return []

        teams: list[dict] = []
        for tid in team_ids:
            async with self.conn.execute(
                "SELECT id, name, icon FROM teams WHERE id = ?", (tid,)
            ) as cur:
                t_row = await cur.fetchone()
            if not t_row:
                continue
            async with self.conn.execute(
                """
                SELECT id, team_id, fio, position, tg_user_id, is_foreman,
                       status, status_from, status_until, status_reason
                FROM team_members
                WHERE team_id = ?
                ORDER BY is_foreman DESC, fio
                """,
                (tid,),
            ) as cur:
                members = [dict(m) for m in await cur.fetchall()]

            if selected_ids:
                members = [m for m in members if m['id'] in selected_ids]

            teams.append({
                'id': t_row['id'],
                'name': t_row['name'],
                'icon': t_row['icon'] or '',
                'members': members,
            })
        return teams

    async def get_user_team_ids(self, tg_user_id: int) -> list[int]:
        """Team ids this user belongs to (for brigadier scope checks)."""
        async with self.conn.execute(
            "SELECT DISTINCT team_id FROM team_members WHERE tg_user_id = ?",
            (tg_user_id,),
        ) as cur:
            return [r[0] for r in await cur.fetchall() if r[0] is not None]

    async def get_adhoc_candidate_members(self, exclude_member_ids: set[int] | None = None) -> list[dict]:
        """v2.7 — candidate workers for the foreman's "add ad-hoc worker" picker.

        Returns every ``team_members`` row that belongs to a brigade,
        excluding people already present in the SMR (``exclude_member_ids``,
        which are ``team_members.id`` values) and excluding drivers /
        superadmins by the linked ``users`` role. Members with no linked
        account are kept — they are plain brigade staff with no role to
        veto. ``member_id`` is what the hours payload calls ``user_id``.
        """
        exclude = {int(x) for x in (exclude_member_ids or set())}
        async with self.conn.execute(
            """
            SELECT tm.id            AS member_id,
                   tm.team_id       AS team_id,
                   tm.fio           AS fio,
                   tm.position      AS specialty,
                   tm.tg_user_id    AS user_id,
                   tm.is_foreman    AS is_foreman,
                   tm.status        AS status,
                   t.name           AS team_name,
                   t.icon           AS team_icon,
                   u.role           AS role
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            LEFT JOIN users u ON u.user_id = tm.tg_user_id
            WHERE (u.role IS NULL OR u.role NOT IN ('superadmin', 'driver'))
              AND (u.is_blacklisted IS NULL OR u.is_blacklisted = 0)
            ORDER BY t.name, tm.is_foreman DESC, tm.fio
            """
        ) as cur:
            rows = [dict(r) for r in await cur.fetchall()]
        return [r for r in rows if int(r['member_id']) not in exclude]

    async def member_belongs_to_team(self, member_id: int, team_id: int) -> bool:
        """True when ``member_id`` is a real ``team_members`` row of ``team_id``.

        Used to validate a foreman-supplied ad-hoc worker before it is
        written into ``application_hours`` — keeps junk (team/member
        mismatch, deleted member) out of the SMR.
        """
        async with self.conn.execute(
            "SELECT 1 FROM team_members WHERE id = ? AND team_id = ? LIMIT 1",
            (int(member_id), int(team_id)),
        ) as cur:
            return await cur.fetchone() is not None

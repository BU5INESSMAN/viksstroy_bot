"""Persistence helpers for append-only SMR audit and price-list versions."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime
from typing import Any

from smr_audit import canonical_json, payload_hash


def _json_load(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return fallback


class SmrAuditRepoMixin:
    async def append_smr_financial_audit(
        self,
        *,
        application_id: int,
        primary_application_id: int,
        application_ids: list[int],
        event_type: str,
        actor_user_id: int | None,
        actor_role: str,
        actor_name: str,
        source: str,
        reason: str,
        before_snapshot: dict,
        after_snapshot: dict,
        diff: list[dict],
        metadata: dict,
    ) -> dict:
        if not str(event_type or "").strip():
            raise ValueError("event_type is required for an SMR audit entry")
        async with self.conn.execute(
            "SELECT id FROM kp_catalog_versions WHERE status='active' ORDER BY version_number DESC LIMIT 1"
        ) as cur:
            version = await cur.fetchone()
        version_id = int(version[0]) if version else None
        values = (
            int(application_id), int(primary_application_id), canonical_json(application_ids),
            str(event_type).strip(), actor_user_id, actor_role or "", actor_name or "",
            source or "", reason or "", canonical_json(before_snapshot),
            canonical_json(after_snapshot), canonical_json(diff), payload_hash(before_snapshot),
            payload_hash(after_snapshot), version_id, canonical_json(metadata),
        )
        cursor = await self.conn.execute(
            """INSERT INTO smr_financial_audit
               (application_id, primary_application_id, application_ids_json, event_type,
                actor_user_id, actor_role, actor_name, source, reason,
                before_snapshot_json, after_snapshot_json, diff_json, before_hash,
                after_hash, kp_catalog_version_id, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            values,
        )
        await self.conn.commit()
        return await self.get_smr_financial_audit_entry(int(cursor.lastrowid))

    async def get_smr_financial_audit_entry(self, audit_id: int) -> dict | None:
        async with self.conn.execute(
            "SELECT * FROM smr_financial_audit WHERE id=?", (int(audit_id),)
        ) as cur:
            row = await cur.fetchone()
        return self._decode_smr_audit_row(row) if row else None

    async def list_smr_financial_history(
        self, app_id: int, *, limit: int = 100, before_id: int | None = None
    ) -> list[dict]:
        # Resolve any member of a merged report to its current primary id, but
        # also match application_ids_json so entries survive later regrouping.
        from smr_data import logical_smr_app_ids

        ids = await logical_smr_app_ids(self, int(app_id)) or [int(app_id)]
        marks = ",".join("?" * len(ids))
        clauses = [
            f"(primary_application_id IN ({marks}) OR application_id IN ({marks}) "
            f"OR EXISTS (SELECT 1 FROM json_each(application_ids_json) j "
            f"WHERE CAST(j.value AS INTEGER) IN ({marks})))"
        ]
        params: list[Any] = [*ids, *ids, *ids]
        if before_id is not None:
            clauses.append("id < ?")
            params.append(int(before_id))
        safe_limit = max(1, min(int(limit), 500))
        params.append(safe_limit)
        async with self.conn.execute(
            f"SELECT * FROM smr_financial_audit WHERE {' AND '.join(clauses)} "
            "ORDER BY id DESC LIMIT ?",
            tuple(params),
        ) as cur:
            rows = await cur.fetchall()
        return [self._decode_smr_audit_row(row) for row in rows]

    @staticmethod
    def _decode_smr_audit_row(row) -> dict:
        item = dict(row)
        for source, target, fallback in (
            ("application_ids_json", "application_ids", []),
            ("before_snapshot_json", "before_snapshot", {}),
            ("after_snapshot_json", "after_snapshot", {}),
            ("diff_json", "diff", []),
            ("metadata_json", "metadata", {}),
        ):
            item[target] = _json_load(item.pop(source, None), fallback)
        return item

    async def create_kp_catalog_version(
        self,
        *,
        source_file: str = "",
        source_content: bytes | None = None,
        imported_by_user_id: int | None = None,
        imported_by_name: str = "",
        status: str = "active",
        notes: str = "",
    ) -> dict:
        """Append a full snapshot of the currently active KP catalog."""
        async with self.conn.execute(
            """SELECT id, category, name, unit, coefficient, salary, price, old_salary
               FROM kp_catalog ORDER BY category, name, id"""
        ) as cur:
            rows = [dict(row) for row in await cur.fetchall()]
        if not rows:
            raise ValueError("cannot version an empty KP catalog")

        normalized = [
            {
                "kp_id": row.get("id"), "category": row.get("category") or "",
                "name": row.get("name") or "", "unit": row.get("unit") or "",
                "coefficient": row.get("coefficient") or 0,
                "salary": row.get("salary") or 0, "price": row.get("price") or 0,
                "old_salary": row.get("old_salary") or 0,
            }
            for row in rows
        ]
        if source_content is not None:
            source_hash = hashlib.sha256(source_content).hexdigest()
        elif source_file and os.path.isfile(source_file):
            digest = hashlib.sha256()
            with open(source_file, "rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            source_hash = digest.hexdigest()
        else:
            source_hash = ""

        async with self.conn.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM kp_catalog_versions"
        ) as cur:
            version_number = int((await cur.fetchone())[0])
        now = datetime.now().isoformat(timespec="seconds")
        await self.conn.execute("SAVEPOINT kp_catalog_version")
        try:
            cursor = await self.conn.execute(
                """INSERT INTO kp_catalog_versions
                   (version_number, source_file, source_hash, catalog_hash,
                    imported_by_user_id, imported_by_name, row_count, status, notes, activated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    version_number, os.path.basename(source_file or ""), source_hash,
                    payload_hash(normalized), imported_by_user_id, imported_by_name or "",
                    len(normalized), status or "active", notes or "",
                    now if status == "active" else None,
                ),
            )
            version_id = int(cursor.lastrowid)
            await self.conn.executemany(
                """INSERT INTO kp_catalog_version_items
                   (version_id, kp_id, category, name, unit, coefficient, salary, price, old_salary)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        version_id, row["kp_id"], row["category"], row["name"], row["unit"],
                        row["coefficient"], row["salary"], row["price"], row["old_salary"],
                    )
                    for row in normalized
                ],
            )
            await self.conn.execute("RELEASE SAVEPOINT kp_catalog_version")
            await self.conn.commit()
        except Exception:
            await self.conn.execute("ROLLBACK TO SAVEPOINT kp_catalog_version")
            await self.conn.execute("RELEASE SAVEPOINT kp_catalog_version")
            raise
        return await self.get_kp_catalog_version(version_id, include_items=False)

    async def list_kp_catalog_versions(self, *, limit: int = 100) -> list[dict]:
        safe_limit = max(1, min(int(limit), 500))
        async with self.conn.execute(
            "SELECT * FROM kp_catalog_versions ORDER BY version_number DESC LIMIT ?",
            (safe_limit,),
        ) as cur:
            return [dict(row) for row in await cur.fetchall()]

    async def get_kp_catalog_version(
        self, version_id: int, *, include_items: bool = True
    ) -> dict | None:
        async with self.conn.execute(
            "SELECT * FROM kp_catalog_versions WHERE id=?", (int(version_id),)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        result = dict(row)
        if include_items:
            async with self.conn.execute(
                """SELECT kp_id, category, name, unit, coefficient, salary, price, old_salary
                   FROM kp_catalog_version_items WHERE version_id=?
                   ORDER BY category, name, id""",
                (int(version_id),),
            ) as cur:
                result["items"] = [dict(item) for item in await cur.fetchall()]
        return result

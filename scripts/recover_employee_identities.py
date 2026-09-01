"""Recover deleted brigade-member names from SQLite backups.

Dry-run is the default. Pass --apply only after the employee identity migration
has created employee_identities and employee_identity_members.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sqlite3


def normalize(value: str) -> str:
    return re.sub(r"[^а-яёa-z0-9]+", " ", value.casefold()).strip()


def recover(backups: str, member_ids: list[int]) -> dict[int, dict]:
    found: dict[int, dict] = {}
    for path in sorted(glob.glob(backups), reverse=True):
        try:
            with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as conn:
                columns = {row[1] for row in conn.execute("PRAGMA table_info(team_members)")}
                if not {"id", "fio", "position", "team_id"}.issubset(columns):
                    continue
                pending = [member_id for member_id in member_ids if member_id not in found]
                if not pending:
                    break
                marks = ",".join("?" for _ in pending)
                for row in conn.execute(
                    f"SELECT id,team_id,fio,position FROM team_members WHERE id IN ({marks})",
                    pending,
                ):
                    fio = re.sub(r"\s+", " ", str(row[2] or "").strip())
                    if fio:
                        found[int(row[0])] = {
                            "fio": fio,
                            "position": str(row[3] or "").strip(),
                            "team_id": row[1],
                            "backup": os.path.basename(path),
                        }
        except sqlite3.Error:
            continue
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="data/viksstroy.db")
    parser.add_argument("--backups", default="data/backups/*.db")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with sqlite3.connect(args.db) as conn:
        conn.row_factory = sqlite3.Row
        unresolved = conn.execute(
            """
            SELECT eim.member_id,eim.identity_id
            FROM employee_identity_members eim
            JOIN employee_identities ei ON ei.id=eim.identity_id
            WHERE ei.status='unresolved'
            ORDER BY eim.member_id
            """
        ).fetchall()
        recovered = recover(args.backups, [int(row["member_id"]) for row in unresolved])
        report = []
        for row in unresolved:
            member_id = int(row["member_id"])
            item = recovered.get(member_id)
            report.append({"member_id": member_id, "identity_id": int(row["identity_id"]), **(item or {"fio": None})})
            if args.apply and item:
                conn.execute(
                    """
                    UPDATE employee_identities
                    SET canonical_fio=?,normalized_fio=?,position=?,status='active',
                        notes=CASE WHEN notes='' THEN ? ELSE notes END,
                        updated_at=datetime('now','localtime')
                    WHERE id=?
                    """,
                    (item["fio"], normalize(item["fio"]), item["position"], f"Восстановлено из {item['backup']}", row["identity_id"]),
                )
                conn.execute(
                    """
                    UPDATE employee_identity_members
                    SET source_fio=?,source_position=?,source_team_id=COALESCE(source_team_id,?),
                        source='backup',updated_at=datetime('now','localtime')
                    WHERE member_id=?
                    """,
                    (item["fio"], item["position"], item["team_id"], member_id),
                )
        if args.apply:
            conn.commit()
        print(json.dumps({"apply": args.apply, "recovered": len(recovered), "items": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

"""Actionable data-quality and workflow issues for the office dashboard."""

from __future__ import annotations

import logging
from urllib.parse import quote

from services.role_passwords import get_role_passwords


logger = logging.getLogger(__name__)

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


async def _rows(db, sql: str, params=()) -> list[dict]:
    async with db.conn.execute(sql, params) as cur:
        columns = [column[0] for column in cur.description]
        return [dict(zip(columns, row)) for row in await cur.fetchall()]


async def _scalar(db, sql: str, params=()) -> int:
    async with db.conn.execute(sql, params) as cur:
        row = await cur.fetchone()
    return int(row[0] or 0) if row else 0


def _item(item_id: str, title: str, description: str, url: str, *,
          count: int = 1, severity: str = "warning", kind: str = "data") -> dict:
    return {
        "id": item_id,
        "kind": kind,
        "severity": severity,
        "title": title,
        "description": description,
        "count": max(1, int(count or 1)),
        "url": url,
    }


async def collect_action_items(db, role: str) -> dict:
    """Return every known office action with a direct correction route.

    Collectors are isolated so one legacy/missing column cannot hide all the
    other issues from the dashboard during a rolling database upgrade.
    """
    items: list[dict] = []

    async def safely(name: str, collector) -> None:
        try:
            await collector()
        except Exception as exc:  # pragma: no cover - defensive for old DBs
            logger.warning("action-items collector %s failed: %s", name, exc)

    async def workflow() -> None:
        waiting = await _scalar(
            db,
            "SELECT COUNT(*) FROM applications WHERE status='waiting' "
            "AND COALESCE(is_archived,0)=0",
        )
        if waiting:
            items.append(_item(
                "applications-waiting", "Заявки ждут проверки",
                "Откройте новые заявки и примите решение.",
                "/review?filter=waiting", count=waiting, severity="critical", kind="workflow",
            ))

        pending_smr = await _scalar(
            db,
            "SELECT COUNT(DISTINCT CASE WHEN COALESCE(smr_group_id,'')!='' "
            "THEN smr_group_id ELSE 'app:' || id END) FROM applications "
            "WHERE COALESCE(kp_archived,0)=0 "
            "AND (smr_status='pending_review' OR kp_status='submitted')",
        )
        if pending_smr:
            items.append(_item(
                "smr-pending", "СМР ждут проверки",
                "Проверьте часы, объёмы и дополнительные работы.",
                "/kp?tab=pending_review", count=pending_smr, severity="critical", kind="workflow",
            ))

        unaccounted = await _scalar(
            db,
            "SELECT COUNT(DISTINCT CASE WHEN COALESCE(smr_group_id,'')!='' "
            "THEN smr_group_id ELSE 'app:' || id END) FROM applications "
            "WHERE COALESCE(kp_archived,0)=0 AND smr_accounted_at IS NULL "
            "AND (smr_status='approved' OR kp_status='approved')",
        )
        if unaccounted:
            items.append(_item(
                "smr-unaccounted", "Готовые СМР не учтены",
                "Отметьте отчёты, уже перенесённые в отдельную программу.",
                "/kp?tab=approved", count=unaccounted, kind="workflow",
            ))

        requests = await _scalar(
            db, "SELECT COUNT(*) FROM object_requests WHERE status='pending'",
        )
        if requests:
            items.append(_item(
                "object-requests", "Запросы на создание объектов",
                "Прорабы ожидают решения по новым объектам.",
                "/objects?tab=requests", count=requests, severity="critical", kind="workflow",
            ))

    async def teams() -> None:
        rows = await _rows(
            db,
            """SELECT t.id,t.name,COUNT(tm.id) AS member_count,
                      SUM(CASE WHEN tm.is_foreman=1 THEN 1 ELSE 0 END) AS brigadiers,
                      SUM(CASE WHEN tm.id IS NOT NULL AND TRIM(COALESCE(tm.position,''))='' THEN 1 ELSE 0 END) AS missing_positions,
                      SUM(CASE WHEN tm.id IS NOT NULL AND tm.tg_user_id IS NULL THEN 1 ELSE 0 END) AS unlinked
                 FROM teams t LEFT JOIN team_members tm ON tm.team_id=t.id
                GROUP BY t.id,t.name ORDER BY t.name""",
        )
        for team in rows:
            problems: list[str] = []
            issue_count = 0
            if not int(team.get("member_count") or 0):
                problems.append("нет участников")
                issue_count += 1
            if not int(team.get("brigadiers") or 0):
                problems.append("не назначен бригадир")
                issue_count += 1
            missing_positions = int(team.get("missing_positions") or 0)
            if missing_positions:
                problems.append(f"без должности: {missing_positions}")
                issue_count += missing_positions
            unlinked = int(team.get("unlinked") or 0)
            if unlinked:
                problems.append(f"без MAX: {unlinked}")
                issue_count += unlinked
            if problems:
                team_id = int(team["id"])
                items.append(_item(
                    f"team-{team_id}", f"Бригада «{team.get('name') or team_id}»",
                    "; ".join(problems).capitalize() + ".",
                    f"/resources?tab=teams&team_id={team_id}", count=issue_count,
                    severity="critical" if not int(team.get("brigadiers") or 0) else "warning",
                    kind="team",
                ))

    async def objects() -> None:
        rows = await _rows(
            db,
            """SELECT o.id,o.name,o.address,
                      CASE WHEN EXISTS(SELECT 1 FROM object_kp_plan okp WHERE okp.object_id=o.id) THEN 1 ELSE 0 END AS has_plan
                 FROM objects o WHERE COALESCE(o.is_archived,0)=0 ORDER BY o.name""",
        )
        for obj in rows:
            problems: list[str] = []
            if not str(obj.get("address") or "").strip():
                problems.append("не указан адрес")
            if not int(obj.get("has_plan") or 0):
                problems.append("не заполнен план СМР")
            if problems:
                object_id = int(obj["id"])
                tab = "kp" if not int(obj.get("has_plan") or 0) else "info"
                items.append(_item(
                    f"object-{object_id}", f"Объект «{obj.get('name') or object_id}»",
                    "; ".join(problems).capitalize() + ".",
                    f"/objects?object_id={object_id}&object_tab={tab}", count=len(problems), kind="object",
                ))

    async def equipment() -> None:
        rows = await _rows(
            db,
            "SELECT id,name,category,license_plate,default_driver_user_id FROM equipment "
            "WHERE COALESCE(is_active,1)=1 ORDER BY category,name",
        )
        for equipment in rows:
            problems: list[str] = []
            if not str(equipment.get("name") or "").strip():
                problems.append("нет названия")
            if not str(equipment.get("category") or "").strip():
                problems.append("нет категории")
            if not str(equipment.get("license_plate") or "").strip():
                problems.append("нет госномера")
            if equipment.get("default_driver_user_id") is None:
                problems.append("не назначен водитель")
            if problems:
                equipment_id = int(equipment["id"])
                search = quote(str(equipment.get("name") or equipment_id))
                items.append(_item(
                    f"equipment-{equipment_id}",
                    f"Техника «{equipment.get('name') or f'#{equipment_id}'}»",
                    "; ".join(problems).capitalize() + ".",
                    f"/resources?tab=equipment&q={search}", count=len(problems), kind="equipment",
                ))

    async def users() -> None:
        if role in {"boss", "superadmin"}:
            missing_roles = await _scalar(
                db,
                "SELECT COUNT(*) FROM users WHERE TRIM(COALESCE(role,''))='' "
                "AND COALESCE(is_deleted,0)=0",
            )
            if missing_roles:
                items.append(_item(
                    "users-no-role", "Пользователи без роли",
                    "Назначьте права доступа каждому аккаунту.",
                    "/admin?section=users&filter=missing-role", count=missing_roles,
                    severity="critical", kind="user",
                ))

        drivers_without_category = await _scalar(
            db,
            "SELECT COUNT(*) FROM users u WHERE u.role='driver' "
            "AND COALESCE(u.is_blacklisted,0)=0 AND COALESCE(u.is_deleted,0)=0 "
            "AND NOT EXISTS(SELECT 1 FROM driver_categories dc WHERE dc.user_id=u.user_id)",
        )
        if drivers_without_category:
            items.append(_item(
                "drivers-no-category", "У водителей не указаны категории",
                "Без категории система не сможет корректно предлагать технику.",
                "/resources?tab=drivers", count=drivers_without_category, kind="user",
            ))

        drivers_without_max = await _scalar(
            db,
            "SELECT COUNT(*) FROM users u WHERE u.role='driver' "
            "AND COALESCE(u.is_blacklisted,0)=0 AND COALESCE(u.is_deleted,0)=0 "
            "AND COALESCE(u.is_active,0)=0",
        )
        if drivers_without_max:
            items.append(_item(
                "drivers-no-max", "Водители ожидают привязки MAX",
                "Отправьте водителям ссылку или попросите войти по общему паролю.",
                "/resources?tab=drivers&q=без%20MAX", count=drivers_without_max,
                severity="info", kind="user",
            ))

        if role == "superadmin":
            passwords = await get_role_passwords(db)
            missing = sum(not str(password or "").strip() for password in passwords.values())
            if missing:
                items.append(_item(
                    "role-passwords", "Не заданы пароли ролей",
                    "Заполните общие пароли для регистрации сотрудников.",
                    "/admin?section=role-passwords", count=missing, kind="system",
                ))

    for name, collector in (
        ("workflow", workflow), ("teams", teams), ("objects", objects),
        ("equipment", equipment), ("users", users),
    ):
        await safely(name, collector)

    items.sort(key=lambda item: (
        SEVERITY_ORDER.get(item["severity"], 9), item["title"].casefold(), item["id"],
    ))
    return {
        "total": sum(int(item["count"]) for item in items),
        "groups": len(items),
        "items": items,
    }

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
          count: int = 1, severity: str = "warning", kind: str = "data",
          issue_key: str | None = None, issue_title: str | None = None) -> dict:
    return {
        "id": item_id,
        "kind": kind,
        "severity": severity,
        "title": title,
        "description": description,
        "count": max(1, int(count or 1)),
        "url": url,
        "issue_key": issue_key or item_id,
        "issue_title": issue_title or title,
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
            team_id = int(team["id"])
            team_title = f"Бригада «{team.get('name') or team_id}»"
            url = f"/resources?tab=teams&team_id={team_id}"
            if not int(team.get("member_count") or 0):
                items.append(_item(
                    f"team-{team_id}-empty", team_title,
                    "Добавьте участников в состав бригады.", url,
                    severity="critical", kind="team",
                    issue_key="team-empty", issue_title="В бригаде нет участников",
                ))
            if not int(team.get("brigadiers") or 0):
                items.append(_item(
                    f"team-{team_id}-no-brigadier", team_title,
                    "Назначьте одного из участников бригадиром.", url,
                    severity="critical", kind="team",
                    issue_key="team-no-brigadier", issue_title="Не назначен бригадир",
                ))
            missing_positions = int(team.get("missing_positions") or 0)
            if missing_positions:
                items.append(_item(
                    f"team-{team_id}-positions", team_title,
                    f"Не указана должность у сотрудников: {missing_positions}.", url,
                    count=missing_positions, kind="team",
                    issue_key="team-missing-position", issue_title="Не указана должность",
                ))
            unlinked = int(team.get("unlinked") or 0)
            if unlinked:
                items.append(_item(
                    f"team-{team_id}-max", team_title,
                    f"Не привязан аккаунт MAX у сотрудников: {unlinked}. Им недоступны личные уведомления и вход через MAX.",
                    url, count=unlinked, kind="team",
                    issue_key="team-max-unlinked", issue_title="Не привязан аккаунт MAX",
                ))

    async def objects() -> None:
        rows = await _rows(
            db,
            """SELECT o.id,o.name,o.address,
                      CASE WHEN EXISTS(SELECT 1 FROM object_kp_plan okp WHERE okp.object_id=o.id) THEN 1 ELSE 0 END AS has_plan
                 FROM objects o WHERE COALESCE(o.is_archived,0)=0 ORDER BY o.name""",
        )
        for obj in rows:
            object_id = int(obj["id"])
            object_title = f"Объект «{obj.get('name') or object_id}»"
            if not str(obj.get("address") or "").strip():
                items.append(_item(
                    f"object-{object_id}-address", object_title,
                    "Укажите адрес объекта.",
                    f"/objects?object_id={object_id}&object_tab=info", kind="object",
                    issue_key="object-no-address", issue_title="Не указан адрес объекта",
                ))
            if not int(obj.get("has_plan") or 0):
                items.append(_item(
                    f"object-{object_id}-plan", object_title,
                    "Заполните план работ СМР.",
                    f"/objects?object_id={object_id}&object_tab=kp", kind="object",
                    issue_key="object-no-plan", issue_title="Не заполнен план СМР",
                ))

    async def equipment() -> None:
        rows = await _rows(
            db,
            "SELECT id,name,category,license_plate,default_driver_user_id FROM equipment "
            "WHERE COALESCE(is_active,1)=1 ORDER BY category,name",
        )
        for equipment in rows:
            equipment_id = int(equipment["id"])
            equipment_title = f"Техника «{equipment.get('name') or f'#{equipment_id}'}»"
            search = quote(str(equipment.get("name") or equipment_id))
            url = f"/resources?tab=equipment&q={search}"
            problems = (
                (not str(equipment.get("name") or "").strip(), "name", "Нет названия техники", "Укажите название техники."),
                (not str(equipment.get("category") or "").strip(), "category", "Не указана категория техники", "Выберите категорию техники."),
                (not str(equipment.get("license_plate") or "").strip(), "plate", "Не указан госномер", "Укажите государственный номер техники."),
                (equipment.get("default_driver_user_id") is None, "driver", "Не назначен водитель", "Назначьте водителя по умолчанию."),
            )
            for present, key, issue_title, description in problems:
                if present:
                    items.append(_item(
                        f"equipment-{equipment_id}-{key}", equipment_title,
                        description, url, kind="equipment",
                        issue_key=f"equipment-{key}", issue_title=issue_title,
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
        "groups": len({item["issue_key"] for item in items}),
        "items": items,
    }

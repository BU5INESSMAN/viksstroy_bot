"""
AI Context Builder — provides real-time, role-gated data for the
support AI.  Every operation is READ-ONLY.  Every DB call is wrapped
in try/except so the AI keeps working even if individual fetches fail.
"""
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("AI_CONTEXT")

ROLE_NAMES = {
    "superadmin": "Супер-Админ", "boss": "Руководитель",
    "moderator": "Модератор", "foreman": "Прораб",
    "brigadier": "Бригадир", "worker": "Рабочий", "driver": "Водитель",
}
_OFFICE = ("moderator", "boss", "superadmin")
_FOREMAN_PLUS = ("foreman", "moderator", "boss", "superadmin")
_STATUS_NAMES = {
    "waiting": "На модерации", "approved": "Одобрена",
    "published": "Опубликована", "in_progress": "В работе",
    "completed": "Завершена", "rejected": "Отклонена",
}


# ────────────────────── public entry point ──────────────────────

async def build_user_context(db, user_id: int, message: str) -> str:
    """Return a text block with live data relevant to *message*."""
    try:
        user = await db.get_user(user_id)
    except Exception:
        return ""
    if not user:
        return ""

    role = dict(user).get("role", "worker")
    fio = dict(user).get("fio", "?")

    # Resolve user's team from profile
    team_id = None
    try:
        profile = await db.get_user_full_profile(user_id)
        if profile:
            team_id = profile.get("team_id")
    except Exception:
        pass

    parts = [f"[Пользователь: {fio} | Роль: {ROLE_NAMES.get(role, role)} | ID: {user_id}]"]
    low = message.lower()

    # ── topic detection → fetch ──
    if _kw(low, "профиль роль кто_я мой_аккаунт права могу доступ"):
        parts += [await _profile(db, user_id, profile)]
    if _kw(low, "бригад команд состав кто_в участник моя_бригада"):
        parts += [await _team(db, user_id, role, team_id)]
    if _kw(low, "заявк наряд статус мои_заявки работ история"):
        parts += [await _apps(db, user_id, role)]
    if _kw(low, "техник свобод занят кран камаз экскаватор машин авто"):
        parts += [await _equip(db, role, low)]
    if _kw(low, "расписан завтра сегодня запланиров расстановк на_дату"):
        parts += [await _schedule(db, role, low)]
    if _kw(low, "код приглас ссылк инвайт"):
        parts += [await _invites(db, role, team_id)]
    if _kw(low, "куда_ехать маршрут куда_мне назначен"):
        parts += [await _driver(db, user_id, role)]
    if _kw(low, "должник отчёт отчет смр не_заполн"):
        parts += [await _debtors(db, role)]
    if _kw(low, "статистик рейтинг активност загруженн самый топ"):
        parts += [await _stats(db, role)]

    return "\n\n".join(p for p in parts if p)


# ────────────────────── helpers ──────────────────────

def _kw(text: str, keywords: str) -> bool:
    """Check if any space-separated keyword appears in text."""
    return any(k.replace("_", " ") in text for k in keywords.split())


def _date_from_text(text: str) -> str:
    """Extract 'today' or 'tomorrow' from text, default to today."""
    if "завтра" in text:
        return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    return datetime.now().strftime("%Y-%m-%d")


def _row(r) -> dict:
    """Safely convert aiosqlite.Row or dict to dict."""
    if r is None:
        return {}
    return dict(r) if not isinstance(r, dict) else r


# ────────────────────── context fetchers ──────────────────────

async def _profile(db, uid, profile) -> str:
    try:
        if not profile:
            return ""
        p = profile if isinstance(profile, dict) else _row(profile)
        return (
            "=== ПРОФИЛЬ ===\n"
            f"ФИО: {p.get('fio','?')}\n"
            f"Роль: {ROLE_NAMES.get(p.get('role',''), p.get('role','?'))}\n"
            f"Бригада: {p.get('team_name') or 'не назначена'}"
            f"{' (ID '+str(p['team_id'])+')' if p.get('team_id') else ''}\n"
            f"Должность: {p.get('position') or 'не указана'}"
        )
    except Exception as e:
        logger.warning(f"ctx profile: {e}")
        return ""


async def _team(db, uid, role, team_id) -> str:
    try:
        if team_id:
            team_row, members, _ = await db.get_team_full_data(team_id)
            lines = [f"=== БРИГАДА: {team_row.get('name','?')} (ID {team_id}) ==="]
            for m in members:
                linked = "привязан" if m.get("tg_user_id") or m.get("tg_id") else "не привязан"
                lines.append(f"  • {m.get('fio','?')} — {m.get('position','?')} [{linked}]")
            lines.append(f"Всего: {len(members)}")
            return "\n".join(lines)

        if role in _OFFICE:
            teams = await db.get_all_teams()
            if not teams:
                return "Бригад в системе нет."
            lines = [f"=== ВСЕ БРИГАДЫ ({len(teams)}) ==="]
            for t in [_row(t) for t in teams][:20]:
                lines.append(f"  • {t.get('name','?')} (ID {t.get('id','?')})")
            return "\n".join(lines)
        return ""
    except Exception as e:
        logger.warning(f"ctx team: {e}")
        return ""


async def _apps(db, uid, role) -> str:
    try:
        apps = await db.get_user_applications(uid)
        if not apps:
            return "=== МОИ ЗАЯВКИ ===\nНет заявок."
        rows = [_row(a) for a in apps]
        lines = ["=== МОИ ЗАЯВКИ (последние 10) ==="]
        for a in rows:
            st = _STATUS_NAMES.get(a.get("status",""), a.get("status","?"))
            lines.append(
                f"  #{a.get('id','?')} | {st} | {a.get('date_target','?')} | {a.get('object_address','?')}"
            )
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"ctx apps: {e}")
        return ""


async def _equip(db, role, text) -> str:
    try:
        if role not in _FOREMAN_PLUS:
            return ""
        date = _date_from_text(text)
        equipment = await db.get_all_equipment_admin()
        if not equipment:
            return ""
        free, busy = 0, 0
        lines = [f"=== ТЕХНИКА НА {date} ==="]
        for eq in [_row(e) for e in equipment if _row(e).get("is_active", 1)][:30]:
            eid = eq.get("id")
            name = eq.get("name", "?")
            cat = eq.get("category", "")
            plate = eq.get("license_plate", "")
            try:
                intervals = await db.get_equipment_busy_intervals(eid, date)
            except Exception:
                intervals = []
            if intervals:
                busy += 1
                slots = ", ".join(f"{s}-{e}" for s, e in intervals)
                lines.append(f"  🔴 {name} [{cat}] {plate} — занята: {slots}")
            else:
                free += 1
                lines.append(f"  🟢 {name} [{cat}] {plate} — свободна")
        lines.append(f"Итого: свободно {free}, занято {busy}")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"ctx equip: {e}")
        return ""


async def _schedule(db, role, text) -> str:
    try:
        if role not in _OFFICE:
            return ""
        date = _date_from_text(text)
        report = await db.get_daily_report(date)
        if not report:
            return f"=== РАСПИСАНИЕ НА {date} ===\nЗаявок нет."
        lines = [f"=== РАСПИСАНИЕ НА {date} ({len(report)} заявок) ==="]
        for item in report[:20]:
            info = item.get("info", {})
            members = item.get("members", [])
            lines.append(
                f"  #{info.get('id','?')} | {info.get('object_address','?')} | "
                f"Прораб: {info.get('foreman_fio','?')} | Люди: {', '.join(members) or '—'}"
            )
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"ctx schedule: {e}")
        return ""


async def _invites(db, role, team_id) -> str:
    try:
        if role not in _FOREMAN_PLUS:
            return ""
        lines = ["=== ПРИГЛАСИТЕЛЬНЫЕ КОДЫ ==="]
        if team_id:
            try:
                code, pwd = await db.get_or_create_team_invite(team_id)
                lines.append(f"Моя бригада (ID {team_id}): код {code}, пароль {pwd}")
                lines.append(f"  Ссылка: https://miniapp.viks22.ru/invite/{code}")
            except Exception:
                pass
        if role in _OFFICE:
            teams = await db.get_all_teams()
            if teams:
                lines.append("Все бригады:")
                for t in [_row(t) for t in teams][:15]:
                    try:
                        c, p = await db.get_or_create_team_invite(t["id"])
                        lines.append(f"  {t.get('name','?')}: {c} (пароль {p})")
                    except Exception:
                        pass
        return "\n".join(lines) if len(lines) > 1 else ""
    except Exception as e:
        logger.warning(f"ctx invites: {e}")
        return ""


async def _driver(db, uid, role) -> str:
    try:
        if role not in ("driver", "worker"):
            return ""
        today = datetime.now().strftime("%Y-%m-%d")
        apps = await db.get_user_applications(uid)
        if not apps:
            return "=== МОИ НАЗНАЧЕНИЯ ===\nНет назначений."
        upcoming = [
            _row(a) for a in apps
            if _row(a).get("date_target", "") >= today
            and _row(a).get("status") in ("approved", "published", "in_progress")
        ]
        if not upcoming:
            return "=== МОИ НАЗНАЧЕНИЯ ===\nНет предстоящих назначений."
        lines = ["=== МОИ НАЗНАЧЕНИЯ ==="]
        for a in upcoming[:5]:
            lines.append(
                f"  {a.get('date_target','?')} | {a.get('object_address','?')} | "
                f"Прораб: {a.get('foreman_name','?')}"
            )
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"ctx driver: {e}")
        return ""


async def _debtors(db, role) -> str:
    try:
        if role not in _OFFICE:
            return ""
        # Direct query — no dedicated db method, use raw SQL
        async with db.conn.execute("""
            SELECT u.fio, COUNT(a.id) as cnt,
                   MAX(CAST(julianday('now') - julianday(a.date_target) AS INTEGER)) as max_days
            FROM applications a
            JOIN users u ON a.foreman_id = u.user_id
            WHERE a.status IN ('published','in_progress','completed')
              AND (a.kp_archived = 0 OR a.kp_archived IS NULL)
              AND a.kp_status IS NULL
              AND a.date_target < date('now')
            GROUP BY a.foreman_id
            ORDER BY cnt DESC LIMIT 15
        """) as cur:
            rows = await cur.fetchall()
        if not rows:
            return "=== ДОЛЖНИКИ СМР ===\nНет должников."
        lines = ["=== ДОЛЖНИКИ СМР ==="]
        for r in rows:
            lines.append(f"  {r[0]}: {r[1]} незакрытых, просрочка до {r[2]} дн.")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"ctx debtors: {e}")
        return ""


async def _stats(db, role) -> str:
    try:
        if role not in _OFFICE:
            return ""
        s = await db.get_general_statistics()
        if not s:
            return ""
        lines = [
            "=== СТАТИСТИКА ===",
            f"Заявок сегодня: {s.get('today_total',0)} (одобрено {s.get('today_approved',0)}, отклонено {s.get('today_rejected',0)})",
            f"Ожидают публикации: {s.get('waiting_publish',0)}",
        ]
        top_f = s.get("top_foremen", [])
        if top_f:
            lines.append("Топ прорабов:")
            for f in top_f:
                lines.append(f"  {_row(f).get('fio', f[0])}: {_row(f).get('cnt', f[1])} заявок")
        top_e = s.get("top_equip", [])
        if top_e:
            lines.append("Топ техники:")
            for e in top_e:
                lines.append(f"  {_row(e).get('name', e[0])}: {_row(e).get('cnt', e[1])} назначений")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"ctx stats: {e}")
        return ""

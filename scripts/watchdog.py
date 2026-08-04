#!/usr/bin/env python3
"""External watchdog: works even when the application API is unavailable."""

from __future__ import annotations

import asyncio
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
STATE_FILE = DATA / "watchdog-state.json"
DEPLOY_FILE = DATA / "deploy-state.json"
DB_FILE = Path(os.getenv("DB_PATH", str(DATA / "viksstroy.db")))
HEALTH_URL = os.getenv("WATCHDOG_HEALTH_URL", "https://miniapp.viks22.ru/api/health")
REMIND_AFTER = int(os.getenv("WATCHDOG_REMIND_SECONDS", "3600"))


def load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def health_issues() -> list[str]:
    issues: list[str] = []
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if response.status != 200 or payload.get("status") != "ok":
                issues.append(f"API вернул состояние {payload.get('status', response.status)}")
    except Exception as exc:
        issues.append(f"API недоступен: {type(exc).__name__}: {exc}")

    try:
        result = subprocess.run(
            ["docker", "compose", "ps", "--format", "json"], cwd=ROOT,
            capture_output=True, text=True, timeout=20, check=False,
        )
        if result.returncode:
            issues.append(f"Docker Compose не отвечает: {result.stderr.strip()[:180]}")
        else:
            rows = []
            for line in result.stdout.splitlines():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
            by_service = {row.get("Service"): row for row in rows}
            for service in ("api", "bot_max"):
                row = by_service.get(service)
                state = (row or {}).get("State", "missing")
                if state != "running":
                    issues.append(f"Контейнер {service}: {state}")
    except Exception as exc:
        issues.append(f"Проверка Docker завершилась ошибкой: {exc}")

    deploy = read_json(DEPLOY_FILE, {})
    if deploy.get("status") == "running" and time.time() - float(deploy.get("started_at", 0)) > 1200:
        issues.append("Обновление системы выполняется более 20 минут")

    try:
        with sqlite3.connect(DB_FILE, timeout=5) as conn:
            row = conn.execute(
                "SELECT last_success_at FROM system_heartbeats WHERE component='scheduler'"
            ).fetchone()
            if row and row[0]:
                age = conn.execute(
                    "SELECT (julianday('now')-julianday(?))*86400", (row[0],)
                ).fetchone()[0]
                if age is not None and age > 300:
                    issues.append(f"Планировщик не подавал сигнал {int(age // 60)} мин.")
    except Exception as exc:
        issues.append(f"База данных недоступна наблюдателю: {exc}")
    return issues


def recipients(event_key: str = "system_unavailable") -> list[dict]:
    result = []
    try:
        with sqlite3.connect(DB_FILE, timeout=5) as conn:
            conn.row_factory = sqlite3.Row
            users = conn.execute(
                "SELECT user_id,notify_max,settings FROM users "
                "WHERE role='superadmin' AND is_active=1 AND is_blacklisted=0"
            ).fetchall()
            for user in users:
                try:
                    settings = json.loads(user["settings"] or "{}")
                except Exception:
                    settings = {}
                events = settings.get("notification_events") or {}
                if events.get(event_key, True) is False:
                    continue
                links = {int(user["user_id"])}
                try:
                    for row in conn.execute(
                        "SELECT primary_id,secondary_id FROM account_links "
                        "WHERE primary_id=? OR secondary_id=?", (user["user_id"], user["user_id"])
                    ):
                        links.update((int(row[0]), int(row[1])))
                except sqlite3.Error:
                    pass
                result.append({
                    "max": [abs(x) for x in links if x < 0] if user["notify_max"] and settings.get("notify_max", True) else [],
                })
    except Exception:
        fallback = [int(x) for x in os.getenv("SUPER_ADMIN_IDS", "").split(",") if x.strip().lstrip("-").isdigit()]
        if fallback:
            result.append({"max": [abs(x) for x in fallback if x < 0]})
    return result


async def send_max(chat_id: int, message: str) -> None:
    token = os.getenv("MAX_BOT_TOKEN", "")
    if not token:
        return
    from maxapi import Bot
    bot = Bot(token=token)
    try:
        await bot.send_message(chat_id=chat_id, text=message)
    finally:
        await bot.close_session()


def dispatch(title: str, issues: list[str], event_key: str = "system_unavailable") -> None:
    details = "\n".join(f"• {item}" for item in issues)
    message = f"🚨 {title}\n\n{details}\n\nСервер: {HEALTH_URL}"
    for recipient in recipients(event_key):
        for chat_id in recipient["max"]:
            try:
                asyncio.run(send_max(chat_id, message))
            except Exception:
                pass


def group_chat_id() -> str:
    max_chat = os.getenv("MAX_GROUP_CHAT_ID", "").strip()
    if not max_chat:
        try:
            with sqlite3.connect(DB_FILE, timeout=5) as conn:
                row = conn.execute(
                    "SELECT value FROM settings WHERE key='max_group_chat_id'"
                ).fetchone()
                max_chat = str(row[0]).strip() if row and row[0] else ""
        except Exception:
            pass
    return max_chat


def dispatch_group(title: str, details: str) -> None:
    """Send a deploy status message to the operational group chats only."""
    message = f"{title}\n\n{details}"
    max_chat = group_chat_id()
    if max_chat:
        try:
            asyncio.run(send_max(int(max_chat), message))
        except Exception:
            pass


def main() -> int:
    global DB_FILE, HEALTH_URL, REMIND_AFTER
    load_env()
    DB_FILE = Path(os.getenv("DB_PATH", str(DATA / "viksstroy.db")))
    HEALTH_URL = os.getenv("WATCHDOG_HEALTH_URL", "https://miniapp.viks22.ru/api/health")
    REMIND_AFTER = int(os.getenv("WATCHDOG_REMIND_SECONDS", "3600"))
    parser = argparse.ArgumentParser()
    parser.add_argument("--notify", metavar="EVENT")
    parser.add_argument("--title", default="Системное событие")
    parser.add_argument("--details", default="")
    parser.add_argument("--group", action="store_true")
    args = parser.parse_args()
    if args.group:
        dispatch_group(args.title, args.details or args.notify or "Обновление состояния")
        return 0
    if args.notify:
        dispatch(args.title, [args.details or args.notify], args.notify)
        return 0
    DATA.mkdir(parents=True, exist_ok=True)
    previous = read_json(STATE_FILE, {"failed": False, "last_sent": 0})
    issues = health_issues()
    now = int(time.time())
    failed = bool(issues)
    if failed and (not previous.get("failed") or now - int(previous.get("last_sent", 0)) >= REMIND_AFTER):
        dispatch("Сбой системы", issues, "system_unavailable")
        last_sent = now
    elif not failed and previous.get("failed"):
        dispatch("Работа системы восстановлена", ["Все автоматические проверки снова проходят успешно"], "system_recovered")
        last_sent = now
    else:
        last_sent = int(previous.get("last_sent", 0))
    STATE_FILE.write_text(json.dumps({"failed": failed, "issues": issues, "checked_at": now, "last_sent": last_sent}, ensure_ascii=False), encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

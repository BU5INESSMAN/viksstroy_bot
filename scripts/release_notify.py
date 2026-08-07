#!/usr/bin/env python3
"""Send one explicitly requested MAX release notification per deploy event."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

try:
    from scripts import watchdog
except ImportError:  # Direct execution: python scripts/release_notify.py
    import watchdog


STATE_FILE = watchdog.DATA / "release-notifications.json"
LOCK_FILE = watchdog.DATA / "release-notifications.lock"


def _message(event: str, version: str, changes: str) -> str:
    if event == "started":
        return f"Началось обновление до версии {version}"
    return f"Обновление завершено. Что нового: {changes}"


def _read_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"delivered": []}


def _write_state(state: dict) -> None:
    temporary = STATE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(STATE_FILE)


def main() -> int:
    import fcntl

    parser = argparse.ArgumentParser()
    parser.add_argument("--event", choices=("started", "completed"), required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--changes", default="исправления и улучшения системы")
    parser.add_argument("--deployment-id", required=True)
    args = parser.parse_args()

    watchdog.load_env()
    watchdog.DB_FILE = Path(os.getenv("DB_PATH", str(watchdog.DATA / "viksstroy.db")))
    watchdog.DATA.mkdir(parents=True, exist_ok=True)

    delivery_key = f"{args.deployment_id}:{args.event}"
    with LOCK_FILE.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        state = _read_state()
        delivered = set(state.get("delivered") or [])
        if delivery_key in delivered:
            print(f"MAX release notification already delivered: {delivery_key}")
            return 0

        try:
            watchdog.dispatch_group(_message(args.event, args.version, args.changes), "")
        except Exception as exc:
            print(f"MAX release notification failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 2

        delivered.add(delivery_key)
        state["delivered"] = sorted(delivered)[-100:]
        _write_state(state)
        print(f"MAX release notification delivered once: {delivery_key}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

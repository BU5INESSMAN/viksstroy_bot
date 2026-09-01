"""Read-only periodic product-audit report for a 2–90 day review window."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "web")]
from services.product_audit import build_insights


def report(path: Path, days: int) -> dict:
    with sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_audit_events'").fetchone()
        if not exists:
            raise RuntimeError("product_audit_events ещё не создана: сначала примените миграцию")
        threshold = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        rows = [dict(row) for row in conn.execute(
            "SELECT * FROM product_audit_events WHERE occurred_at>=? ORDER BY occurred_at,id", (threshold,)
        )]
    by_user = defaultdict(list)
    for row in rows:
        by_user[row.get("user_id") or f"anon:{row.get('session_hash') or 'unknown'}"].append(row)
    aborted = Counter()
    for events in by_user.values():
        for left, right in zip(events, events[1:]):
            if left.get("event_name") == "form_submit" and right.get("outcome") in {"error", "rejected"}:
                aborted[left.get("page") or left.get("element") or "—"] += 1
    return {
        "generated_at": datetime.now().isoformat(), "days": days, "events": len(rows),
        "users": len({row["user_id"] for row in rows if row.get("user_id") is not None}),
        "errors": sum(row.get("outcome") == "error" for row in rows),
        "rejected": sum(row.get("outcome") == "rejected" for row in rows),
        "top_pages": Counter(row.get("page") or "—" for row in rows if row.get("event_name") == "page_view").most_common(15),
        "top_actions": Counter(row.get("element") or "—" for row in rows if row.get("event_name") == "click").most_common(20),
        "form_failures": aborted.most_common(10), "insights": build_insights(rows),
    }


def markdown(data: dict) -> str:
    lines = [f"# Анализ журнала ВИКС за {data['days']} дней", "", f"Сформирован: {data['generated_at']}", "",
             f"Событий: **{data['events']}**, пользователей: **{data['users']}**, ошибок: **{data['errors']}**, отказов: **{data['rejected']}**.", "", "## Кандидаты на улучшение", ""]
    if not data["insights"]: lines.append("Недостаточно повторяющихся сигналов для рекомендации.")
    for item in data["insights"]: lines.append(f"- **{item['title']}** — {item['count']}. {item['recommendation']}")
    lines.extend(["", "## Частые страницы", ""] + [f"- `{name}` — {count}" for name, count in data["top_pages"]])
    lines.extend(["", "## Частые действия", ""] + [f"- `{name}` — {count}" for name, count in data["top_actions"]])
    lines.extend(["", "## Формы, после которых возникал отказ", ""] + [f"- `{name}` — {count}" for name, count in data["form_failures"]])
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default="data/viksstroy.db")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--output")
    args = parser.parse_args(); data = report(Path(args.database).resolve(), max(1, min(args.days, 90)))
    text = json.dumps(data, ensure_ascii=False, indent=2) if args.format == "json" else markdown(data)
    if args.output: Path(args.output).write_text(text, encoding="utf-8")
    else: print(text)

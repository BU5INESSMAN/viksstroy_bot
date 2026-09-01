"""Safe normalization and analysis for the product diagnostics journal."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import re
import uuid
from urllib.parse import urlsplit

SECRET_KEYS = re.compile(r"pass|password|token|secret|cookie|authorization|credential|code|key", re.I)
SAFE_OUTCOMES = {"info", "success", "rejected", "error", "abandoned"}
SAFE_SEVERITIES = {"debug", "info", "warning", "error", "critical"}
SAFE_SOURCES = {"client", "server", "system", "maintenance"}


def _text(value, limit=500) -> str:
    return str(value or "").replace("\x00", "")[:limit]


def safe_route(value) -> str:
    raw = _text(value, 500)
    try:
        path = urlsplit(raw).path
    except Exception:
        path = raw.split("?", 1)[0]
    path = re.sub(r"/(invite|equip-invite|driver-invite)/(?!(?:join|redeem)(?:/|$))[^/]+", r"/\1/[код]", path, flags=re.I)
    path = re.sub(r"/(drivers|equipment)/invite/(?!(?:join|redeem)(?:/|$))[^/]+", r"/\1/invite/[код]", path, flags=re.I)
    return path[:300]


def sanitize(value, *, key="", depth=0):
    """Keep useful structure while removing field values likely to contain secrets."""
    if SECRET_KEYS.search(str(key)):
        return "[скрыто]"
    if depth > 4:
        return "[ограничено]"
    if isinstance(value, dict):
        return {str(k)[:80]: sanitize(v, key=str(k), depth=depth + 1) for k, v in list(value.items())[:50]}
    if isinstance(value, list):
        return [sanitize(v, depth=depth + 1) for v in value[:30]]
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value if abs(value) < 10**15 else 0
    text = _text(value, 1000)
    text = re.sub(r"(?i)bearer\s+[a-z0-9._~+/=-]+", "Bearer [скрыто]", text)
    text = re.sub(r"([?&](?:token|code|key|secret|password)=)[^&#\s]+", r"\1[скрыто]", text, flags=re.I)
    text = re.sub(r"(?i)((?:password|token|secret|cookie|authorization|credential|access[_-]?code|api[_-]?key)\s*[:=]\s*)[^,;\s}]+", r"\1[скрыто]", text)
    return text


def session_hash(token: str | None) -> str:
    if not token:
        return ""
    return hashlib.sha256(token.encode("utf-8", "ignore")).hexdigest()[:16]


def normalize_event(raw: dict, *, user: dict | None = None, session="", request_id="", app_version="") -> dict:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    occurred = _text(raw.get("occurred_at"), 40)
    try:
        parsed = datetime.fromisoformat(occurred.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        delta = abs((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds())
        occurred = parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z") if delta <= 86400 * 7 else now
    except Exception:
        occurred = now
    outcome = _text(raw.get("outcome"), 20).lower()
    severity = _text(raw.get("severity"), 20).lower()
    source = _text(raw.get("source"), 20).lower()
    status = raw.get("status_code")
    duration = raw.get("duration_ms")
    try: status = int(status) if status is not None else None
    except Exception: status = None
    try: duration = max(0, min(int(duration), 3_600_000)) if duration is not None else None
    except Exception: duration = None
    return {
        "event_uuid": _text(raw.get("event_uuid"), 80) or str(uuid.uuid4()),
        "occurred_at": occurred,
        "source": source if source in SAFE_SOURCES else "client",
        "category": _text(raw.get("category"), 50) or "interaction",
        "event_name": _text(raw.get("event_name"), 100) or "unknown",
        "outcome": outcome if outcome in SAFE_OUTCOMES else "info",
        "severity": severity if severity in SAFE_SEVERITIES else "info",
        "user_id": user.get("user_id") if user else None,
        "user_fio": _text(user.get("fio"), 160) if user else "",
        "user_role": _text(user.get("role"), 40) if user else "",
        "session_hash": session,
        "request_id": _text(request_id or raw.get("request_id"), 80),
        "page": safe_route(raw.get("page")),
        "route": safe_route(raw.get("route")),
        "method": _text(raw.get("method"), 10).upper(),
        "status_code": status,
        "duration_ms": duration,
        "element": _text(raw.get("element"), 240),
        "target_type": _text(raw.get("target_type"), 60),
        "target_id": _text(raw.get("target_id"), 80),
        "error_type": _text(raw.get("error_type"), 120),
        "error_message": _text(sanitize(raw.get("error_message")), 700),
        "metadata": sanitize(raw.get("metadata") or {}),
        "client": sanitize(raw.get("client") or {}),
        "app_version": _text(raw.get("app_version") or app_version, 40),
    }


def build_insights(rows: list[dict]) -> list[dict]:
    """Rule-based leads for the next manual product review; never auto-fixes data."""
    from collections import Counter, defaultdict
    insights = []
    failures = Counter()
    durations = defaultdict(list)
    friction = Counter()
    for row in rows:
        key = row.get("route") or row.get("page") or row.get("element") or row.get("event_name")
        if row.get("outcome") in {"error", "rejected"}:
            failures[key] += 1
        if row.get("duration_ms") is not None:
            durations[key].append(int(row["duration_ms"]))
        if row.get("event_name") in {"rage_click", "invalid_field", "long_field_edit", "form_abandoned"}:
            friction[f"{row.get('event_name')}: {key}"] += 1
    for key, count in failures.most_common(5):
        if count >= 2:
            insights.append({"kind": "failure", "priority": "high", "title": f"Ошибки: {key}", "count": count,
                             "recommendation": "Проверить сценарий, ответ API и понятность сообщения пользователю."})
    for key, values in sorted(durations.items(), key=lambda item: max(item[1]), reverse=True)[:5]:
        ordered = sorted(values); p95 = ordered[max(0, int(len(ordered) * .95) - 1)]
        if len(values) >= 2 and p95 >= 1500:
            insights.append({"kind": "performance", "priority": "medium", "title": f"Медленно: {key}",
                             "count": len(values), "p95_ms": p95,
                             "recommendation": "Проверить запрос, размер ответа и индикатор загрузки."})
    for key, count in friction.most_common(5):
        if count >= 2:
            insights.append({"kind": "usability", "priority": "medium", "title": key, "count": count,
                             "recommendation": "Проверить расположение кнопки, обратную связь и мобильную прокрутку."})
    return insights[:12]

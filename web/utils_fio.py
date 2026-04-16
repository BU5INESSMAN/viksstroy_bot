"""FIO and user-settings helpers.

- format_fio / parse_fio: keep the denormalized `fio` column in sync with
  the new last_name/first_name/middle_name fields.
- DEFAULT_USER_SETTINGS / get_user_settings / merge_user_settings: typed
  access to the per-user JSON blob in `users.settings`.
"""
from __future__ import annotations

import json


def format_fio(last_name: str, first_name: str, middle_name: str = '') -> str:
    parts = [p.strip() for p in [last_name, first_name, middle_name] if p and p.strip()]
    return ' '.join(parts)


def parse_fio(fio: str) -> tuple[str, str, str]:
    parts = (fio or '').strip().split()
    return (
        parts[0] if len(parts) > 0 else '',
        parts[1] if len(parts) > 1 else '',
        parts[2] if len(parts) > 2 else '',
    )


# Default notification + UI preferences. Kept in one place so frontend
# and backend agree on the shape.
DEFAULT_USER_SETTINGS = {
    "notify_telegram": True,
    "notify_max": True,
    "notify_pwa": True,
    "hide_smr_debtors": False,
    "notify_new_apps": True,
    "notify_smr_debtors": True,
    "notify_object_requests": True,
    "notify_exchanges": True,
}


def get_user_settings(settings_json: str) -> dict:
    """Return a dict with defaults filled in for any missing keys."""
    try:
        saved = json.loads(settings_json or '{}')
        if not isinstance(saved, dict):
            saved = {}
    except Exception:
        saved = {}
    return {**DEFAULT_USER_SETTINGS, **saved}


def merge_user_settings(current_json: str, patch: dict) -> str:
    """Merge `patch` into the user's current settings, return JSON string."""
    current = get_user_settings(current_json)
    if patch:
        current.update(patch)
    return json.dumps(current, ensure_ascii=False)

"""Notification event catalog, role defaults and per-user subscriptions."""

from __future__ import annotations


EVENTS = {
    # Applications
    "app_new": ("Заявки", "Новая заявка", {"moderator", "boss", "superadmin"}),
    "app_backdated": ("Заявки", "Заявка за вчера только для СМР", {"foreman", "moderator", "boss", "superadmin"}),
    "app_edited": ("Заявки", "Заявка изменена прорабом", {"moderator", "boss", "superadmin"}),
    "app_edited_by_moderator": ("Заявки", "Модератор изменил мою заявку", {"foreman"}),
    "app_approved": ("Заявки", "Заявка одобрена", {"foreman"}),
    "app_rejected": ("Заявки", "Заявка отклонена", {"foreman"}),
    "app_status_changed": ("Заявки", "Изменился статус заявки", {"foreman", "moderator", "boss", "superadmin"}),
    "app_assignment": ("Заявки", "Назначение в наряд", {"worker", "brigadier", "driver"}),
    "app_reminder": ("Заявки", "Напоминание подать заявку", {"foreman"}),
    "schedule_published": ("Заявки", "Расстановка опубликована", {"foreman", "brigadier", "driver", "moderator", "boss", "superadmin"}),
    "driver_assigned": ("Заявки", "Назначение на технику", {"driver"}),
    "driver_unassigned": ("Заявки", "Снятие с техники", {"driver"}),
    # SMR
    "smr_debt": ("СМР", "Нужно заполнить СМР", {"foreman"}),
    "smr_fill_brigadier": ("СМР", "Нужно заполнить СМР по бригаде", {"brigadier"}),
    "smr_submitted": ("СМР", "СМР отправлено на проверку", {"foreman", "moderator", "boss", "superadmin", "hr"}),
    "smr_approved": ("СМР", "СМР одобрено", {"foreman", "brigadier", "hr"}),
    "smr_rejected": ("СМР", "СМР возвращено", {"foreman", "brigadier", "hr"}),
    "smr_addendum": ("СМР", "Добавлен дополнительный отчёт", {"foreman", "moderator", "boss", "superadmin", "hr"}),
    "smr_accounted": ("СМР", "СМР учтено", {"foreman", "moderator", "boss", "superadmin", "hr"}),
    # Objects/resources/staff
    "object_request": ("Объекты", "Запрос на новый объект", {"moderator", "boss", "superadmin"}),
    "object_request_result": ("Объекты", "Результат запроса на объект", {"foreman"}),
    "staff_changed": ("Сотрудники", "Изменение карточки или состава бригады", {"worker", "brigadier", "foreman", "hr"}),
    "staff_status_changed": ("Сотрудники", "Отпуск или больничный", {"foreman", "hr", "worker", "driver"}),
    "user_registered": ("Сотрудники", "Новый пользователь", {"moderator", "boss", "superadmin", "hr"}),
    "role_changed": ("Сотрудники", "Изменение моей роли", {"employee", "worker", "driver", "brigadier", "foreman", "moderator", "boss", "hr"}),
    "account_banned": ("Сотрудники", "Моя учётная запись заблокирована", {"employee", "worker", "driver", "brigadier", "foreman", "moderator", "boss", "hr"}),
    "account_unbanned": ("Сотрудники", "Блокировка моей учётной записи снята", {"employee", "worker", "driver", "brigadier", "foreman", "moderator", "boss", "hr"}),
    "equipment_changed": ("Ресурсы", "Изменения техники", {"moderator", "boss", "superadmin"}),
    "team_changed": ("Ресурсы", "Изменения бригады", {"moderator", "boss", "superadmin", "hr"}),
    "resource_released": ("Ресурсы", "Освобождение техники или бригады", {"foreman", "moderator", "boss", "superadmin"}),
    "account_link_alert": ("Сотрудники", "Связывание и конфликт аккаунтов", {"moderator", "boss", "superadmin", "hr"}),
    # Exchange/support
    "exchange_request": ("Обмен", "Запрос обмена техникой", {"foreman", "moderator", "boss", "superadmin"}),
    "exchange_result": ("Обмен", "Результат обмена", {"foreman"}),
    "support_new": ("Поддержка", "Новое обращение", {"boss", "superadmin"}),
    "support_reply": ("Поддержка", "Ответ поддержки", {"employee", "worker", "driver", "brigadier", "foreman", "moderator", "boss", "superadmin", "hr"}),
    "broadcast": ("Общее", "Сообщения руководства", {"employee", "worker", "driver", "brigadier", "foreman", "moderator", "boss", "superadmin", "hr"}),
    "notification_test": ("Общее", "Тестовые уведомления", {"employee", "worker", "driver", "brigadier", "foreman", "moderator", "boss", "superadmin", "hr"}),
    # System: all are enabled for every superadmin by default.
    "system_error": ("Система", "Ошибка приложения", {"superadmin"}),
    "system_unavailable": ("Система", "Система недоступна", {"superadmin"}),
    "system_recovered": ("Система", "Работа восстановлена", {"superadmin"}),
    "deploy_started": ("Система", "Обновление началось", {"superadmin"}),
    "deploy_failed": ("Система", "Ошибка обновления", {"superadmin"}),
    "deploy_succeeded": ("Система", "Обновление завершено", {"superadmin"}),
    "scheduler_failed": ("Система", "Ошибка фонового задания", {"superadmin"}),
    "backup_failed": ("Система", "Ошибка резервной копии", {"superadmin"}),
    "delivery_failed": ("Система", "Проблема доставки уведомлений", {"superadmin"}),
    "smr_audit_failed": ("Система", "Ошибка финансового журнала СМР", {"superadmin"}),
}

LEGACY_EVENT_KEYS = {
    "app_new": "notify_new_apps",
    "smr_debt": "notify_smr_debtors",
    "object_request": "notify_object_requests",
    "exchange_request": "notify_exchanges",
}


def event_enabled(role: str, settings: dict, event_key: str | None) -> bool:
    if not event_key or event_key not in EVENTS:
        return True  # backward-compatible for events not migrated yet
    overrides = settings.get("notification_events") or {}
    if isinstance(overrides, dict) and event_key in overrides:
        return bool(overrides[event_key])
    legacy_key = LEGACY_EVENT_KEYS.get(event_key)
    if legacy_key and legacy_key in settings:
        return bool(settings[legacy_key])
    return role in EVENTS[event_key][2]


def catalog_for_role(role: str, settings: dict) -> list[dict]:
    overrides = settings.get("notification_events") or {}
    result = []
    for key, (group, label, roles) in EVENTS.items():
        if role not in roles:
            continue
        result.append({
            "key": key,
            "group": group,
            "label": label,
            "enabled": bool(overrides.get(
                key,
                settings.get(LEGACY_EVENT_KEYS.get(key), True),
            )),
        })
    return result

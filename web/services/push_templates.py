"""
Typed push-notification templates.

Centralizes titles + icons for every push notification sent via PWA web push.
Callers pass a notification_type + body; the payload is built here.
"""

PUSH_TEMPLATES = {
    "app_rejected":       {"title": "Заявка отклонена",           "icon": "/push-icons/app-rejected.png"},
    "app_approved":       {"title": "Заявка одобрена",            "icon": "/push-icons/app-approved.png"},
    "app_new":            {"title": "Новая заявка на проверку",   "icon": "/push-icons/app-new.png"},
    "support_new":        {"title": "Новое обращение в поддержку","icon": "/push-icons/support-new.png"},
    "support_reply":      {"title": "Ответ от поддержки",         "icon": "/push-icons/support-reply.png"},
    "exchange_request":   {"title": "Запрос обмена техникой",     "icon": "/push-icons/exchange-request.png"},
    "smr_debt":           {"title": "Заполните СМР",              "icon": "/push-icons/smr-debt.png"},
    "schedule_published": {"title": "Расстановка опубликована",   "icon": "/push-icons/schedule-published.png"},
    "object_request":     {"title": "Запрос на новый объект",     "icon": "/push-icons/object-request.png"},
    "user_registered":    {"title": "Новый пользователь",         "icon": "/push-icons/user-registered.png"},
}


def build_push_payload(notification_type: str, body: str, url: str = "/") -> dict:
    """Build a web-push payload dict for the given notification type.

    Falls back to a generic ВиКС template if the type is unknown.
    """
    template = PUSH_TEMPLATES.get(notification_type, {"title": "ВиКС Расписание", "icon": "/main.png"})
    return {
        "title": template["title"],
        "body": body,
        "icon": template["icon"],
        "badge": "/push-icons/badge.png",
        "url": url,
        "tag": notification_type,
    }

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException, Depends
from database_deps import db
from auth_deps import get_current_user

router = APIRouter(tags=["Push"])


@router.get("/api/push/vapid-key")
async def get_vapid_key():
    """Public endpoint — returns VAPID public key for subscription."""
    key = os.getenv("VAPID_PUBLIC_KEY", "")
    if not key:
        raise HTTPException(503, "Push notifications not configured")
    return {"public_key": key}


@router.post("/api/push/subscribe")
async def push_subscribe(
    endpoint: str = Form(...),
    p256dh: str = Form(...),
    auth: str = Form(...),
    current_user=Depends(get_current_user),
):
    """Store or update a push subscription for the authenticated user."""
    user_id = current_user["tg_id"]

    # Upsert: remove old subscription for this endpoint, then insert
    await db.conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    await db.conn.execute(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)",
        (user_id, endpoint, p256dh, auth),
    )
    await db.conn.commit()
    return {"status": "ok"}


@router.post("/api/push/unsubscribe")
async def push_unsubscribe(
    endpoint: str = Form(...),
    current_user=Depends(get_current_user),
):
    """Remove current user's push subscription.
    Constrained by user_id to prevent cross-user unsubscribe attacks.
    """
    user_id = current_user["tg_id"]

    await db.conn.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
        (endpoint, user_id),
    )
    await db.conn.commit()
    return {"status": "ok"}

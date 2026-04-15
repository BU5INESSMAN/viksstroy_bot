import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Form, HTTPException
from database_deps import db
from utils import resolve_id

router = APIRouter(tags=["Push"])


@router.get("/api/push/vapid-key")
async def get_vapid_key():
    """Return the public VAPID key for push subscription."""
    key = os.getenv("VAPID_PUBLIC_KEY", "")
    if not key:
        raise HTTPException(503, "Push notifications not configured")
    return {"public_key": key}


@router.post("/api/push/subscribe")
async def push_subscribe(
    tg_id: int = Form(...),
    endpoint: str = Form(...),
    p256dh: str = Form(...),
    auth: str = Form(...),
):
    """Store or update a push subscription for the user."""
    if db.conn is None:
        await db.init_db()
    real_id = await resolve_id(tg_id)
    user = await db.get_user(real_id)
    if not user:
        raise HTTPException(401, "Not authenticated")

    # Upsert: remove old subscription for this endpoint, then insert
    await db.conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    await db.conn.execute(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)",
        (real_id, endpoint, p256dh, auth),
    )
    await db.conn.commit()
    return {"status": "ok"}


@router.post("/api/push/unsubscribe")
async def push_unsubscribe(endpoint: str = Form(...)):
    """Remove a push subscription."""
    if db.conn is None:
        await db.init_db()
    await db.conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    await db.conn.commit()
    return {"status": "ok"}

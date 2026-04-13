import sys
import os
import logging
import asyncio

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, HTTPException, Request
from database_deps import db
from utils import resolve_id
from services.notifications import notify_users

router = APIRouter(tags=["Support"])
logger = logging.getLogger("SUPPORT")


async def _get_setting(key: str) -> str:
    async with db.conn.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
        row = await cur.fetchone()
    return row[0] if row else ""


@router.get("/api/support/history")
async def support_history(tg_id: int = 0):
    """Return last 50 messages for this user."""
    if not tg_id:
        raise HTTPException(400, "tg_id required")

    resolved_user_id = await resolve_id(tg_id)

    async with db.conn.execute(
        "SELECT role, message, created_at FROM support_chats WHERE user_id = ? ORDER BY id DESC LIMIT 50",
        (resolved_user_id,)
    ) as cur:
        rows = await cur.fetchall()

    # Return in chronological order
    return [{"from": r[0], "text": r[1], "time": r[2]} for r in reversed(rows)]


@router.post("/api/support/chat")
async def support_chat(request: Request):
    data = await request.json()
    user_message = data.get("message", "")
    tg_id = data.get("tg_id", 0)
    history = data.get("history", [])

    if not user_message.strip():
        raise HTTPException(400, "Пустое сообщение")

    resolved_user_id = await resolve_id(tg_id) if tg_id else tg_id

    # Save user message
    await db.conn.execute(
        "INSERT INTO support_chats (user_id, role, message) VALUES (?, 'user', ?)",
        (resolved_user_id, user_message)
    )
    await db.conn.commit()

    # Notify superadmins in background
    async def _notify_support_request():
        try:
            user = await db.get_user(resolved_user_id)
            fio = dict(user).get('fio', 'Неизвестный') if user else 'Неизвестный'
            await notify_users(
                ["superadmin"],
                f"\U0001f3a7 <b>Обращение в поддержку</b>\n\U0001f464 {fio}\n\U0001f4ac {user_message[:200]}",
                "system",
                category="new_users"
            )
        except Exception:
            pass

    asyncio.create_task(_notify_support_request())

    # Get AI API key (OpenRouter)
    api_key = await _get_setting("gemini_api_key")
    if not api_key:
        fallback = "ИИ-поддержка не настроена. Обратитесь к администратору или используйте мессенджеры ниже."
        await db.conn.execute(
            "INSERT INTO support_chats (user_id, role, message) VALUES (?, 'assistant', ?)",
            (resolved_user_id, fallback)
        )
        await db.conn.commit()
        return {"reply": fallback}

    # Build OpenAI-compatible messages array
    messages = [
        {
            "role": "system",
            "content": "Ты — ИИ-ассистент платформы ВИКС Расписание. Это платформа для управления строительными нарядами. Основные функции: Канбан-доска заявок, управление бригадами и техникой, расстановки, обмен техникой, СМР отчёты, связывание аккаунтов TG и MAX, объекты. Роли: Супер-Админ > Руководитель > Модератор > Прораб > Бригадир > Рабочий > Водитель. Отвечай кратко, по делу, на русском языке. Если не знаешь ответа — предложи обратиться к человеку через мессенджеры."
        }
    ]
    for msg in history[-10:]:
        messages.append({
            "role": "user" if msg.get("from") == "user" else "assistant",
            "content": msg.get("text", "")
        })
    messages.append({"role": "user", "content": user_message})

    try:
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json={
                    "model": "google/gemini-2.0-flash-exp:free",
                    "messages": messages
                },
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://miniapp.viks22.ru",
                    "X-Title": "VIKS Schedule"
                }
            ) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    reply = result["choices"][0]["message"]["content"]
                else:
                    error_text = await resp.text()
                    logger.error(f"OpenRouter API error {resp.status}: {error_text}")
                    reply = "Ошибка AI сервиса. Попробуйте позже или обратитесь через мессенджеры."
    except Exception as e:
        logger.error(f"OpenRouter API error: {e}")
        reply = "Ошибка соединения с AI. Обратитесь через мессенджеры ниже."

    # Save AI reply
    await db.conn.execute(
        "INSERT INTO support_chats (user_id, role, message) VALUES (?, 'assistant', ?)",
        (resolved_user_id, reply)
    )
    await db.conn.commit()

    return {"reply": reply}

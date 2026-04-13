import sys
import os
import logging
import asyncio

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, HTTPException, Request
from database_deps import db
from utils import resolve_id

router = APIRouter(tags=["Support"])
logger = logging.getLogger("SUPPORT")

MODELS = [
    "google/gemma-3-27b-it:free",
    "google/gemma-3-12b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
]

_knowledge_cache = None


def _load_knowledge_base() -> str:
    global _knowledge_cache
    if _knowledge_cache is not None:
        return _knowledge_cache

    base = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base, "..", "data", "support_knowledge.txt"),
        os.path.join(base, "..", "..", "data", "support_knowledge.txt"),
        os.path.join(base, "data", "support_knowledge.txt"),
    ]
    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8") as f:
                _knowledge_cache = f.read()
                return _knowledge_cache
        except Exception:
            continue
    logger.warning("Knowledge base file not found in any candidate path")
    return ""


async def _get_setting(key: str) -> str:
    async with db.conn.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
        row = await cur.fetchone()
    return row[0] if row else ""


async def _should_notify(user_id: int) -> bool:
    """Only notify if user's last message was >30 min ago (new conversation)."""
    async with db.conn.execute(
        "SELECT created_at FROM support_chats WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1 OFFSET 1",
        (user_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return True
    from datetime import datetime, timedelta
    try:
        last_time = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
        return (datetime.now() - last_time) > timedelta(minutes=30)
    except Exception:
        return True


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

    return [{"from": r[0], "text": r[1], "time": r[2]} for r in reversed(rows)]


@router.get("/api/support/all_dialogs")
async def all_dialogs(tg_id: int = 0):
    """Boss+ endpoint: return all users who have support dialogs."""
    if not tg_id:
        raise HTTPException(400, "tg_id required")

    real_id = await resolve_id(tg_id)
    user = await db.get_user(real_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss']:
        raise HTTPException(403, "Нет прав")

    async with db.conn.execute("""
        SELECT sc.user_id,
               COALESCE(u.fio, 'Пользователь #' || sc.user_id) as fio,
               u.role,
               MAX(sc.created_at) as last_msg,
               COUNT(*) as msg_count,
               (SELECT message FROM support_chats sc2 WHERE sc2.user_id = sc.user_id ORDER BY sc2.id DESC LIMIT 1) as last_text
        FROM support_chats sc
        LEFT JOIN users u ON u.user_id = sc.user_id
        GROUP BY sc.user_id
        ORDER BY MAX(sc.id) DESC
    """) as cur:
        rows = await cur.fetchall()

    return [
        {
            "user_id": r[0], "fio": r[1], "role": r[2] or "unknown",
            "last_msg": r[3], "msg_count": r[4], "last_text": (r[5] or "")[:80]
        }
        for r in rows
    ]


@router.get("/api/support/user_history")
async def user_history(tg_id: int = 0, target_user_id: int = 0):
    """Boss+ endpoint: return chat history for a specific user."""
    if not tg_id or not target_user_id:
        raise HTTPException(400, "tg_id and target_user_id required")

    real_id = await resolve_id(tg_id)
    user = await db.get_user(real_id)
    if not user or dict(user).get('role') not in ['superadmin', 'boss']:
        raise HTTPException(403, "Нет прав")

    async with db.conn.execute(
        "SELECT role, message, created_at FROM support_chats WHERE user_id = ? ORDER BY id DESC LIMIT 100",
        (target_user_id,)
    ) as cur:
        rows = await cur.fetchall()

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

    # Log every support message
    try:
        user_obj = await db.get_user(resolved_user_id)
        fio = dict(user_obj).get('fio', 'Неизвестный') if user_obj else 'Неизвестный'
        await db.add_log(
            resolved_user_id,
            fio,
            f"Сообщение в поддержку: {user_message[:150]}",
            target_type='support',
            target_id=resolved_user_id
        )
    except Exception:
        fio = 'Неизвестный'

    # Smart notification: only notify on new conversations (>30 min gap)
    should_notify = await _should_notify(resolved_user_id)

    if should_notify:
        from services.notifications import notify_users

        async def _notify_support_request():
            try:
                await notify_users(
                    ["superadmin", "boss"],
                    f"\U0001f3a7 <b>Новое обращение в поддержку</b>\n\U0001f464 {fio}\n\U0001f4ac {user_message[:200]}",
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

    # Build OpenAI-compatible messages array with knowledge base
    knowledge = _load_knowledge_base()

    system_content = f"""Ты — ИИ-ассистент платформы ВИКС Расписание. Помогай пользователям разобраться в работе платформы.

Вот полная база знаний:

{knowledge}

ПРАВИЛА:
- Отвечай кратко и по делу, на русском языке
- Используй информацию из базы знаний для ответов
- Если вопрос выходит за рамки базы знаний — честно скажи и предложи обратиться к человеку через мессенджеры
- Не выдумывай функции которых нет в базе знаний
- Форматируй ответ с emoji где уместно"""

    messages = [{"role": "system", "content": system_content}]
    for msg in history[-10:]:
        messages.append({
            "role": "user" if msg.get("from") == "user" else "assistant",
            "content": msg.get("text", "")
        })
    messages.append({"role": "user", "content": user_message})

    try:
        import aiohttp

        reply = None
        async with aiohttp.ClientSession() as session:
            for model in MODELS:
                async with session.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    json={
                        "model": model,
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
                        break
                    elif resp.status == 429:
                        logger.warning(f"Model {model} rate limited (429), trying next")
                        continue
                    else:
                        error_text = await resp.text()
                        logger.error(f"OpenRouter API error {resp.status} for {model}: {error_text}")
                        break

        if not reply:
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

import sys
import os
import logging
import asyncio
import random

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import aiohttp
from fastapi import APIRouter, HTTPException, Request, Depends
from database_deps import db
from auth_deps import get_current_user, require_role
from rate_limit import support_limiter
from services.ai_context import build_user_context

router = APIRouter(tags=["Support"])
logger = logging.getLogger("SUPPORT")

# Prioritised free-tier models on OpenRouter.
# openrouter/free auto-selects the best available free model.
# The rest are explicit fallbacks ordered by quality.
MODELS_PRIMARY = [
    "openrouter/auto",
]
MODELS_FALLBACK = [
    # Tier 1 — best quality free models
    "google/gemma-3-27b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-r1:free",
    "qwen/qwen3-30b-a3b:free",
    # Tier 2 — good quality
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "google/gemma-3-12b-it:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    # Tier 3 — smaller but reliable
    "meta-llama/llama-3.2-3b-instruct:free",
    "google/gemma-3-4b-it:free",
    "google/gemma-3n-e4b-it:free",
    "microsoft/phi-4:free",
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


async def _call_ai(messages: list, api_key: str, user_id: int = 0) -> str:
    """Try free models with smart fallback. Returns AI text or an error string."""
    if not api_key:
        return "ИИ-поддержка не настроена. Обратитесь к администратору или используйте мессенджеры ниже."

    # Primary auto-router first, then shuffled fallbacks to distribute load
    fallbacks = list(MODELS_FALLBACK)
    random.shuffle(fallbacks)
    models_to_try = MODELS_PRIMARY + fallbacks

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://miniapp.viks22.ru",
        "X-Title": "VIKS Schedule",
    }
    last_error = None

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        for model in models_to_try:
            try:
                async with session.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    json={"model": model, "messages": messages, "max_tokens": 1000, "temperature": 0.3},
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        reply = (result.get("choices") or [{}])[0].get("message", {}).get("content", "")
                        if reply and reply.strip():
                            logger.info(f"AI response from {model} for user {user_id}")
                            return reply.strip()
                        logger.warning(f"Model {model} returned empty response, trying next")
                        continue
                    if resp.status in (429, 400, 503, 502):
                        logger.warning(f"Model {model} returned {resp.status}, trying next")
                        continue
                    if resp.status == 401:
                        return "Ошибка авторизации AI. Проверьте API ключ в настройках."
                    body = await resp.text()
                    logger.warning(f"Model {model} returned {resp.status}: {body[:200]}")
                    last_error = f"HTTP {resp.status}"
                    continue
            except asyncio.TimeoutError:
                logger.warning(f"Model {model} timed out, trying next")
                continue
            except Exception as e:
                logger.warning(f"Model {model} error: {e}, trying next")
                last_error = str(e)
                continue

    return f"Все AI модели недоступны. Попробуйте позже или обратитесь через мессенджеры. ({last_error or '429'})"


@router.get("/api/support/history")
async def support_history(current_user=Depends(get_current_user)):
    """Return last 50 messages for the authenticated user. Users see ONLY their own."""
    user_id = current_user["tg_id"]

    async with db.conn.execute(
        "SELECT role, message, created_at FROM support_chats WHERE user_id = ? ORDER BY id DESC LIMIT 50",
        (user_id,)
    ) as cur:
        rows = await cur.fetchall()

    return [{"from": r[0], "text": r[1], "time": r[2]} for r in reversed(rows)]


_require_boss_plus = require_role("superadmin", "boss")


@router.get("/api/support/all_dialogs")
async def all_dialogs(current_user=Depends(_require_boss_plus)):
    """Boss+ endpoint: return all users who have support dialogs."""
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
async def user_history(target_user_id: int = 0, current_user=Depends(_require_boss_plus)):
    """Boss+ endpoint: return chat history for a specific user."""
    if not target_user_id:
        raise HTTPException(400, "target_user_id required")

    async with db.conn.execute(
        "SELECT role, message, created_at FROM support_chats WHERE user_id = ? ORDER BY id DESC LIMIT 100",
        (target_user_id,)
    ) as cur:
        rows = await cur.fetchall()

    return [{"from": r[0], "text": r[1], "time": r[2]} for r in reversed(rows)]


@router.post("/api/support/chat")
async def support_chat(request: Request, current_user=Depends(get_current_user)):
    """Send message to AI support. Uses authenticated user's identity."""
    resolved_user_id = current_user["tg_id"]

    # M-07: per-user rate limit (10/min, 3 concurrent)
    ok, reason = await support_limiter.acquire(resolved_user_id)
    if not ok:
        raise HTTPException(status_code=429, detail=reason)

    try:
        return await _do_support_chat(request, current_user, resolved_user_id)
    finally:
        await support_limiter.release(resolved_user_id)


async def _do_support_chat(request: Request, current_user: dict, resolved_user_id: int):
    """Inner handler extracted for rate-limit finally block."""
    data = await request.json()
    user_message = data.get("message", "")
    history = data.get("history", [])

    if not user_message.strip():
        raise HTTPException(400, "Пустое сообщение")
    user_role = current_user.get("role", "worker")
    fio = current_user.get("fio", "Неизвестный")

    # Save user message
    await db.conn.execute(
        "INSERT INTO support_chats (user_id, role, message) VALUES (?, 'user', ?)",
        (resolved_user_id, user_message)
    )
    await db.conn.commit()

    # Log every support message
    try:
        await db.add_log(
            resolved_user_id,
            fio,
            f"Сообщение в поддержку: {user_message[:150]}",
            target_type='support',
            target_id=resolved_user_id
        )
    except Exception:
        pass

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

    # Build OpenAI-compatible messages with knowledge base + live context
    knowledge = _load_knowledge_base()

    # Fetch live data relevant to the user's question (read-only, role-gated)
    dynamic_context = ""
    try:
        dynamic_context = await build_user_context(db, resolved_user_id, user_message)
    except Exception as e:
        logger.warning(f"AI context build failed (non-fatal): {e}")

    dynamic_section = ""
    if dynamic_context:
        dynamic_section = f"\nАКТУАЛЬНЫЕ ДАННЫЕ:\n{dynamic_context}"

    system_content = f"""Ты — ИИ-ассистент платформы ВиКС (строительная компания).
Помогай пользователям разобраться в работе платформы и предоставляй актуальные данные.

БАЗА ЗНАНИЙ О ПЛАТФОРМЕ:
{knowledge}
{dynamic_section}

ПРАВИЛА:
- Отвечай кратко и по делу, на русском языке
- Если в разделе АКТУАЛЬНЫЕ ДАННЫЕ есть ответ на вопрос — используй его
- Если данных нет — используй базу знаний
- Не выдумывай данные, которых нет в контексте
- Если не можешь найти информацию — предложи обратиться через мессенджеры
- Роль пользователя: {user_role}. Не показывай данные выше его уровня доступа
- Форматируй ответ с emoji где уместно"""

    messages = [{"role": "system", "content": system_content}]
    for msg in history[-10:]:
        messages.append({
            "role": "user" if msg.get("from") == "user" else "assistant",
            "content": msg.get("text", "")
        })
    messages.append({"role": "user", "content": user_message})

    # Call AI with smart multi-model fallback
    # Setting is named gemini_api_key for legacy reasons — it holds an OpenRouter key
    api_key = await _get_setting("gemini_api_key")
    reply = await _call_ai(messages, api_key, user_id=resolved_user_id)

    # Save AI reply
    await db.conn.execute(
        "INSERT INTO support_chats (user_id, role, message) VALUES (?, 'assistant', ?)",
        (resolved_user_id, reply)
    )
    await db.conn.commit()

    return {"reply": reply}

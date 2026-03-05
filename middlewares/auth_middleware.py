import time
import os
import traceback
import asyncio
from typing import Any, Awaitable, Callable, Dict
from aiogram import BaseMiddleware
from aiogram.types import Update


class AuthMiddleware(BaseMiddleware):
    def __init__(self, db):
        self.db = db
        self.cache = {}
        self.cache_ttl = 300
        super().__init__()

    async def __call__(
            self,
            handler: Callable[[Update, Dict[str, Any]], Awaitable[Any]],
            event: Update,
            data: Dict[str, Any]
    ) -> Any:

        try:
            if event.message and event.message.chat.type in ['group', 'supergroup']:
                return
            if event.callback_query and event.callback_query.message and event.callback_query.message.chat.type in [
                'group', 'supergroup']:
                return

            user = None
            if event.message:
                user = event.message.from_user
            elif event.callback_query:
                user = event.callback_query.from_user

            if not user:
                return await handler(event, data)

            super_admins = os.getenv("SUPER_ADMIN_IDS", "").split(",")
            bosses = os.getenv("BOSS_IDS", "").split(",")

            if str(user.id) in super_admins:
                data["role"] = "superadmin"
                return await handler(event, data)
            elif str(user.id) in bosses:
                data["role"] = "boss"
                return await handler(event, data)

            current_time = time.time()
            user_data = None

            if user.id in self.cache and (current_time - self.cache[user.id]["time"] < self.cache_ttl):
                user_data = self.cache[user.id]["data"]
            else:
                user_data = await self.db.get_user(user.id)
                self.cache[user.id] = {"data": user_data, "time": current_time}

            if user_data:
                if user_data["is_blacklisted"]:
                    if event.callback_query:
                        await event.callback_query.answer("❌ Вы заблокированы.", show_alert=True)
                    return

                if user_data["is_active"]:
                    data["role"] = user_data["role"]
                    return await handler(event, data)

            return await handler(event, data)

        except Exception as e:
            bot = None
            if event.message:
                bot = event.message.bot
            elif event.callback_query:
                bot = event.callback_query.bot

            if bot:
                from utils.notifications import notify_bosses
                err_text = f"<b>Исключение:</b> <code>{e}</code>\n\n<b>Traceback:</b>\n<pre>{traceback.format_exc()[:3000]}</pre>"
                asyncio.create_task(notify_bosses(bot, self.db, err_text, level='error'))

            raise e
import time
from typing import Any, Awaitable, Callable, Dict
from aiogram import BaseMiddleware
from aiogram.types import Update
import os


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
        user = None
        if event.message:
            user = event.message.from_user
        elif event.callback_query:
            user = event.callback_query.from_user

        if not user:
            return await handler(event, data)

        # 1. Проверка на Высшее руководство (из .env)
        superadmins = [x.strip() for x in os.getenv("SUPERADMIN_IDS", "").split(",") if x.strip()]
        bosses = [x.strip() for x in os.getenv("BOSS_IDS", "").split(",") if x.strip()]
        admins = [x.strip() for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip()]

        uid_str = str(user.id)
        if uid_str in superadmins:
            data["role"] = "superadmin"
            return await handler(event, data)
        elif uid_str in bosses:
            data["role"] = "boss"
            return await handler(event, data)
        elif uid_str in admins:
            data["role"] = "admin"
            return await handler(event, data)

        # 2. Получаем данные из Кэша или БД
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
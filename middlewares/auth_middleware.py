from typing import Any, Awaitable, Callable, Dict
from aiogram import BaseMiddleware
from aiogram.types import Update
import os

class AuthMiddleware(BaseMiddleware):
    def __init__(self, db):
        self.db = db
        super().__init__()

    async def __call__(
        self,
        handler: Callable[[Update, Dict[str, Any]], Awaitable[Any]],
        event: Update,
        data: Dict[str, Any]
    ) -> Any:
        # Определяем пользователя (из сообщения или колбэка)
        user = None
        if event.message:
            user = event.message.from_user
        elif event.callback_query:
            user = event.callback_query.from_user

        if not user:
            return await handler(event, data)

        # 1. Проверка на Супер-админа (из .env)
        super_admins = os.getenv("SUPER_ADMIN_IDS", "").split(",")
        if str(user.id) in super_admins:
            data["role"] = "admin"
            return await handler(event, data)

        # 2. Получаем данные из БД
        user_data = await self.db.get_user(user.id)

        if user_data:
            # Если пользователь в черном списке (3+ ошибки пароля)
            if user_data["is_blacklisted"]:
                # Можно отправить сообщение, но лучше просто игнорировать
                return

            # Если пользователь авторизован и активен
            if user_data["is_active"]:
                data["role"] = user_data["role"]
                return await handler(event, data)

        # Если пользователь не авторизован или не найден, роль не передается
        # Хендлеры авторизации (start) будут работать, так как им не нужна роль
        return await handler(event, data)
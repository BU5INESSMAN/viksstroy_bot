# viksstroy_bot/keyboards/reply.py
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from aiogram.utils.keyboard import ReplyKeyboardBuilder


def get_main_menu_kb(role: str) -> ReplyKeyboardMarkup:
    """Главное меню (внизу у кнопок) в зависимости от роли"""
    builder = ReplyKeyboardBuilder()

    # Логика для Прораба
    if role == "foreman":
        builder.button(text="📝 Создать заявку")
        builder.button(text="👥 Управление бригадами")

    # Логика для Модератора
    elif role == "moderator":
        builder.button(text="📂 Список заявок")

    # Логика для Администратора
    elif role == "admin":
        builder.button(text="🛠 Панель управления")  # Управление техникой и юзерами
        builder.button(text="📂 Список заявок")  # Админ тоже может модерировать

    builder.adjust(2)
    return builder.as_markup(resize_keyboard=True)
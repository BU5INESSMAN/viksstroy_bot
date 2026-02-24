# viksstroy_bot/keyboards/reply.py
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

def get_main_menu_kb(role: str) -> ReplyKeyboardMarkup:
    """
    Возвращает текстовую клавиатуру (Reply) в зависимости от роли пользователя.
    """
    keyboard = []

    # --- Кнопки для ПРОРАБА ---
    if role in ["foreman", "admin"]:
        keyboard.append([
            KeyboardButton(text="📝 Создать заявку"),
            KeyboardButton(text="👥 Управление бригадами")
        ])

    # --- Кнопки для МОДЕРАТОРА ---
    if role in ["moderator", "admin"]:
        keyboard.append([
            KeyboardButton(text="🛡 Панель модератора"),
            KeyboardButton(text="📤 Отправить наряды в группу")
        ])

    # --- Кнопки для АДМИНА ---
    if role == "admin":
        keyboard.append([
            KeyboardButton(text="🛠 Панель управления")
        ])

    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        input_field_placeholder="Выберите действие ниже 👇"
    )
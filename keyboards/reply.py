from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

def get_main_menu_kb(role: str) -> ReplyKeyboardMarkup:
    keyboard = []

    # --- ПРОРАБ + ВЫСШЕЕ РУКОВОДСТВО ---
    if role in ["foreman", "admin", "boss", "superadmin"]:
        keyboard.append([
            KeyboardButton(text="📝 Создать заявку"),
            KeyboardButton(text="👥 Управление бригадами")
        ])

    # --- МОДЕРАТОР + ВЫСШЕЕ РУКОВОДСТВО ---
    if role in ["moderator", "admin", "boss", "superadmin"]:
        keyboard.append([
            KeyboardButton(text="🛡 Панель модератора"),
            KeyboardButton(text="📤 Отправить наряды в группу")
        ])

    # --- АДМИН + ВЫСШЕЕ РУКОВОДСТВО ---
    if role in ["admin", "boss", "superadmin"]:
        keyboard.append([
            KeyboardButton(text="🛠 Панель управления")
        ])

    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        input_field_placeholder="Выберите действие ниже 👇"
    )
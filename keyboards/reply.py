from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

def get_main_menu_kb(role: str) -> ReplyKeyboardMarkup:
    keyboard = []

    if role in ["foreman", "moderator", "boss", "superadmin"]:
        keyboard.append([
            KeyboardButton(text="📝 Создать заявку"),
            KeyboardButton(text="👥 Управление бригадами")
        ])

    if role in ["moderator", "boss", "superadmin"]:
        keyboard.append([
            KeyboardButton(text="🛡 Панель модератора"),
            KeyboardButton(text="📤 Отправить наряды в группу")
        ])
        keyboard.append([
            KeyboardButton(text="🛠 Панель управления")
        ])

    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        input_field_placeholder="Выберите действие ниже 👇"
    )
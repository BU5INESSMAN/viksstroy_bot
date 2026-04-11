import os

from maxapi import Bot
from maxapi.types import InputMedia

_max_bot_instance = None


def get_max_bot(token: str):
    global _max_bot_instance
    if _max_bot_instance is None:
        _max_bot_instance = Bot(token=token)
    return _max_bot_instance


async def get_max_group_id():
    """Получает ID группы MAX"""
    from database_deps import db
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT value FROM settings WHERE key = 'max_group_chat_id'") as cur:
        row = await cur.fetchone()
        if row and str(row[0]).strip().lower() not in ["none", "null", ""]:
            return str(row[0]).strip()
    env_val = os.getenv("MAX_GROUP_CHAT_ID")
    if env_val and str(env_val).strip().lower() not in ["none", "null", ""]:
        return str(env_val).strip()
    return None


async def get_max_dm_chat_id(max_user_id: str):
    """Ищет сохраненный ID личного диалога."""
    from database_deps import db
    if db.conn is None: await db.init_db()
    async with db.conn.execute("SELECT value FROM settings WHERE key = ?", (f'max_dm_{max_user_id}',)) as cur:
        row = await cur.fetchone()
        if row and str(row[0]).strip().lower() not in ["none", "null", ""]:
            return str(row[0]).strip()
    return str(max_user_id)


async def send_max_text(bot_token: str, chat_id: str, text: str, attachments: list = None):
    """Отправка текста в MAX."""
    if not bot_token or not chat_id or str(chat_id).lower() in ["none", "null", ""]:
        return False

    try:
        int_chat_id = int(str(chat_id).strip())
    except ValueError:
        return False

    try:
        bot = get_max_bot(bot_token)
        if attachments:
            await bot.send_message(chat_id=int_chat_id, text=str(text), attachments=attachments)
        else:
            await bot.send_message(chat_id=int_chat_id, text=str(text))
        return True
    except Exception as e:
        err_str = str(e)
        if 'dialog.not.found' in err_str:
            print(f"⚠️ ЛС не отправлено (Диалог не найден). Пользователь {int_chat_id} еще не написал боту ЛС.")
        else:
            print(f"❌ Ошибка MAX API (send_max_text): {e}")
        return False


async def send_max_message(bot_token: str, chat_id: str, text: str, filepath: str = None, file_url: str = None,
                           attachments: list = None):
    """Отправка полного наряда (Фото + Текст) в MAX"""
    if not bot_token or not chat_id or str(chat_id).lower() in ["none", "null", ""]:
        return False

    try:
        int_chat_id = int(str(chat_id).strip())
    except ValueError:
        return False

    bot = get_max_bot(bot_token)
    photo_sent = False

    if filepath:
        try:
            await bot.send_message(
                chat_id=int_chat_id,
                attachments=[InputMedia(path=os.path.abspath(filepath))]
            )
            photo_sent = True
        except Exception as e:
            print(f"❌ Ошибка фото в MAX: {e}")

    final_text = text
    if not photo_sent and file_url:
        final_text += f"\n\n🖼 Наряд: {file_url}"

    try:
        if attachments:
            await bot.send_message(chat_id=int_chat_id, text=str(final_text), attachments=attachments)
        else:
            await bot.send_message(chat_id=int_chat_id, text=str(final_text))
        return True
    except Exception as e:
        err_str = str(e)
        if 'dialog.not.found' in err_str:
            print(f"⚠️ ЛС не отправлено (Диалог не найден). Пользователь {int_chat_id} еще не написал боту ЛС.")
        else:
            print(f"❌ Ошибка текста в MAX: {e}")
        return False

import os
from zoneinfo import ZoneInfo
from database.db_manager import DatabaseManager
from dotenv import load_dotenv

load_dotenv()

# Глобальный инстанс БД и часового пояса
db_path = os.getenv("DB_PATH", "data/viksstroy.db")
db = DatabaseManager(db_path)

TZ_BARNAUL = ZoneInfo("Asia/Barnaul")
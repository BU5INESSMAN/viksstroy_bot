# Используем легкую версию Python
FROM python:3.10-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

RUN sed -i 's/deb.debian.org/mirror.yandex.ru/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || sed -i 's/deb.debian.org/mirror.yandex.ru/g' /etc/apt/sources.list
# Устанавливаем системные зависимости для работы с SQLite
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Копируем файл зависимостей
COPY requirements.txt .

# Устанавливаем библиотеки
RUN pip install --no-cache-dir -r requirements.txt

# Копируем все файлы проекта в контейнер
COPY . .

# Создаем папку для базы данных (чтобы она не удалилась при перезагрузке)
RUN mkdir -p data

# Запускаем бота
CMD ["python", "main.py"]
#!/bin/bash

# Останавливаем скрипт, если какая-либо команда завершается с ошибкой
set -e

echo "➡️ Получение последних изменений из git..."
git pull

cd frontend
npm run build
cd ..

echo "➡️ Сборка и запуск Docker контейнеров..."
docker compose up -d --build

echo "➡️ Удаление старых файлов фронтенда..."
sudo rm -rf /var/www/islandvpn.sbs/*

echo "➡️ Копирование новых файлов фронтенда..."
sudo cp -r frontend/dist/* /var/www/islandvpn.sbs/

echo "✅ Обновление успешно завершено!"

docker compose logs -f

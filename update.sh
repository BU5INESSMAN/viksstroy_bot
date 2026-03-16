#!/bin/bash

# Останавливаем скрипт, если какая-либо команда завершается с ошибкой
set -e

echo "➡️ Получение последних изменений из git..."
git pull

echo "➡️ Сборка фронтенда..."
cd frontend
npm install
npm run build
cd ..

echo "➡️ Остановка старых контейнеров..."
sudo docker compose down

echo "➡️ Сборка и запуск Docker контейнеров..."
sudo docker compose up -d --build

echo "➡️ Удаление старых файлов фронтенда..."
sudo rm -rf /var/www/app.viks22.ru/*

echo "➡️ Копирование новых файлов фронтенда..."
sudo cp -r frontend/dist/* /var/www/app.viks22.ru/

echo "✅ Обновление успешно завершено!"

echo "➡️ Вывод логов (для выхода нажмите Ctrl+C)..."
sudo docker compose logs -f
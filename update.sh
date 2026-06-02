#!/usr/bin/env bash
#
# Canonical deploy script for ВиКС Расписание (version-controlled reference).
# Run on the VPS from the repo root: `bash update.sh`
#
# Serving model (important):
#   - nginx serves the built SPA DIRECTLY from `frontend/dist` (root =
#     /root/viksstroy_bot/frontend/dist) and proxies /api -> 127.0.0.1:8000
#     (the `api` docker service). There is NO /var/www copy step — nginx reads
#     frontend/dist in place, so copying there would write to a directory nginx
#     does not serve (dead/misleading). Removed.
#   - The frontend is built here by Vite; the Docker image is backend-only.
#   - After a deploy, the PWA service worker (frontend/public/sw.js) must have a
#     bumped CACHE_VERSION so browsers purge the old cache-first /assets/* bundle
#     and pick up the freshly built one.
#
set -e

cd "$(dirname "$0")"

echo "==> Обновление кода из git (origin/master)"
git fetch origin
git reset --hard origin/master

echo "==> Сборка фронтенда (Vite) -> frontend/dist"
cd frontend
npm install
npm run build
cd ..
# nginx root = frontend/dist (served in place) — no copy to /var/www needed.

echo "==> Перезапуск контейнеров (backend)"
docker compose down
docker compose up -d --build

echo "==> Статус контейнеров"
docker compose ps

echo "==> Последние строки логов (без -f, чтобы скрипт завершился)"
docker compose logs --tail 20

echo "==> Готово. Откройте приложение и обновите вкладку — Service Worker подхватит новый бандл."

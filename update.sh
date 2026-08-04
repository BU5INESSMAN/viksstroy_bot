#!/usr/bin/env bash
# Safe production update: one deploy at a time, staged frontend, health check,
# automatic rollback. Nginx serves frontend/dist directly.
set -Eeuo pipefail

cd "$(dirname "$0")"
exec 9>/run/viksstroy-update.lock
if ! flock -n 9; then
  echo "Обновление уже выполняется. Второй процесс не запущен."
  exit 1
fi

STATE_FILE="$(pwd)/data/deploy-state.json"
OLD_COMMIT="$(git rev-parse HEAD)"
NEW_COMMIT="$OLD_COMMIT"
STARTED_AT="$(date +%s)"
FRONTEND_BACKUP="frontend/dist.rollback"
DEPLOY_OK=0
RELEASE_VERSION="без номера"
RELEASE_NOTES=()
mkdir -p data

write_state() {
  local status="$1"
  local message="${2:-}"
  printf '{"status":"%s","started_at":%s,"updated_at":%s,"old_commit":"%s","new_commit":"%s","message":"%s"}\n' \
    "$status" "$STARTED_AT" "$(date +%s)" "$OLD_COMMIT" "$NEW_COMMIT" "${message//\"/\'}" > "$STATE_FILE"
}

notify_deploy() {
  local event="$1" title="$2" details="$3"
  if [ -x .venv/bin/python ]; then
    .venv/bin/python scripts/watchdog.py --notify "$event" --title "$title" --details "$details" >/dev/null 2>&1 || true
  fi
}

release_details() {
  printf 'Версия: %s\nКратко:\n' "$RELEASE_VERSION"
  local note
  for note in "${RELEASE_NOTES[@]}"; do
    printf '• %s\n' "$note"
  done
}

notify_deploy_group() {
  local title="$1" details="$2"
  if [ -x .venv/bin/python ]; then
    .venv/bin/python scripts/watchdog.py --group --title "$title" --details "$details" >/dev/null 2>&1 || true
  fi
}

rollback() {
  local reason="$1"
  write_state "rollback" "$reason"
  notify_deploy "deploy_failed" "Ошибка обновления" "$reason; запускается автоматический откат"
  notify_deploy_group "❌ Обновление не завершено" "$(release_details)Причина: $reason\nВыполняется автоматический откат."
  echo "Ошибка обновления: $reason"
  git reset --hard "$OLD_COMMIT"
  if [ -d "$FRONTEND_BACKUP" ]; then
    rm -rf frontend/dist
    mv "$FRONTEND_BACKUP" frontend/dist
  fi
  timeout 12m docker compose up -d --build || true
  write_state "failed" "$reason; выполнен откат"
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ] && [ "$DEPLOY_OK" -ne 1 ]; then
    rollback "команда завершилась с кодом $code"
  fi
  exit "$code"
}
trap on_exit EXIT

write_state "running" "получение обновления"
echo "==> Получение origin/master"
timeout 2m git fetch origin master
NEW_COMMIT="$(git rev-parse origin/master)"
git reset --hard "$NEW_COMMIT"
if [ -f deploy/release.env ]; then
  # shellcheck disable=SC1091
  source deploy/release.env
fi
notify_deploy "deploy_started" "Обновление началось" "Запускается версия $RELEASE_VERSION"
notify_deploy_group "🔄 Обновление системы" "$(release_details)Возможна короткая перезагрузка приложения."

echo "==> Проверка и сборка интерфейса во временный каталог"
rm -rf frontend/dist.next
(
  cd frontend
  timeout 5m npm ci --no-audit --no-fund
  timeout 8m npm run build -- --outDir dist.next
)
test -f frontend/dist.next/index.html

echo "==> Сборка и мягкая замена контейнеров"
write_state "running" "сборка контейнеров"
timeout 15m docker compose build
timeout 5m docker compose up -d --remove-orphans

echo "==> Проверка API"
healthy=0
for _ in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:8000/api/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done
if [ "$healthy" -ne 1 ]; then
  rollback "API не прошёл проверку готовности"
  trap - EXIT
  exit 1
fi

echo "==> Переключение интерфейса"
rm -rf "$FRONTEND_BACKUP"
if [ -d frontend/dist ]; then mv frontend/dist "$FRONTEND_BACKUP"; fi
mv frontend/dist.next frontend/dist
rm -rf "$FRONTEND_BACKUP"

docker image prune -f >/dev/null
docker builder prune -f --filter "until=168h" >/dev/null
docker compose ps
docker compose logs --tail 20

DEPLOY_OK=1
write_state "succeeded" "обновление завершено"
notify_deploy "deploy_succeeded" "Обновление завершено" "Версия $NEW_COMMIT запущена, API прошёл проверку"
notify_deploy_group "✅ Обновление завершено" "$(release_details)API и база данных прошли проверку."
trap - EXIT
echo "Готово: $NEW_COMMIT"

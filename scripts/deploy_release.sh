#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

case "${1:-}" in
  "")
    exec env SEND_UPDATE_NOTIFICATIONS=0 ./update.sh
    ;;
  --notify)
    exec env SEND_UPDATE_NOTIFICATIONS=1 ./update.sh
    ;;
  *)
    echo "Использование: $0 [--notify]" >&2
    exit 2
    ;;
esac

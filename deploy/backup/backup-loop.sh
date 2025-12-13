#!/usr/bin/env bash
set -euo pipefail

interval="${BACKUP_INTERVAL_SEC:-86400}"
if ! [[ "$interval" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_INTERVAL_SEC must be an integer seconds" >&2
  exit 1
fi

while true; do
  /usr/local/bin/backup-once.sh || true
  sleep "$interval"
done


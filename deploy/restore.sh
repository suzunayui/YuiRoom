#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found" >&2
  exit 1
fi

BACKUP="${1:-}"
if [ -z "$BACKUP" ]; then
  latest="$(ls -1t "$ROOT_DIR"/backups/yuiroom-backup-*.tar.gz 2>/dev/null | head -n 1 || true)"
  if [ -z "$latest" ]; then
    echo "Usage: $0 <backup.tar.gz>" >&2
    echo "No backups found in ./backups" >&2
    exit 1
  fi
  BACKUP="$latest"
fi

if [ ! -f "$BACKUP" ]; then
  echo "Backup not found: $BACKUP" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tar -C "$tmp" -xzf "$BACKUP"

if [ ! -f "$tmp/dump.sql" ]; then
  echo "dump.sql not found in backup" >&2
  exit 1
fi
if [ ! -d "$tmp/secrets" ]; then
  echo "secrets not found in backup" >&2
  exit 1
fi

echo "Stopping services..."
docker compose up -d postgres

echo "Restoring secrets/..."
mkdir -p "$ROOT_DIR/secrets"
cp -a "$tmp/secrets/." "$ROOT_DIR/secrets/"

echo "Restoring database..."
docker compose exec -T postgres sh -eu -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <"$tmp/dump.sql"

echo "Restarting stack..."
docker compose up -d

echo "OK"


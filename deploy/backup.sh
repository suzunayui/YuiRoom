#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$BACKUP_DIR"

ts="$(date -u +"%Y%m%dT%H%M%SZ")"
name="yuiroom-backup-${ts}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Creating DB dump..."
docker compose exec -T postgres sh -eu -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' >"$tmp/dump.sql"

if [ ! -d "$ROOT_DIR/secrets" ]; then
  echo "secrets/ not found (run docker compose up once?)" >&2
  exit 1
fi

mkdir -p "$tmp/secrets"
cp -a "$ROOT_DIR/secrets/." "$tmp/secrets/"

if command -v git >/dev/null 2>&1 && [ -d "$ROOT_DIR/.git" ]; then
  git rev-parse HEAD >"$tmp/git_commit.txt" 2>/dev/null || true
fi
printf "%s\n" "$ts" >"$tmp/created_at_utc.txt"

out="$BACKUP_DIR/${name}.tar.gz"
tar -C "$tmp" -czf "$out" .

echo "OK: $out"


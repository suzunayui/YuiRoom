#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
SECRETS_DIR="${SECRETS_DIR:-/run/secrets}"
BACKUP_KEEP="${BACKUP_KEEP:-30}"

mkdir -p "$BACKUP_DIR"

pw_file="$SECRETS_DIR/postgres_password"
db_file="$SECRETS_DIR/database_url"

if [ ! -s "$pw_file" ]; then
  echo "missing secrets: $pw_file" >&2
  exit 1
fi

ts="$(date -u +"%Y%m%dT%H%M%SZ")"
name="yuiroom-backup-${ts}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export PGHOST="${PGHOST:-postgres}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-yuiroom}"
export PGDATABASE="${PGDATABASE:-yuiroom}"
export PGPASSWORD
PGPASSWORD="$(cat "$pw_file")"

echo "Creating DB dump..."
pg_dump --clean --if-exists --no-owner --no-privileges >"$tmp/dump.sql"

mkdir -p "$tmp/secrets"
if [ -d "$SECRETS_DIR" ]; then
  cp -a "$SECRETS_DIR/." "$tmp/secrets/"
fi
if [ -s "$db_file" ]; then
  cp -a "$db_file" "$tmp/database_url.txt"
fi
printf "%s\n" "$ts" >"$tmp/created_at_utc.txt"

out="$BACKUP_DIR/${name}.tar.gz"
tar -C "$tmp" -czf "$out" .

echo "OK: $out"

if [ "${BACKUP_KEEP}" != "0" ]; then
  # keep newest N backups
  ls -1t "$BACKUP_DIR"/yuiroom-backup-*.tar.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f --
fi


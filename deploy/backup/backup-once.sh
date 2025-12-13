#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
SECRETS_DIR="${SECRETS_DIR:-/run/secrets}"
BACKUP_KEEP="${BACKUP_KEEP:-30}"
VERIFY_BACKUP="${VERIFY_BACKUP:-0}"
VERIFY_DB_NAME="${VERIFY_DB_NAME:-yuiroom_verify}"
KEEP_VERIFY_DB="${KEEP_VERIFY_DB:-0}"

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

if [ "$VERIFY_BACKUP" = "1" ]; then
  if ! [[ "$VERIFY_DB_NAME" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "VERIFY_DB_NAME must match ^[a-zA-Z0-9_]+$" >&2
    exit 1
  fi

  echo "Verifying backup by restoring into database: $VERIFY_DB_NAME"
  # Recreate verify database (avoid touching production DB)
  psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${VERIFY_DB_NAME}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${VERIFY_DB_NAME};
CREATE DATABASE ${VERIFY_DB_NAME} OWNER ${PGUSER};
SQL

  psql -U "$PGUSER" -d "$VERIFY_DB_NAME" -v ON_ERROR_STOP=1 <"$tmp/dump.sql"
  psql -U "$PGUSER" -d "$VERIFY_DB_NAME" -v ON_ERROR_STOP=1 -c "SELECT COUNT(*)::int AS users FROM users;" >/dev/null
  psql -U "$PGUSER" -d "$VERIFY_DB_NAME" -v ON_ERROR_STOP=1 -c "SELECT COUNT(*)::int AS rooms FROM rooms;" >/dev/null

  if [ "$KEEP_VERIFY_DB" != "1" ]; then
    psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${VERIFY_DB_NAME};" >/dev/null
  fi
  echo "Verify OK"
fi

if [ "${BACKUP_KEEP}" != "0" ]; then
  # keep newest N backups
  ls -1t "$BACKUP_DIR"/yuiroom-backup-*.tar.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f --
fi

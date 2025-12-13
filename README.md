# YuiRoom

## Deploy (Caddy + HTTPS)

- **docker composeで全部起動**: `docker-compose.yml`（Caddy/Backend/Postgres + 初回シークレット生成）
- Caddy設定: `deploy/Caddyfile`（CSP/セキュリティヘッダー込み）

## Ubuntu 24.04: `git clone` → `docker compose up -d`

前提:
- `yuiroom.net` をサーバーIPに向ける
- ポート開放: `80/tcp`, `443/tcp`
- Docker + Compose plugin が入っている

手順（最短）:
1) `git clone ... && cd YuiRoom2`
2) `docker compose up -d --build`

生成物:
- 初回起動時に `./secrets/` に `postgres_password` / `auth_secret` / `database_url` を自動生成します（git管理外）

注意:
- Postgres 18+ はボリュームを `/var/lib/postgresql` にマウントする前提です（このリポジトリの`docker-compose.yml`は対応済み）。
- `postgres_password` は接続文字列に埋め込むため、URL安全な文字（hex）で生成します。

確認:
- `docker compose ps`
- `docker compose logs -f caddy`
- `docker compose logs -f backend`
- `docker compose ps` で `backend` / `postgres` が `(healthy)` になるのを確認（healthcheck有効）

## Backup / Restore (DB + secrets)

バックアップにはDBダンプと `./secrets/` が含まれます（= 機密情報を含むので取り扱い注意）。

- 作成: `bash deploy/backup.sh`（`./backups/` に `yuiroom-backup-*.tar.gz`）
- 復元: `bash deploy/restore.sh ./backups/yuiroom-backup-<...>.tar.gz`

### 自動バックアップ（docker compose）

`docker-compose.yml` に `backup` サービスがあります（PostgresへTCP接続して `pg_dump` します）。

- 保存先: `./backups/`
- 設定:
  - `BACKUP_INTERVAL_SEC`（秒、デフォルト24h）
  - `BACKUP_KEEP`（保持数、デフォルト30、`0`で無制限）
  - `VERIFY_BACKUP=1` でバックアップ直後に `yuiroom_verify` DBへリストアして検証（終わったら削除）
チャットアプリだよ！

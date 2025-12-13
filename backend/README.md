# Backend (Docker)

## 初回 `docker compose up -d` でシークレット自動生成

`backend/docker-compose.yml` は初回起動時に `backend/secrets/` へ強いランダム値を生成します（bind mount）。

- PostgreSQL: `backend/secrets/postgres_password`（コンテナ内では `/run/secrets/postgres_password`）
- Backend用: `backend/secrets/auth_secret`（`AUTH_SECRET_FILE` で利用可能）
- 接続文字列: `backend/secrets/database_url`（`DATABASE_URL_FILE` で利用可能）

例（ホストOSでbackendを動かす場合）:

- `DATABASE_URL_FILE=./secrets/database_url`
- `AUTH_SECRET_FILE=./secrets/auth_secret`

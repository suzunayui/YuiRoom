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

確認:
- `docker compose ps`
- `docker compose logs -f caddy`
- `docker compose logs -f backend`
チャットアプリだよ！

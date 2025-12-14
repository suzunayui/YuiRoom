import { Pool } from "pg";
import { readFileSync } from "node:fs";

function readEnvOrFile(name: string): string | null {
  const direct = (process.env[name] ?? "").trim();
  if (direct) return direct;
  const path = (process.env[`${name}_FILE`] ?? "").trim();
  if (!path) return null;
  try {
    const v = readFileSync(path, "utf-8").trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

const databaseUrl = readEnvOrFile("DATABASE_URL");

export const pool = new Pool({
  ...(databaseUrl ? { connectionString: databaseUrl } : {}),
});

export async function initDb() {
  // tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      current_challenge TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_mime TEXT;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_data BYTEA;

    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INT NOT NULL DEFAULT 0,
      transports TEXT[] NOT NULL DEFAULT '{}'::text[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id
      ON passkey_credentials(user_id);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'text'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL;

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS author_id TEXT;

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS author_name TEXT;

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

    UPDATE messages SET author_id = author WHERE author_id IS NULL;
    UPDATE messages SET author_name = author WHERE author_name IS NULL;

    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
      ON message_attachments(message_id);

    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(message_id, author, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
      ON message_reactions(message_id);

    CREATE INDEX IF NOT EXISTS idx_messages_channel_created_at
      ON messages(channel_id, created_at);

    -- polls
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_polls_message
      ON polls(message_id);

    CREATE TABLE IF NOT EXISTS poll_options (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_poll_options_poll
      ON poll_options(poll_id, position);

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(poll_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_poll_votes_poll
      ON poll_votes(poll_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_poll_votes_option
      ON poll_votes(option_id, created_at);

    -- friends
    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_friend_requests_to_user
      ON friend_requests(to_user_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_friend_requests_from_user
      ON friend_requests(from_user_id, created_at);

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user1_id, user2_id)
    );

    CREATE INDEX IF NOT EXISTS idx_friendships_user1
      ON friendships(user1_id);

    CREATE INDEX IF NOT EXISTS idx_friendships_user2
      ON friendships(user2_id);

    -- 1:1 dm
    CREATE TABLE IF NOT EXISTS dm_threads (
      id TEXT PRIMARY KEY,
      dm_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS dm_members (
      thread_id TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(thread_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_dm_members_user
      ON dm_members(user_id);

    CREATE TABLE IF NOT EXISTS dm_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created_at
      ON dm_messages(thread_id, created_at);

    CREATE TABLE IF NOT EXISTS dm_message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(message_id, user_id, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_dm_message_reactions_message_id
      ON dm_message_reactions(message_id);

    -- stickers (user-defined stamps)
    CREATE TABLE IF NOT EXISTS stickers (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Backward-compatible migration for existing deployments (CREATE TABLE won't add columns).
    ALTER TABLE stickers
      ADD COLUMN IF NOT EXISTS room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_stickers_owner_created_at
      ON stickers(owner_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_stickers_room_created_at
      ON stickers(room_id, created_at DESC);

    -- room bans
    CREATE TABLE IF NOT EXISTS room_bans (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      banned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(room_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_room_bans_room
      ON room_bans(room_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_room_bans_user
      ON room_bans(user_id, created_at);

    -- room members (private rooms)
    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(room_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_room_members_user
      ON room_members(user_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_room_members_room
      ON room_members(room_id, created_at);

    -- room invites
    CREATE TABLE IF NOT EXISTS room_invites (
      code TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      uses INT NOT NULL DEFAULT 0,
      max_uses INT NOT NULL DEFAULT 10,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
    );

    CREATE INDEX IF NOT EXISTS idx_room_invites_room
      ON room_invites(room_id, created_at);

    ALTER TABLE room_invites
      ADD COLUMN IF NOT EXISTS max_uses INT NOT NULL DEFAULT 10;

    ALTER TABLE room_invites
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days');

    -- audit logs (room owner can view)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE audit_logs
      ALTER COLUMN room_id DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_audit_logs_room_created_at
      ON audit_logs(room_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at
      ON audit_logs(actor_id, created_at DESC);
  `);

  // seed: ルームが空なら1セット作る
}

import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
  `);

  // seed: ルームが空なら1セット作る
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM rooms`);
  if (rows[0].c === 0) {
    await pool.query("BEGIN");
    try {
      await pool.query(`INSERT INTO rooms (id, name) VALUES ($1, $2)`, ["room_1", "Room 1"]);
      await pool.query(
        `INSERT INTO categories (id, room_id, name, position) VALUES
         ('cat_1', 'room_1', 'Category 1', 0),
         ('cat_2', 'room_1', 'Category 2', 1)`
      );
      await pool.query(
        `INSERT INTO channels (id, room_id, category_id, name, position) VALUES
         ('ch_general', 'room_1', 'cat_1', 'general', 0),
         ('ch_dev',     'room_1', 'cat_1', 'dev', 1),
         ('ch_random',  'room_1', 'cat_2', 'random', 0)`
      );
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
}

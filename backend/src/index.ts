import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb, pool } from "./db.js";
import { spawn } from "node:child_process";
import { randomUUID, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

type WsClient = {
  ws: WebSocket;
  userId: string;
  channels: Set<string>;
  dmThreads: Set<string>;
  home: boolean;
};

const wsClients = new Set<WsClient>();
const wsByChannel = new Map<string, Set<WsClient>>();
const wsByDmThread = new Map<string, Set<WsClient>>();
const wsByUserId = new Map<string, Set<WsClient>>();

function detectMp4(buf: Buffer): boolean {
  // ISO BMFF: size (4 bytes) + "ftyp" (4 bytes) + brand...
  return buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
}

function detectMp4VideoCodecHint(buf: Buffer): "h264" | "hevc" | "av1" | "vp9" | "unknown" {
  const has = (fourcc: string) => buf.includes(Buffer.from(fourcc));
  if (has("avc1") || has("avc3")) return "h264";
  if (has("hvc1") || has("hev1")) return "hevc";
  if (has("av01")) return "av1";
  if (has("vp09")) return "vp9";
  return "unknown";
}

async function transcodeMp4ToH264Aac(input: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    let done = false;
    const chunks: Buffer[] = [];
    let total = 0;
    let stderr = "";

    const finish = (err?: Error, out?: Buffer) => {
      if (done) return;
      done = true;
      try {
        ffmpeg.kill("SIGKILL");
      } catch {
        // ignore
      }
      if (err) reject(err);
      else resolve(out ?? Buffer.alloc(0));
    };

    const timeout = setTimeout(() => finish(new Error("attachment_transcode_timeout")), 60_000);

    ffmpeg.on("error", () => {
      clearTimeout(timeout);
      finish(new Error("attachment_transcode_unavailable"));
    });

    ffmpeg.stdout.on("data", (d: Buffer) => {
      total += d.length;
      if (total > 10 * 1024 * 1024) {
        clearTimeout(timeout);
        finish(new Error("attachment_transcode_output_too_large"));
        return;
      }
      chunks.push(d);
    });

    ffmpeg.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 1500) stderr += d.toString("utf8");
    });

    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        finish(undefined, Buffer.concat(chunks, total));
      } else {
        // stderrはログ用に残しつつ、APIのエラーは固定コードにする
        finish(new Error(stderr.trim() ? `attachment_transcode_failed:${stderr.trim()}` : "attachment_transcode_failed"));
      }
    });

    try {
      ffmpeg.stdin.end(input);
    } catch {
      clearTimeout(timeout);
      finish(new Error("attachment_transcode_failed"));
    }
  });
}

function wsSubscribe(map: Map<string, Set<WsClient>>, key: string, c: WsClient) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(c);
}

function wsUnsubscribe(map: Map<string, Set<WsClient>>, key: string, c: WsClient) {
  const set = map.get(key);
  if (!set) return;
  set.delete(c);
  if (set.size === 0) map.delete(key);
}

function wsSendSafe(c: WsClient, data: unknown) {
  try {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(data));
  } catch {
    // ignore
  }
}

function wsBroadcastChannel(channelId: string, data: unknown) {
  const set = wsByChannel.get(channelId);
  if (!set) return;
  for (const c of set) wsSendSafe(c, data);
}

function wsBroadcastDm(threadId: string, data: unknown) {
  const set = wsByDmThread.get(threadId);
  if (!set) return;
  for (const c of set) wsSendSafe(c, data);
}

function wsBroadcastUser(userId: string, data: unknown) {
  const set = wsByUserId.get(userId);
  if (!set) return;
  for (const c of set) {
    if (!c.home) continue;
    wsSendSafe(c, data);
  }
}

function wsBroadcastUserAll(userId: string, data: unknown) {
  const set = wsByUserId.get(userId);
  if (!set) return;
  for (const c of set) wsSendSafe(c, data);
}

function isUserOnline(userId: string) {
  const set = wsByUserId.get(userId);
  return !!set && set.size > 0;
}

async function wsKickUserFromRoom(userId: string, roomId: string) {
  const set = wsByUserId.get(userId);
  if (!set || set.size === 0) return;

  const { rows } = await pool.query(`SELECT id FROM channels WHERE room_id=$1`, [roomId]);
  const channelIds = new Set<string>(rows.map((r: any) => String(r.id)));

  for (const c of set) {
    for (const channelId of channelIds) {
      if (!c.channels.has(channelId)) continue;
      c.channels.delete(channelId);
      wsUnsubscribe(wsByChannel, channelId, c);
    }
  }

  wsBroadcastUserAll(userId, { type: "room_banned", roomId });
}

async function wsBroadcastRoom(roomId: string, data: unknown) {
  const { rows } = await pool.query(`SELECT id FROM channels WHERE room_id=$1`, [roomId]);
  for (const r of rows) {
    const channelId = String((r as any).id ?? "");
    if (!channelId) continue;
    wsBroadcastChannel(channelId, data);
  }
}

async function wsBroadcastRoomsForUser(userId: string, data: unknown) {
  const { rows } = await pool.query(
    `SELECT DISTINCT room_id
     FROM (
       SELECT room_id FROM room_members WHERE user_id=$1
       UNION ALL
       SELECT id AS room_id FROM rooms WHERE owner_id=$1
     ) t`,
    [userId]
  );
  for (const r of rows) {
    const roomId = String((r as any).room_id ?? "");
    if (!roomId) continue;
    await wsBroadcastRoom(roomId, { ...(data as any), roomId });
  }
}

async function wsRemoveUserFromRoom(userId: string, roomId: string, reasonType: "room_left" | "room_kicked") {
  const set = wsByUserId.get(userId);
  if (!set || set.size === 0) return;

  const { rows } = await pool.query(`SELECT id FROM channels WHERE room_id=$1`, [roomId]);
  const channelIds = new Set<string>(rows.map((r: any) => String(r.id)));

  for (const c of set) {
    for (const channelId of channelIds) {
      if (!c.channels.has(channelId)) continue;
      c.channels.delete(channelId);
      wsUnsubscribe(wsByChannel, channelId, c);
    }
  }

  wsBroadcastUserAll(userId, { type: reasonType, roomId });
}

const wsConnRateState = new Map<string, { resetAt: number; count: number }>();
const wsMsgRateState = new Map<string, { resetAt: number; count: number }>();
let wsMsgCleanupCounter = 0;

function wsAllowConnection(remoteAddress: string) {
  const key = `ws_conn:${remoteAddress || "unknown"}`;
  const now = Date.now();
  const cur = wsConnRateState.get(key);
  if (!cur || now >= cur.resetAt) {
    wsConnRateState.set(key, { resetAt: now + 60_000, count: 1 });
    return true;
  }
  if (cur.count >= 60) return false;
  cur.count += 1;
  return true;
}

function wsRateAllow(opts: { name: string; userId: string; windowMs: number; max: number }) {
  const key = `${opts.name}:u:${opts.userId}`;
  const now = Date.now();
  const cur = wsMsgRateState.get(key);

  if (!cur || now >= cur.resetAt) {
    wsMsgRateState.set(key, { resetAt: now + opts.windowMs, count: 1 });
    if ((wsMsgCleanupCounter++ & 0xff) === 0) {
      for (const [k, v] of wsMsgRateState) {
        if (now >= v.resetAt) wsMsgRateState.delete(k);
      }
    }
    return true;
  }

  if (cur.count >= opts.max) return false;
  cur.count += 1;
  return true;
}

function setupWebSocket(server: ReturnType<typeof createServer>) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    try {
      let origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
      // Some WebSocket clients (e.g. file:// contexts) send Origin: null.
      // We still require a valid auth token, so allow these origins.
      if (origin === "null" || origin.startsWith("file://")) origin = "";

      const wsOriginAllowlist = ((process.env.WS_ORIGIN ?? "").trim() || corsOriginRaw || "http://localhost:5173")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      function normalizeOrigin(s: string): string {
        try {
          return new URL(s).origin;
        } catch {
          return s.trim();
        }
      }

      const allowedOrigins = new Set(wsOriginAllowlist.map(normalizeOrigin));
      const normalizedOrigin = origin ? normalizeOrigin(origin) : "";

      if (normalizedOrigin && !allowedOrigins.has(normalizedOrigin)) {
        ws.close(1008, "origin_forbidden");
        return;
      }

      const remote = req.socket.remoteAddress || "unknown";
      if (!wsAllowConnection(remote)) {
        ws.close(1013, "rate_limited");
        return;
      }

      const url = new URL(req.url || "/ws", "http://localhost");
      const protocol = typeof (ws as any).protocol === "string" ? String((ws as any).protocol) : "";
      let token = "";
      if (protocol.startsWith("bearer.")) token = protocol.slice("bearer.".length);
      if (!token) {
        const header = String(req.headers["sec-websocket-protocol"] || "");
        for (const p of header.split(",").map((s) => s.trim())) {
          if (p.startsWith("bearer.")) {
            token = p.slice("bearer.".length);
            break;
          }
        }
      }
      const userId = token ? verifyAuthToken(token) : null;
      if (!userId) {
        ws.close(1008, "unauthorized");
        return;
      }

      const client: WsClient = {
        ws,
        userId,
        channels: new Set(),
        dmThreads: new Set(),
        home: false,
      };
      const wasOnline = isUserOnline(userId);
      wsClients.add(client);
      wsSubscribe(wsByUserId, userId, client);
      if (!wasOnline) {
        void wsBroadcastRoomsForUser(userId, { type: "room_presence", userId, online: true });
      }

      ws.on("message", async (raw: RawData) => {
        // Basic protection against huge messages / abuse.
        let rawLen = 0;
        if (raw instanceof Buffer) rawLen = raw.length;
        else if (raw instanceof ArrayBuffer) rawLen = raw.byteLength;
        else if (Array.isArray(raw)) rawLen = raw.reduce((sum, b: any) => sum + (b?.length ?? 0), 0);
        if (rawLen > 64 * 1024) {
          try {
            ws.close(1009, "message_too_big");
          } catch {
            // ignore
          }
          return;
        }

        if (!wsRateAllow({ name: "ws_any", userId: client.userId, windowMs: 10_000, max: 200 })) {
          try {
            ws.close(1013, "rate_limited");
          } catch {
            // ignore
          }
          return;
        }

        let msg: any;
        try {
          msg = JSON.parse(String(raw || ""));
        } catch {
          return;
        }
        if (!msg || typeof msg !== "object") return;

        // subscribe / unsubscribe
        if (msg.type === "subscribe" && typeof msg.channelId === "string") {
          if (!wsRateAllow({ name: "ws_subscribe", userId: client.userId, windowMs: 60_000, max: 120 })) {
            wsSendSafe(client, { type: "error", error: "rate_limited" });
            return;
          }
          const channelId = msg.channelId;

          const ch = await pool.query(`SELECT room_id FROM channels WHERE id=$1`, [channelId]);
          if ((ch.rowCount ?? 0) === 0) {
            wsSendSafe(client, { type: "error", error: "channel_not_found", channelId });
            return;
          }
          const roomId = String(ch.rows?.[0]?.room_id || "");
          if (roomId) {
            const banned = await pool.query(
              `SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2`,
              [roomId, client.userId]
            );
            if ((banned.rowCount ?? 0) > 0) {
              wsSendSafe(client, { type: "error", error: "room_banned", channelId });
              return;
            }

            const memberOk = await isRoomMemberOrPublic(roomId, client.userId);
            if (!memberOk) {
              wsSendSafe(client, { type: "error", error: "not_member", channelId });
              return;
            }
          }

          client.channels.add(channelId);
          wsSubscribe(wsByChannel, channelId, client);
          wsSendSafe(client, { type: "subscribed", channelId });
          return;
        }
        if (msg.type === "unsubscribe" && typeof msg.channelId === "string") {
          if (!wsRateAllow({ name: "ws_unsubscribe", userId: client.userId, windowMs: 60_000, max: 240 })) {
            wsSendSafe(client, { type: "error", error: "rate_limited" });
            return;
          }
          const channelId = msg.channelId;
          client.channels.delete(channelId);
          wsUnsubscribe(wsByChannel, channelId, client);
          return;
        }
        if (msg.type === "subscribe_dm" && typeof msg.threadId === "string") {
          if (!wsRateAllow({ name: "ws_subscribe_dm", userId: client.userId, windowMs: 60_000, max: 120 })) {
            wsSendSafe(client, { type: "error", error: "rate_limited", threadId: msg.threadId });
            return;
          }
          const threadId = msg.threadId;
          // membership check
          const member = await pool.query(
            `SELECT 1 FROM dm_members WHERE thread_id=$1 AND user_id=$2`,
            [threadId, client.userId]
          );
          if ((member.rowCount ?? 0) === 0) {
            wsSendSafe(client, { type: "error", error: "forbidden", threadId });
            return;
          }

          const otherQ = await pool.query(
            `SELECT user_id FROM dm_members WHERE thread_id=$1 AND user_id <> $2 LIMIT 1`,
            [threadId, client.userId]
          );
          const other = String(otherQ.rows?.[0]?.user_id || "");
          if (!other) {
            wsSendSafe(client, { type: "error", error: "forbidden", threadId });
            return;
          }
          if (!(await areFriends(client.userId, other))) {
            wsSendSafe(client, { type: "error", error: "not_friends", threadId });
            return;
          }

          client.dmThreads.add(threadId);
          wsSubscribe(wsByDmThread, threadId, client);
          wsSendSafe(client, { type: "subscribed_dm", threadId });
          return;
        }
        if (msg.type === "unsubscribe_dm" && typeof msg.threadId === "string") {
          if (!wsRateAllow({ name: "ws_unsubscribe_dm", userId: client.userId, windowMs: 60_000, max: 240 })) {
            wsSendSafe(client, { type: "error", error: "rate_limited", threadId: msg.threadId });
            return;
          }
          const threadId = msg.threadId;
          client.dmThreads.delete(threadId);
          wsUnsubscribe(wsByDmThread, threadId, client);
          return;
        }

        if (msg.type === "subscribe_home") {
          if (!wsRateAllow({ name: "ws_subscribe_home", userId: client.userId, windowMs: 60_000, max: 30 })) {
            wsSendSafe(client, { type: "error", error: "rate_limited" });
            return;
          }
          client.home = true;
          wsSendSafe(client, { type: "subscribed_home" });
          return;
        }
        if (msg.type === "unsubscribe_home") {
          if (!wsRateAllow({ name: "ws_unsubscribe_home", userId: client.userId, windowMs: 60_000, max: 60 })) {
            wsSendSafe(client, { type: "error", error: "rate_limited" });
            return;
          }
          client.home = false;
          return;
        }
      });

      ws.on("close", () => {
        const wasOnline = isUserOnline(client.userId);
        wsClients.delete(client);
        for (const ch of client.channels) wsUnsubscribe(wsByChannel, ch, client);
        for (const th of client.dmThreads) wsUnsubscribe(wsByDmThread, th, client);
        wsUnsubscribe(wsByUserId, client.userId, client);
        if (wasOnline && !isUserOnline(client.userId)) {
          void wsBroadcastRoomsForUser(client.userId, { type: "room_presence", userId: client.userId, online: false });
        }
      });

      wsSendSafe(client, { type: "hello", userId });
    } catch {
      try {
        ws.close(1011, "server_error");
      } catch {
        // ignore
      }
    }
  });
}

const app = express();
app.disable("x-powered-by");

const trustProxy = (process.env.TRUST_PROXY ?? "").trim();
if (trustProxy) {
  if (trustProxy === "true") app.set("trust proxy", true);
  else if (trustProxy === "false") app.set("trust proxy", false);
  else if (/^\d+$/.test(trustProxy)) app.set("trust proxy", Number(trustProxy));
  else app.set("trust proxy", trustProxy);
}

const corsOriginRaw = (process.env.CORS_ORIGIN ?? "").trim();
const corsOrigins = (corsOriginRaw || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: false,
  })
);

app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/auth/")) res.setHeader("cache-control", "no-store");
  next();
});

// Attachments are currently sent as base64 data URLs inside JSON.
// 10MB binary ~= 13.3MB base64, plus JSON overhead.
app.use(express.json({ limit: "25mb" }));

const RP_ID = process.env.RP_ID ?? "localhost";
const RP_ORIGIN = process.env.RP_ORIGIN ?? "http://localhost:5173";
const RP_NAME = process.env.RP_NAME ?? "YuiRoom";

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

const AUTH_SECRET = readEnvOrFile("AUTH_SECRET") ?? "dev-secret-change-me";
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

if (process.env.NODE_ENV === "production" && AUTH_SECRET === "dev-secret-change-me") {
  throw new Error("AUTH_SECRET must be set in production");
}

if (process.env.NODE_ENV === "production") {
  if (!corsOriginRaw) throw new Error("CORS_ORIGIN must be set in production");
  const wsOriginRaw = (process.env.WS_ORIGIN ?? "").trim();
  if (!wsOriginRaw) throw new Error("WS_ORIGIN must be set in production");
  if (!process.env.RP_ID?.trim()) throw new Error("RP_ID must be set in production");
  if (!process.env.RP_ORIGIN?.trim()) throw new Error("RP_ORIGIN must be set in production");
}

const USER_ID_REGEX = /^[a-z0-9_-]{3,32}$/;

function normalizeUserId(v: string) {
  return v.trim().toLowerCase();
}

function validateUserId(userId: unknown): string | null {
  if (typeof userId !== "string") return "userId_must_be_string";
  const v = normalizeUserId(userId);
  if (!v) return "userId_required";
  if (!USER_ID_REGEX.test(v)) return "userId_invalid";
  return null;
}

function validateDisplayName(name: unknown): string | null {
  if (typeof name !== "string") return "displayName_must_be_string";
  const v = name.trim();
  if (!v) return "displayName_required";
  if (v.length > 32) return "displayName_too_long";
  if (/[^\S\r\n]*[\r\n]+[^\S\r\n]*/.test(v)) return "displayName_no_newlines";
  return null;
}

function toBase64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(s: string) {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  return Buffer.from(base64 + pad, "base64");
}

function signAuthToken(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payloadObj = { sub: userId, iat: now, exp: now + TOKEN_TTL_SEC };
  const payload = toBase64url(Buffer.from(JSON.stringify(payloadObj), "utf-8"));
  const sig = toBase64url(createHmac("sha256", AUTH_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyAuthToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  const expected = toBase64url(createHmac("sha256", AUTH_SECRET).update(payload).digest());
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const json = fromBase64url(payload).toString("utf-8");
    const obj = JSON.parse(json);
    const sub = typeof obj?.sub === "string" ? obj.sub : null;
    const exp = typeof obj?.exp === "number" ? obj.exp : null;
    if (!sub || !exp) return null;
    const now = Math.floor(Date.now() / 1000);
    if (now >= exp) return null;
    const idErr = validateUserId(sub);
    if (idErr) return null;
    return normalizeUserId(sub);
  } catch {
    return null;
  }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const h = req.header("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const token = m?.[1]?.trim();
  if (!token) return res.status(401).json({ error: "auth_required" });
  const userId = verifyAuthToken(token);
  if (!userId) return res.status(401).json({ error: "auth_invalid" });
  (req as any).userId = userId;
  next();
}

function authedUserId(req: express.Request): string | null {
  const h = req.header("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const token = m?.[1]?.trim();
  if (!token) return null;
  return verifyAuthToken(token);
}

type RateLimitConfig = {
  name: string;
  windowMs: number;
  max: number;
  key: (req: express.Request) => string;
};

const rateLimitState = new Map<string, { resetAt: number; count: number }>();
let rateLimitCleanupCounter = 0;

function clientIp(req: express.Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(config: RateLimitConfig) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${config.name}:${config.key(req)}`;
    const now = Date.now();
    const cur = rateLimitState.get(key);

    if (!cur || now >= cur.resetAt) {
      rateLimitState.set(key, { resetAt: now + config.windowMs, count: 1 });
      if ((rateLimitCleanupCounter++ & 0xff) === 0) {
        for (const [k, v] of rateLimitState) {
          if (now >= v.resetAt) rateLimitState.delete(k);
        }
      }
      return next();
    }

    if (cur.count >= config.max) {
      const retryAfterSec = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
      res.setHeader("retry-after", String(retryAfterSec));
      return res.status(429).json({ error: "rate_limited" });
    }

    cur.count += 1;
    return next();
  };
}

function rateKeyByIp(req: express.Request) {
  return `ip:${clientIp(req)}`;
}

function rateKeyByUserOrIp(req: express.Request) {
  const userId = (req as any).userId as string | undefined;
  if (userId) return `u:${userId}`;
  return rateKeyByIp(req);
}

function validateName(name: unknown, field: string) {
  if (typeof name !== "string") return `${field}_must_be_string`;
  const v = name.trim();
  if (!v) return `${field}_required`;
  if (v.length > 64) return `${field}_too_long`;
  if (/[\r\n]/.test(v)) return `${field}_no_newlines`;
  return null;
}

function validateMessageContent(content: unknown) {
  if (typeof content !== "string") return "content_must_be_string";
  const v = content.trim();
  if (!v) return "content_required";
  if (v.length > 2000) return "content_too_long";
  return null;
}

function validateEmoji(emoji: unknown) {
  if (typeof emoji !== "string") return "emoji_must_be_string";
  const v = emoji.trim();
  if (!v) return "emoji_required";
  if (/\s/.test(v)) return "emoji_no_spaces";

  if (v.startsWith("sticker:")) {
    const id = v.slice("sticker:".length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return "sticker_invalid";
    }
    if (v.length > 80) return "emoji_too_long";
    return null;
  }

  if (v.length > 16) return "emoji_too_long";
  return null;
}

function validatePollQuestion(q: unknown) {
  if (typeof q !== "string") return "poll_question_must_be_string";
  const v = q.trim();
  if (!v) return "poll_question_required";
  if (v.length > 200) return "poll_question_too_long";
  return null;
}

function validatePollOptions(opts: unknown) {
  if (!Array.isArray(opts)) return "poll_options_must_be_array";
  const items = opts.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  const uniq = Array.from(new Set(items));
  if (uniq.length < 2) return "poll_options_too_few";
  if (uniq.length > 6) return "poll_options_too_many";
  for (const s of uniq) {
    if (s.length > 80) return "poll_option_too_long";
    if (/[\r\n]/.test(s)) return "poll_option_no_newlines";
  }
  return null;
}

function normalizeInviteCode(code: string) {
  return code.trim().toLowerCase();
}

function validateInviteCode(code: unknown) {
  if (typeof code !== "string") return "invite_code_must_be_string";
  const v = normalizeInviteCode(code);
  if (!v) return "invite_code_required";
  if (!/^[a-z0-9]{6,32}$/.test(v)) return "invite_code_invalid";
  return null;
}

async function writeAuditLog(entry: {
  roomId?: string | null;
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: any;
}) {
  const actorId = String(entry.actorId || "");
  const action = String(entry.action || "").trim();
  if (!actorId || !action) return;
  const roomId = entry.roomId == null ? null : String(entry.roomId);
  const targetType = entry.targetType != null ? String(entry.targetType) : null;
  const targetId = entry.targetId != null ? String(entry.targetId) : null;
  const meta = entry.meta === undefined ? null : entry.meta;
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, room_id, actor_id, action, target_type, target_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), roomId, actorId, action, targetType, targetId, meta]
    );
  } catch (e) {
    console.error("audit_log_failed", e);
  }
}

function pairKey(a: string, b: string) {
  const x = normalizeUserId(a);
  const y = normalizeUserId(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

async function areFriends(userA: string, userB: string) {
  const key = pairKey(userA, userB);
  const [u1, u2] = key.split("|");
  const r = await pool.query(
    `SELECT id FROM friendships WHERE user1_id=$1 AND user2_id=$2`,
    [u1, u2]
  );
  return (r.rowCount ?? 0) > 0;
}

async function isRoomOwner(roomId: string, userId: string) {
  const r = await pool.query(`SELECT owner_id FROM rooms WHERE id=$1`, [roomId]);
  if ((r.rowCount ?? 0) === 0) return null;
  const ownerId = r.rows?.[0]?.owner_id;
  if (!ownerId) return false;
  return String(ownerId) === userId;
}

async function assertRoomOwner(roomId: string, userId: string, res: any) {
  const ok = await isRoomOwner(roomId, userId);
  if (ok === null) {
    res.status(404).json({ error: "room_not_found" });
    return false;
  }
  if (!ok) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

async function isBannedFromRoom(roomId: string, userId: string) {
  const b = await pool.query(
    `SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2`,
    [roomId, userId]
  );
  return (b.rowCount ?? 0) > 0;
}

async function assertNotBannedFromRoom(roomId: string, userId: string, res: any) {
  if (await isBannedFromRoom(roomId, userId)) {
    res.status(403).json({ error: "room_banned" });
    return false;
  }
  return true;
}

async function isRoomMemberOrPublic(roomId: string, userId: string) {
  const r = await pool.query(`SELECT owner_id FROM rooms WHERE id=$1`, [roomId]);
  if ((r.rowCount ?? 0) === 0) return null;
  const ownerId = r.rows?.[0]?.owner_id;
  if (!ownerId) return true; // public room (legacy)
  if (String(ownerId) === userId) return true;
  const m = await pool.query(
    `SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`,
    [roomId, userId]
  );
  return (m.rowCount ?? 0) > 0;
}

async function assertRoomMember(roomId: string, userId: string, res: any) {
  const ok = await isRoomMemberOrPublic(roomId, userId);
  if (ok === null) {
    res.status(404).json({ error: "room_not_found" });
    return false;
  }
  if (!ok) {
    res.status(403).json({ error: "not_member" });
    return false;
  }
  return true;
}

async function isFirstRegisteredUser(userId: string) {
  const r = await pool.query(`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`);
  if ((r.rowCount ?? 0) === 0) return false;
  return String(r.rows?.[0]?.id || "") === userId;
}

async function buildPollsByMessageIds(messageIds: string[], viewerUserId: string | null) {
  const byMessageId: Record<
    string,
    | {
        id: string;
        question: string;
        options: Array<{ id: string; text: string; votes: number; byMe: boolean }>;
      }
    | undefined
  > = {};
  if (!messageIds.length) return byMessageId;

  const polls = await pool.query(
    `SELECT id, message_id, question
     FROM polls
     WHERE message_id = ANY($1::text[])`,
    [messageIds]
  );
  if ((polls.rowCount ?? 0) === 0) return byMessageId;

  const pollIds = polls.rows.map((r) => String(r.id));

  const votes = await pool.query(
    `SELECT o.poll_id, o.id AS option_id, o.text, o.position,
            COUNT(v.user_id)::int AS votes,
            BOOL_OR(v.user_id = $2) AS by_me
     FROM poll_options o
     LEFT JOIN poll_votes v
       ON v.option_id = o.id
     WHERE o.poll_id = ANY($1::text[])
     GROUP BY o.poll_id, o.id, o.text, o.position
     ORDER BY o.poll_id, o.position ASC`,
    [pollIds, viewerUserId || ""]
  );

  const optionsByPollId: Record<string, Array<{ id: string; text: string; votes: number; byMe: boolean }>> = {};
  for (const row of votes.rows) {
    const pollId = String(row.poll_id);
    (optionsByPollId[pollId] ||= []).push({
      id: String(row.option_id),
      text: String(row.text),
      votes: Number(row.votes ?? 0) || 0,
      byMe: Boolean(row.by_me),
    });
  }

  for (const p of polls.rows) {
    const pollId = String(p.id);
    const messageId = String(p.message_id);
    byMessageId[messageId] = {
      id: pollId,
      question: String(p.question),
      options: optionsByPollId[pollId] ?? [],
    };
  }

  return byMessageId;
}

type ParsedAttachmentResult =
  | { ok: true; mime: string; bytes: Buffer }
  | { ok: false; error: string };

function parseDataUrlAttachmentDetailed(dataUrl: string): ParsedAttachmentResult {
  // data:<mime>;base64,....
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m || !m[1] || !m[2]) return { ok: false, error: "attachment_invalid_dataUrl" };
  const declaredMime = String(m[1]).toLowerCase();
  const b64 = String(m[2]);
  const bytes = Buffer.from(b64, "base64");
  if (!bytes || bytes.length < 12) return { ok: false, error: "attachment_invalid_dataUrl" };

  function detectRasterImageMime(buf: Buffer): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return "image/png";
    }

    // JPEG: FF D8 FF
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "image/jpeg";
    }

    // GIF: GIF87a / GIF89a
    if (
      buf.length >= 6 &&
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) &&
      buf[5] === 0x61
    ) {
      return "image/gif";
    }

    // WEBP: "RIFF" .... "WEBP"
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      return "image/webp";
    }

    return null;
  }

  const imageDetected = detectRasterImageMime(bytes);
  if (imageDetected) {
    const normalizedDeclared =
      declaredMime === "image/jpg" ? "image/jpeg" : declaredMime === "image/pjpeg" ? "image/jpeg" : declaredMime;
    const allowedDeclared = new Set(["image/png", "image/jpeg", "image/jpg", "image/pjpeg", "image/webp", "image/gif"]);
    if (!allowedDeclared.has(declaredMime)) return { ok: false, error: "attachment_invalid_dataUrl" };
    if (normalizedDeclared !== imageDetected) return { ok: false, error: "attachment_invalid_dataUrl" };
    return { ok: true, mime: imageDetected, bytes };
  }

  if (declaredMime === "video/mp4" && detectMp4(bytes)) {
    return { ok: true, mime: "video/mp4", bytes };
  }

  return { ok: false, error: "attachment_invalid_dataUrl" };
}

function parseDataUrlAttachment(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const r = parseDataUrlAttachmentDetailed(dataUrl);
  if (!r.ok) return null;
  return { mime: r.mime, bytes: r.bytes };
}

function parseDataUrlImage(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const parsed = parseDataUrlAttachment(dataUrl);
  if (!parsed) return null;
  if (!parsed.mime.startsWith("image/")) return null;
  return parsed;
}

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Stickers (user-defined stamps) ---

app.get(
  "/stickers",
  requireAuth,
  rateLimit({ name: "stickers_list", windowMs: 10_000, max: 30, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const me = (req as any).userId as string;
    const r = await pool.query(
      `SELECT id, name, mime_type, created_at
       FROM stickers
       WHERE owner_id=$1
       ORDER BY created_at DESC
       LIMIT 200`,
      [me]
    );
    res.json(
      r.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        mimeType: String(row.mime_type ?? ""),
        createdAt: new Date(row.created_at).toISOString(),
      }))
    );
  }
);

app.post(
  "/stickers",
  requireAuth,
  rateLimit({ name: "stickers_create", windowMs: 60_000, max: 30, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const me = (req as any).userId as string;
    const dataUrl = req.body?.dataUrl;
    if (typeof dataUrl !== "string") return res.status(400).json({ error: "sticker_dataUrl_required" });
    const parsed = parseDataUrlImage(String(dataUrl));
    if (!parsed) return res.status(400).json({ error: "sticker_invalid_dataUrl" });
    if (parsed.bytes.length > 600_000) return res.status(400).json({ error: "sticker_too_large" });

    const nameRaw = typeof req.body?.name === "string" ? String(req.body.name) : "";
    const name = nameRaw.trim().slice(0, 32);

    const id = randomUUID();
    await pool.query(
      `INSERT INTO stickers (id, owner_id, name, mime_type, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, me, name, parsed.mime, parsed.bytes]
    );
    res.status(201).json({ id, name, mimeType: parsed.mime });
  }
);

app.delete(
  "/stickers/:stickerId",
  requireAuth,
  rateLimit({ name: "stickers_delete", windowMs: 60_000, max: 60, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const me = (req as any).userId as string;
    const stickerId = String(req.params.stickerId || "");
    if (!stickerId) return res.status(400).json({ error: "stickerId_required" });

    const del = await pool.query(`DELETE FROM stickers WHERE id=$1 AND owner_id=$2`, [stickerId, me]);
    if ((del.rowCount ?? 0) === 0) return res.status(404).json({ error: "sticker_not_found" });

    const emoji = `sticker:${stickerId}`;
    await pool.query(`DELETE FROM message_reactions WHERE emoji=$1`, [emoji]);
    await pool.query(`DELETE FROM dm_message_reactions WHERE emoji=$1`, [emoji]);

    res.json({ ok: true });
  }
);

app.get(
  "/stickers/:stickerId",
  requireAuth,
  rateLimit({ name: "stickers_get", windowMs: 60_000, max: 300, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const stickerId = String(req.params.stickerId || "");
    if (!stickerId) return res.status(400).json({ error: "stickerId_required" });

    const r = await pool.query(`SELECT mime_type, data FROM stickers WHERE id=$1`, [stickerId]);
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "sticker_not_found" });

    const mime = String(r.rows?.[0]?.mime_type || "application/octet-stream");
    const data = r.rows?.[0]?.data as Buffer;

    res.setHeader("cache-control", "private, max-age=60");
    res.setHeader("content-disposition", "inline");
    res.setHeader("content-type", mime);
    res.send(data);
  }
);

// --- Friends / DM (Home) ---

// list friends
app.get("/friends", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const { rows } = await pool.query(
    `SELECT
        CASE WHEN f.user1_id=$1 THEN f.user2_id ELSE f.user1_id END AS user_id,
        u.display_name,
        (u.avatar_data IS NOT NULL) AS has_avatar
     FROM friendships f
     JOIN users u
       ON u.id = CASE WHEN f.user1_id=$1 THEN f.user2_id ELSE f.user1_id END
     WHERE f.user1_id=$1 OR f.user2_id=$1
     ORDER BY u.display_name ASC`,
    [me]
  );
  res.json(rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, hasAvatar: !!r.has_avatar })));
});

// delete friend (unfriend)
app.delete("/friends/:userId", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const otherParam = req.params.userId;
  const otherErr = validateUserId(otherParam);
  if (otherErr) return res.status(400).json({ error: otherErr });
  const other = normalizeUserId(String(otherParam));
  if (other === me) return res.status(400).json({ error: "cannot_unfriend_self" });

  const key = pairKey(me, other);
  const [u1, u2] = key.split("|");

  // remove friendship
  const del = await pool.query(
    `DELETE FROM friendships WHERE user1_id=$1 AND user2_id=$2`,
    [u1, u2]
  );
  if ((del.rowCount ?? 0) === 0) return res.status(404).json({ error: "not_friends" });

  // clean up pending requests between them
  await pool.query(
    `UPDATE friend_requests
     SET status='rejected'
     WHERE status='pending'
       AND ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1))`,
    [me, other]
  );

  // realtime: update both sides
  wsBroadcastUser(me, { type: "home_updated" });
  wsBroadcastUser(other, { type: "home_updated" });

  void writeAuditLog({
    roomId: null,
    actorId: me,
    action: "friend_delete",
    targetType: "user",
    targetId: other,
  });

  res.json({ ok: true });
});

// list friend requests
app.get("/friends/requests", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const incoming = await pool.query(
    `SELECT fr.id, fr.from_user_id AS user_id, u.display_name, (u.avatar_data IS NOT NULL) AS has_avatar
     FROM friend_requests fr
     JOIN users u ON u.id = fr.from_user_id
     WHERE fr.to_user_id=$1 AND fr.status='pending'
     ORDER BY fr.created_at DESC`,
    [me]
  );
  const outgoing = await pool.query(
    `SELECT fr.id, fr.to_user_id AS user_id, u.display_name, (u.avatar_data IS NOT NULL) AS has_avatar
     FROM friend_requests fr
     JOIN users u ON u.id = fr.to_user_id
     WHERE fr.from_user_id=$1 AND fr.status='pending'
     ORDER BY fr.created_at DESC`,
    [me]
  );
  res.json({
    incoming: incoming.rows.map((r) => ({ id: r.id, userId: r.user_id, displayName: r.display_name, hasAvatar: !!r.has_avatar })),
    outgoing: outgoing.rows.map((r) => ({ id: r.id, userId: r.user_id, displayName: r.display_name, hasAvatar: !!r.has_avatar })),
  });
});

// send friend request
app.post("/friends/requests", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const toErr = validateUserId(req.body?.toUserId);
  if (toErr) return res.status(400).json({ error: toErr });
  const toUserId = normalizeUserId(req.body.toUserId);
  if (toUserId === me) return res.status(400).json({ error: "cannot_friend_self" });

  const u = await pool.query(`SELECT id FROM users WHERE id=$1`, [toUserId]);
  if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });

  if (await areFriends(me, toUserId)) return res.status(409).json({ error: "already_friends" });

  const existing = await pool.query(
    `SELECT id FROM friend_requests
     WHERE status='pending'
       AND ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1))`,
    [me, toUserId]
  );
  if ((existing.rowCount ?? 0) > 0) return res.status(409).json({ error: "request_already_exists" });

  const id = randomUUID();
  await pool.query(
    `INSERT INTO friend_requests (id, from_user_id, to_user_id, status)
     VALUES ($1, $2, $3, 'pending')`,
    [id, me, toUserId]
  );

  // realtime: update both sides (incoming/outgoing)
  wsBroadcastUser(toUserId, { type: "home_updated" });
  wsBroadcastUser(me, { type: "home_updated" });

  void writeAuditLog({
    roomId: null,
    actorId: me,
    action: "friend_request_send",
    targetType: "user",
    targetId: toUserId,
    meta: { requestId: id },
  });

  res.status(201).json({ ok: true, id });
});

// accept friend request
app.post("/friends/requests/:requestId/accept", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const requestId = String(req.params.requestId || "");
  if (!requestId) return res.status(400).json({ error: "requestId_required" });

  await pool.query("BEGIN");
  try {
    let otherUserId: string | null = null;
    const fr = await pool.query(
      `SELECT id, from_user_id, to_user_id, status
       FROM friend_requests
       WHERE id=$1`,
      [requestId]
    );
    if ((fr.rowCount ?? 0) === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "request_not_found" });
    }
    const row = fr.rows[0];
    otherUserId = String(row.from_user_id || "") || null;
    if (row.to_user_id !== me) {
      await pool.query("ROLLBACK");
      return res.status(403).json({ error: "forbidden" });
    }
    if (row.status !== "pending") {
      await pool.query("ROLLBACK");
      return res.status(409).json({ error: "request_not_pending" });
    }

    const key = pairKey(row.from_user_id, row.to_user_id);
    const [u1, u2] = key.split("|");
    await pool.query(
      `INSERT INTO friendships (id, user1_id, user2_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user1_id, user2_id) DO NOTHING`,
      [randomUUID(), u1, u2]
    );

    await pool.query(`UPDATE friend_requests SET status='accepted' WHERE id=$1`, [requestId]);

    // reverse pending request cleanup
    await pool.query(
      `UPDATE friend_requests
       SET status='rejected'
       WHERE status='pending'
         AND ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1))
         AND id <> $3`,
      [row.from_user_id, row.to_user_id, requestId]
    );

    await pool.query("COMMIT");

    // realtime: update both sides (requests removed, friend added)
    wsBroadcastUser(me, { type: "home_updated" });
    if (otherUserId) wsBroadcastUser(otherUserId, { type: "home_updated" });

    if (otherUserId) {
      void writeAuditLog({
        roomId: null,
        actorId: me,
        action: "friend_request_accept",
        targetType: "user",
        targetId: otherUserId,
        meta: { requestId },
      });
    }

    res.json({ ok: true });
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
});

// reject friend request
app.post("/friends/requests/:requestId/reject", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const requestId = String(req.params.requestId || "");
  if (!requestId) return res.status(400).json({ error: "requestId_required" });

  const fr = await pool.query(
    `SELECT id, from_user_id, to_user_id, status FROM friend_requests WHERE id=$1`,
    [requestId]
  );
  if ((fr.rowCount ?? 0) === 0) return res.status(404).json({ error: "request_not_found" });
  const row = fr.rows[0];
  if (row.to_user_id !== me) return res.status(403).json({ error: "forbidden" });
  if (row.status !== "pending") return res.status(409).json({ error: "request_not_pending" });

  await pool.query(`UPDATE friend_requests SET status='rejected' WHERE id=$1`, [requestId]);

  // realtime: update both sides
  wsBroadcastUser(me, { type: "home_updated" });
  const other = String(row.from_user_id || "");
  if (other) wsBroadcastUser(other, { type: "home_updated" });

  if (other) {
    void writeAuditLog({
      roomId: null,
      actorId: me,
      action: "friend_request_reject",
      targetType: "user",
      targetId: other,
      meta: { requestId },
    });
  }

  res.json({ ok: true });
});

// list dm threads
app.get("/dm/threads", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const { rows } = await pool.query(
    `SELECT t.id AS thread_id,
            other.id AS user_id,
            other.display_name,
            (other.avatar_data IS NOT NULL) AS has_avatar
     FROM dm_members m
     JOIN dm_threads t ON t.id = m.thread_id
     JOIN dm_members m2 ON m2.thread_id = m.thread_id AND m2.user_id <> $1
     JOIN users other ON other.id = m2.user_id
     JOIN friendships f
       ON f.user1_id = LEAST($1, other.id)
      AND f.user2_id = GREATEST($1, other.id)
     WHERE m.user_id = $1
     ORDER BY t.created_at DESC`,
    [me]
  );
  res.json(rows.map((r) => ({ threadId: r.thread_id, userId: r.user_id, displayName: r.display_name, hasAvatar: !!r.has_avatar })));
});

// open or create 1:1 dm thread with friend
app.post("/dm/threads", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const otherErr = validateUserId(req.body?.userId);
  if (otherErr) return res.status(400).json({ error: otherErr });
  const other = normalizeUserId(req.body.userId);
  if (other === me) return res.status(400).json({ error: "cannot_dm_self" });

  const u = await pool.query(`SELECT id FROM users WHERE id=$1`, [other]);
  if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });

  if (!(await areFriends(me, other))) return res.status(403).json({ error: "not_friends" });

  const key = pairKey(me, other);
  const existing = await pool.query(`SELECT id FROM dm_threads WHERE dm_key=$1`, [key]);
  if ((existing.rowCount ?? 0) > 0) {
    return res.json({ ok: true, threadId: existing.rows[0].id });
  }

  const threadId = randomUUID();
  await pool.query("BEGIN");
  try {
    await pool.query(`INSERT INTO dm_threads (id, dm_key) VALUES ($1, $2)`, [threadId, key]);
    await pool.query(`INSERT INTO dm_members (thread_id, user_id) VALUES ($1, $2)`, [threadId, me]);
    await pool.query(`INSERT INTO dm_members (thread_id, user_id) VALUES ($1, $2)`, [threadId, other]);
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    // race: if created by other request
    const ex2 = await pool.query(`SELECT id FROM dm_threads WHERE dm_key=$1`, [key]);
    if ((ex2.rowCount ?? 0) > 0) return res.json({ ok: true, threadId: ex2.rows[0].id });
    throw e;
  }

  void writeAuditLog({
    roomId: null,
    actorId: me,
    action: "dm_thread_create",
    targetType: "user",
    targetId: other,
    meta: { threadId },
  });

  res.status(201).json({ ok: true, threadId });
});

// list dm messages
app.get("/dm/threads/:threadId/messages", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const threadId = String(req.params.threadId || "");
  if (!threadId) return res.status(400).json({ error: "threadId_required" });

  const member = await pool.query(`SELECT 1 FROM dm_members WHERE thread_id=$1 AND user_id=$2`, [threadId, me]);
  if ((member.rowCount ?? 0) === 0) return res.status(403).json({ error: "forbidden" });

  const otherQ = await pool.query(
    `SELECT user_id FROM dm_members WHERE thread_id=$1 AND user_id <> $2 LIMIT 1`,
    [threadId, me]
  );
  const other = String(otherQ.rows?.[0]?.user_id || "");
  if (!other) return res.status(403).json({ error: "forbidden" });
  if (!(await areFriends(me, other))) return res.status(403).json({ error: "not_friends" });

  const limitRaw = req.query.limit;
  const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 50) || 50));

  const before = typeof req.query.before === "string" ? req.query.before : null;

  const params: any[] = [threadId];
  let where = `m.thread_id=$1`;
  if (before && before.trim()) {
    params.push(before.trim());
    where += ` AND m.created_at < $${params.length}`;
  }
  params.push(limit + 1);

  const { rows } = await pool.query(
    `SELECT m.id, m.thread_id, m.author_id, u.display_name AS author_name,
            (u.avatar_data IS NOT NULL) AS author_has_avatar,
            m.content, m.created_at
     FROM dm_messages m
     JOIN users u ON u.id = m.author_id
     WHERE ${where}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse(); // oldest -> newest

  const messageIds = page.map((r) => String(r.id));
  const reactionsByMessage: Record<string, Record<string, { emoji: string; count: number; byMe: boolean }>> = {};
  if (messageIds.length > 0) {
    const rr = await pool.query(
      `SELECT message_id, emoji, user_id
       FROM dm_message_reactions
       WHERE message_id = ANY($1::text[])`,
      [messageIds]
    );
    for (const row of rr.rows) {
      const byEmoji = (reactionsByMessage[String(row.message_id)] ||= {});
      const item = (byEmoji[String(row.emoji)] ||= { emoji: String(row.emoji), count: 0, byMe: false });
      item.count += 1;
      if (String(row.user_id) === me) item.byMe = true;
    }
  }

  res.json({
    items: page.map((r) => ({
      id: r.id,
      thread_id: r.thread_id,
      author_id: r.author_id,
      author: r.author_name,
      author_has_avatar: !!r.author_has_avatar,
      content: r.content,
      created_at: r.created_at,
      reactions: Object.values(reactionsByMessage[String(r.id)] ?? {}),
    })),
    hasMore,
  });
});

// send dm message
app.post(
  "/dm/threads/:threadId/messages",
  requireAuth,
  rateLimit({ name: "dm_message_create", windowMs: 10_000, max: 15, key: rateKeyByUserOrIp }),
  async (req, res) => {
  const me = (req as any).userId as string;
  const threadId = String(req.params.threadId || "");
  if (!threadId) return res.status(400).json({ error: "threadId_required" });

  const member = await pool.query(`SELECT 1 FROM dm_members WHERE thread_id=$1 AND user_id=$2`, [threadId, me]);
  if ((member.rowCount ?? 0) === 0) return res.status(403).json({ error: "forbidden" });

  const otherQ = await pool.query(
    `SELECT user_id FROM dm_members WHERE thread_id=$1 AND user_id <> $2 LIMIT 1`,
    [threadId, me]
  );
  const other = String(otherQ.rows?.[0]?.user_id || "");
  if (!other) return res.status(403).json({ error: "forbidden" });
  if (!(await areFriends(me, other))) return res.status(403).json({ error: "not_friends" });

  const contentErr = validateMessageContent(req.body?.content);
  if (contentErr) return res.status(400).json({ error: contentErr });
  const content = String(req.body.content).trim();

  const id = randomUUID();
  await pool.query(
    `INSERT INTO dm_messages (id, thread_id, author_id, content)
     VALUES ($1, $2, $3, $4)`,
    [id, threadId, me, content]
  );

  const u = await pool.query(`SELECT display_name, (avatar_data IS NOT NULL) AS has FROM users WHERE id=$1`, [me]);
  const authorName = String(u.rows?.[0]?.display_name || me);
  const authorHasAvatar = !!u.rows?.[0]?.has;

  const payload = {
    id,
    thread_id: threadId,
    author_id: me,
    author: authorName,
    author_has_avatar: authorHasAvatar,
    content,
    created_at: new Date().toISOString(),
    reactions: [],
  };

  // realtime: broadcast to subscribers of this DM thread
  wsBroadcastDm(threadId, { type: "dm_message_created", threadId, message: payload });

  res.status(201).json(payload);
  }
);

// toggle dm reaction
app.post(
  "/dm/messages/:messageId/reactions/toggle",
  requireAuth,
  rateLimit({ name: "dm_reaction_toggle", windowMs: 10_000, max: 50, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const me = (req as any).userId as string;
    const messageId = String(req.params.messageId || "");
    if (!messageId) return res.status(400).json({ error: "messageId_required" });

    const emojiErr = validateEmoji(req.body?.emoji);
    if (emojiErr) return res.status(400).json({ error: emojiErr });
    const emoji = String(req.body.emoji).trim();

    const msg = await pool.query(`SELECT id, thread_id FROM dm_messages WHERE id=$1`, [messageId]);
    if ((msg.rowCount ?? 0) === 0) return res.status(404).json({ error: "message_not_found" });
    const threadId = String(msg.rows?.[0]?.thread_id || "");

    const member = await pool.query(`SELECT 1 FROM dm_members WHERE thread_id=$1 AND user_id=$2`, [threadId, me]);
    if ((member.rowCount ?? 0) === 0) return res.status(403).json({ error: "forbidden" });

    const otherQ = await pool.query(
      `SELECT user_id FROM dm_members WHERE thread_id=$1 AND user_id <> $2 LIMIT 1`,
      [threadId, me]
    );
    const other = String(otherQ.rows?.[0]?.user_id || "");
    if (!other) return res.status(403).json({ error: "forbidden" });
    if (!(await areFriends(me, other))) return res.status(403).json({ error: "not_friends" });

    const existing = await pool.query(
      `SELECT id FROM dm_message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,
      [messageId, me, emoji]
    );
    if ((existing.rowCount ?? 0) > 0) {
      await pool.query(
        `DELETE FROM dm_message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,
        [messageId, me, emoji]
      );
    } else {
      if (emoji.startsWith("sticker:")) {
        const stickerId = emoji.slice("sticker:".length);
        const s = await pool.query(`SELECT 1 FROM stickers WHERE id=$1`, [stickerId]);
        if ((s.rowCount ?? 0) === 0) return res.status(404).json({ error: "sticker_not_found" });
      }
      await pool.query(
        `INSERT INTO dm_message_reactions (id, message_id, user_id, emoji) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), messageId, me, emoji]
      );
    }

    const r = await pool.query(
      `SELECT emoji, user_id FROM dm_message_reactions WHERE message_id=$1`,
      [messageId]
    );
    const byEmoji: Record<string, { emoji: string; count: number; byMe: boolean }> = {};
    for (const row of r.rows) {
      const key = String(row.emoji);
      const item = (byEmoji[key] ||= { emoji: key, count: 0, byMe: false });
      item.count += 1;
      if (String(row.user_id) === me) item.byMe = true;
    }

    const reactions = Object.values(byEmoji);
    wsBroadcastDm(threadId, { type: "dm_reactions_updated", threadId, messageId, reactions });
    res.json({ messageId, reactions });
  }
);

// search dm messages (member + friends only)
app.get(
  "/dm/threads/:threadId/messages/search",
  requireAuth,
  rateLimit({ name: "dm_message_search", windowMs: 10_000, max: 30, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const me = (req as any).userId as string;
    const threadId = String(req.params.threadId || "");
    if (!threadId) return res.status(400).json({ error: "threadId_required" });

    const member = await pool.query(`SELECT 1 FROM dm_members WHERE thread_id=$1 AND user_id=$2`, [threadId, me]);
    if ((member.rowCount ?? 0) === 0) return res.status(403).json({ error: "forbidden" });

    const otherQ = await pool.query(
      `SELECT user_id FROM dm_members WHERE thread_id=$1 AND user_id <> $2 LIMIT 1`,
      [threadId, me]
    );
    const other = String(otherQ.rows?.[0]?.user_id || "");
    if (!other) return res.status(403).json({ error: "forbidden" });
    if (!(await areFriends(me, other))) return res.status(403).json({ error: "not_friends" });

    const qRaw = typeof req.query.q === "string" ? req.query.q : "";
    const q = qRaw.trim();
    if (!q) return res.status(400).json({ error: "q_required" });
    if (q.length > 100) return res.status(400).json({ error: "q_too_long" });

    const limitRaw = req.query.limit;
    const limit = Math.min(50, Math.max(1, Number(limitRaw ?? 20) || 20));

    const beforeRaw = typeof req.query.before === "string" ? req.query.before : "";
    let before: Date | null = null;
    if (beforeRaw) {
      const d = new Date(beforeRaw);
      if (!Number.isNaN(d.getTime())) before = d;
    }

    const { rows } = await pool.query(
      `SELECT m.id, m.thread_id, m.author_id, u.display_name AS author_name,
              (u.avatar_data IS NOT NULL) AS author_has_avatar,
              m.content, m.created_at
       FROM dm_messages m
       JOIN users u ON u.id = m.author_id
       WHERE m.thread_id=$1
         AND m.content ILIKE $2
         AND ($3::timestamptz IS NULL OR m.created_at < $3)
       ORDER BY m.created_at DESC
       LIMIT $4`,
      [threadId, `%${q}%`, before, limit + 1]
    );

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    res.json({
      items: page.map((r) => ({
        id: r.id,
        thread_id: r.thread_id,
        author_id: r.author_id,
        author: r.author_name,
        author_has_avatar: !!r.author_has_avatar,
        content: r.content,
        created_at: r.created_at,
      })),
      hasMore,
    });
  }
);

// user avatar (stored in DB)
app.get("/users/:userId/avatar", async (req, res) => {
  const userIdParam = req.params.userId;
  const userIdErr = validateUserId(userIdParam);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  const userId = normalizeUserId(String(userIdParam));

  const u = await pool.query(
    `SELECT avatar_mime, avatar_data FROM users WHERE id=$1`,
    [userId]
  );
  if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });
  const mime = u.rows[0]?.avatar_mime;
  const data = u.rows[0]?.avatar_data;
  if (!mime || !data) return res.status(404).json({ error: "avatar_not_found" });
  res.setHeader("content-type", mime);
  // simple cache: avatars change rarely
  res.setHeader("cache-control", "public, max-age=300");
  res.send(data);
});

app.post("/users/:userId/avatar", requireAuth, async (req, res) => {
  // NOTE: must be authenticated as the same user
  const userIdParam = req.params.userId;
  const userIdErr = validateUserId(userIdParam);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  const userId = normalizeUserId(String(userIdParam));

  const me = (req as any).userId as string;
  if (me !== userId) return res.status(403).json({ error: "forbidden" });

  const u = await pool.query(`SELECT id FROM users WHERE id=$1`, [userId]);
  if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });

  const dataUrl = req.body?.dataUrl;
  if (dataUrl == null || dataUrl === "") {
    await pool.query(`UPDATE users SET avatar_mime=NULL, avatar_data=NULL WHERE id=$1`, [userId]);
    return res.json({ ok: true });
  }
  if (typeof dataUrl !== "string") return res.status(400).json({ error: "dataUrl_must_be_string_or_null" });

  const parsed = parseDataUrlImage(String(dataUrl));
  if (!parsed) return res.status(400).json({ error: "avatar_invalid_dataUrl" });
  if (parsed.bytes.length > 2 * 1024 * 1024) return res.status(400).json({ error: "avatar_too_large" });

  await pool.query(
    `UPDATE users SET avatar_mime=$2, avatar_data=$3 WHERE id=$1`,
    [userId, parsed.mime, parsed.bytes]
  );
  return res.json({ ok: true });
});

// --- Passkey (WebAuthn) auth ---
app.post(
  "/auth/register/options",
  rateLimit({ name: "auth_register_options", windowMs: 60_000, max: 10, key: rateKeyByIp }),
  async (req, res) => {
  const userIdErr = validateUserId(req.body?.userId);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  const nameErr = validateDisplayName(req.body?.displayName);
  if (nameErr) return res.status(400).json({ error: nameErr });

  const userId = normalizeUserId(req.body.userId);
  const displayName = String(req.body.displayName).trim();

  const existing = await pool.query(`SELECT id FROM users WHERE id=$1`, [userId]);
  if ((existing.rowCount ?? 0) > 0) {
    const creds = await pool.query(`SELECT COUNT(*)::int AS c FROM passkey_credentials WHERE user_id=$1`, [userId]);
    if (creds.rows?.[0]?.c > 0) return res.status(409).json({ error: "user_exists" });
    await pool.query(`UPDATE users SET display_name=$2 WHERE id=$1`, [userId, displayName]);
  } else {
    await pool.query(`INSERT INTO users (id, display_name) VALUES ($1, $2)`, [userId, displayName]);
  }

  const userHandle = createHash("sha256").update(userId).digest();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: userId,
    userID: userHandle,
    userDisplayName: displayName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    timeout: 60_000,
    excludeCredentials: [],
  });

  await pool.query(`UPDATE users SET current_challenge=$2 WHERE id=$1`, [userId, options.challenge]);
  res.json(options);
  }
);

app.post(
  "/auth/register/verify",
  rateLimit({ name: "auth_register_verify", windowMs: 60_000, max: 10, key: rateKeyByIp }),
  async (req, res) => {
  const userIdErr = validateUserId(req.body?.userId);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  if (!req.body?.response) return res.status(400).json({ error: "response_required" });

  const userId = normalizeUserId(req.body.userId);
  const user = await pool.query(
    `SELECT id, display_name, current_challenge FROM users WHERE id=$1`,
    [userId]
  );
  if (user.rowCount === 0) return res.status(404).json({ error: "user_not_found" });

  const expectedChallenge = user.rows[0].current_challenge;
  if (!expectedChallenge) return res.status(400).json({ error: "challenge_missing" });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ error: "webauthn_verify_failed" });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "webauthn_not_verified" });
  }

  const cred = verification.registrationInfo.credential;
  const credentialId = String(cred.id);
  const publicKey = toBase64url(Buffer.from(cred.publicKey));
  const counter = Number(cred.counter) || 0;
  const transports = Array.isArray(cred.transports) ? cred.transports : [];

  await pool.query(
    `INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, counter, transports)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), userId, credentialId, publicKey, counter, transports]
  );
  await pool.query(`UPDATE users SET current_challenge=NULL WHERE id=$1`, [userId]);

  const token = signAuthToken(userId);
  res.json({ ok: true, userId, displayName: user.rows[0].display_name, token });
  }
);

app.post(
  "/auth/login/options",
  rateLimit({ name: "auth_login_options", windowMs: 60_000, max: 20, key: rateKeyByIp }),
  async (req, res) => {
  const userIdErr = validateUserId(req.body?.userId);
  if (userIdErr) return res.status(400).json({ error: userIdErr });

  const userId = normalizeUserId(req.body.userId);

  const user = await pool.query(`SELECT id FROM users WHERE id=$1`, [userId]);
  if (user.rowCount === 0) return res.status(404).json({ error: "user_not_found" });

  const creds = await pool.query(
    `SELECT credential_id, transports FROM passkey_credentials WHERE user_id=$1 ORDER BY created_at ASC`,
    [userId]
  );
  if (creds.rowCount === 0) return res.status(404).json({ error: "no_credentials" });

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    timeout: 60_000,
    allowCredentials: creds.rows.map((c) => ({
      id: c.credential_id,
      transports: Array.isArray(c.transports) ? c.transports : undefined,
    })),
  });

  await pool.query(`UPDATE users SET current_challenge=$2 WHERE id=$1`, [userId, options.challenge]);
  res.json(options);
  }
);

app.post(
  "/auth/login/verify",
  rateLimit({ name: "auth_login_verify", windowMs: 60_000, max: 20, key: rateKeyByIp }),
  async (req, res) => {
  const userIdErr = validateUserId(req.body?.userId);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  if (!req.body?.response) return res.status(400).json({ error: "response_required" });

  const userId = normalizeUserId(req.body.userId);
  const user = await pool.query(
    `SELECT id, display_name, current_challenge FROM users WHERE id=$1`,
    [userId]
  );
  if (user.rowCount === 0) return res.status(404).json({ error: "user_not_found" });

  const expectedChallenge = user.rows[0].current_challenge;
  if (!expectedChallenge) return res.status(400).json({ error: "challenge_missing" });

  const credentialId = req.body?.response?.id;
  if (typeof credentialId !== "string") return res.status(400).json({ error: "credentialId_missing" });

  const cred = await pool.query(
    `SELECT credential_id, public_key, counter, transports
     FROM passkey_credentials
     WHERE user_id=$1 AND credential_id=$2`,
    [userId, credentialId]
  );
  if (cred.rowCount === 0) return res.status(404).json({ error: "credential_not_found" });

  const row = cred.rows[0];

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: row.credential_id,
        publicKey: fromBase64url(row.public_key),
        counter: Number(row.counter) || 0,
        transports: Array.isArray(row.transports) ? row.transports : undefined,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ error: "webauthn_verify_failed" });
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return res.status(400).json({ error: "webauthn_not_verified" });
  }

  await pool.query(
    `UPDATE passkey_credentials SET counter=$3 WHERE user_id=$1 AND credential_id=$2`,
    [userId, credentialId, verification.authenticationInfo.newCounter]
  );
  await pool.query(`UPDATE users SET current_challenge=NULL WHERE id=$1`, [userId]);

  const token = signAuthToken(userId);
  res.json({ ok: true, userId, displayName: user.rows[0].display_name, token });
  }
);

// update user display name (server-side)
app.post("/users/:userId/displayName", requireAuth, async (req, res) => {
  const userIdParam = req.params.userId;
  const userIdErr = validateUserId(userIdParam);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  const userId = normalizeUserId(String(userIdParam));

  const me = (req as any).userId as string;
  if (me !== userId) return res.status(403).json({ error: "forbidden" });

  const nameErr = validateDisplayName(req.body?.displayName);
  if (nameErr) return res.status(400).json({ error: nameErr });
  const displayName = String(req.body.displayName).trim();

  const u = await pool.query(`SELECT id FROM users WHERE id=$1`, [userId]);
  if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });

  await pool.query(`UPDATE users SET display_name=$2 WHERE id=$1`, [userId, displayName]);
  return res.json({ ok: true });
});

// list rooms
app.get("/rooms", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.owner_id
     FROM rooms r
     WHERE NOT EXISTS (
       SELECT 1 FROM room_bans b
       WHERE b.room_id = r.id AND b.user_id = $1
     )
     AND (
       r.owner_id IS NULL
       OR r.owner_id = $1
       OR EXISTS (
         SELECT 1 FROM room_members rm
         WHERE rm.room_id = r.id AND rm.user_id = $1
       )
     )
     ORDER BY r.created_at ASC`,
    [me]
  );
  res.json(rows);
});

// create room
app.post("/rooms", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  if (!(await isFirstRegisteredUser(me))) {
    return res.status(403).json({ error: "only_first_user_can_create_rooms" });
  }
  const nameErr = validateName(req.body?.name, "name");
  if (nameErr) return res.status(400).json({ error: nameErr });

  const id = randomUUID();
  const name = String(req.body.name).trim();

  // Room作成時にデフォルト構成も同時に作成
  // - カテゴリ: 「一般」
  // - チャンネル: 「雑談」（上記カテゴリ配下）
  const categoryId = randomUUID();
  const channelId = randomUUID();

  await pool.query("BEGIN");
  try {
    await pool.query(`INSERT INTO rooms (id, name, owner_id) VALUES ($1, $2, $3)`, [id, name, me]);
    await pool.query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, me]
    );
    await pool.query(
      `INSERT INTO categories (id, room_id, name, position) VALUES ($1, $2, $3, $4)`,
      [categoryId, id, "一般", 0]
    );
    await pool.query(
      `INSERT INTO channels (id, room_id, category_id, name, position) VALUES ($1, $2, $3, $4, $5)`,
      [channelId, id, categoryId, "雑談", 0]
    );
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }

  void writeAuditLog({ roomId: id, actorId: me, action: "room_create", targetType: "room", targetId: id, meta: { name } });
  res.status(201).json({ id, name, owner_id: me });
});

// delete room
app.delete("/rooms/:roomId", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const r = await pool.query(`SELECT name FROM rooms WHERE id=$1`, [roomId]);
  const roomName = r.rows?.[0]?.name ? String(r.rows[0].name) : null;
  void writeAuditLog({ roomId, actorId: me, action: "room_delete", targetType: "room", targetId: roomId, meta: { name: roomName } });

  await pool.query(`DELETE FROM rooms WHERE id=$1`, [roomId]);
  res.json({ ok: true });
});

// room tree: categories + channels
app.get("/rooms/:roomId/tree", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });

  const room = await pool.query(`SELECT id, name, owner_id FROM rooms WHERE id=$1`, [roomId]);
  if (room.rowCount === 0) return res.status(404).json({ error: "room_not_found" });

  if (!(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (!(await assertRoomMember(roomId, me, res))) return;

  const cats = await pool.query(
    `SELECT id, name, position FROM categories WHERE room_id=$1 ORDER BY position ASC`,
    [roomId]
  );

  const chans = await pool.query(
    `SELECT id, name, position, category_id
     FROM channels
     WHERE room_id=$1
     ORDER BY category_id NULLS LAST, position ASC`,
    [roomId]
  );

  const byCat: Record<string, any[]> = {};
  for (const ch of chans.rows) {
    const key = ch.category_id ?? "__uncategorized__";
    (byCat[key] ||= []).push({ id: ch.id, name: ch.name, position: ch.position });
  }

  const categories = cats.rows.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    channels: byCat[c.id] ?? [],
  }));

  const uncategorized = byCat["__uncategorized__"] ?? [];

  res.json({
    room: room.rows[0],
    categories,
    uncategorized,
  });
});

// room bans (owner only)
app.get("/rooms/:roomId/bans", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const { rows } = await pool.query(
    `SELECT b.user_id, u.display_name, b.reason, b.created_at
     FROM room_bans b
     JOIN users u ON u.id = b.user_id
     WHERE b.room_id=$1
     ORDER BY b.created_at DESC`,
    [roomId]
  );
  res.json(rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, reason: r.reason ?? null, created_at: r.created_at })));
});

app.post("/rooms/:roomId/bans", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const userIdErr = validateUserId(req.body?.userId);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  const target = normalizeUserId(String(req.body.userId));
  if (target === me) return res.status(400).json({ error: "cannot_ban_self" });

  const u = await pool.query(`SELECT id FROM users WHERE id=$1`, [target]);
  if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });

  const reasonRaw = req.body?.reason;
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  if (reason.length > 200) return res.status(400).json({ error: "reason_too_long" });
  if (/[\r\n]/.test(reason)) return res.status(400).json({ error: "reason_no_newlines" });

  await pool.query(
    `INSERT INTO room_bans (id, room_id, user_id, banned_by, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [randomUUID(), roomId, target, me, reason || null]
  );

  void writeAuditLog({
    roomId,
    actorId: me,
    action: "room_ban",
    targetType: "user",
    targetId: target,
    meta: { reason: reason || null },
  });

  await wsBroadcastRoom(roomId, { type: "room_ban_changed", roomId, userId: target, banned: true });
  await wsKickUserFromRoom(target, roomId);
  res.json({ ok: true });
});

app.delete("/rooms/:roomId/bans/:userId", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const userIdErr = validateUserId(req.params.userId);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  const target = normalizeUserId(String(req.params.userId));

  await pool.query(`DELETE FROM room_bans WHERE room_id=$1 AND user_id=$2`, [roomId, target]);

  void writeAuditLog({
    roomId,
    actorId: me,
    action: "room_unban",
    targetType: "user",
    targetId: target,
  });

  await wsBroadcastRoom(roomId, { type: "room_ban_changed", roomId, userId: target, banned: false });
  wsBroadcastUserAll(target, { type: "room_unbanned", roomId });
  res.json({ ok: true });
});

// room invites (owner only)
app.post("/rooms/:roomId/invites", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  // legacy public rooms have no owner_id; disallow invites to avoid confusion
  const room = await pool.query(`SELECT owner_id FROM rooms WHERE id=$1`, [roomId]);
  if ((room.rowCount ?? 0) === 0) return res.status(404).json({ error: "room_not_found" });
  if (!room.rows?.[0]?.owner_id) return res.status(400).json({ error: "room_public_no_invite" });

  let code = "";
  for (let i = 0; i < 8; i++) {
    code = normalizeInviteCode(randomUUID().replace(/-/g, "").slice(0, 12));
    try {
      await pool.query(
        `INSERT INTO room_invites (code, room_id, created_by, max_uses, expires_at)
         VALUES ($1, $2, $3, 10, (now() + INTERVAL '7 days'))`,
        [code, roomId, me]
      );
      break;
    } catch (e: any) {
      // retry on conflict
      if (String(e?.code || "") === "23505") continue;
      throw e;
    }
  }

  if (!code) return res.status(500).json({ error: "invite_create_failed" });
  void writeAuditLog({
    roomId,
    actorId: me,
    action: "invite_create",
    targetType: "invite",
    targetId: code,
    meta: { maxUses: 10, expiresInDays: 7 },
  });
  res.status(201).json({ code, roomId });
});

app.get("/rooms/:roomId/invites", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const room = await pool.query(`SELECT owner_id FROM rooms WHERE id=$1`, [roomId]);
  if ((room.rowCount ?? 0) === 0) return res.status(404).json({ error: "room_not_found" });
  if (!room.rows?.[0]?.owner_id) return res.status(400).json({ error: "room_public_no_invite" });

  const { rows } = await pool.query(
    `SELECT code, uses, max_uses, expires_at, created_at
     FROM room_invites
     WHERE room_id=$1
     ORDER BY created_at DESC`,
    [roomId]
  );
  res.json(
    rows.map((r) => ({
      code: r.code,
      uses: Number(r.uses ?? 0),
      max_uses: Number(r.max_uses ?? 10),
      expires_at: r.expires_at,
      created_at: r.created_at,
    }))
  );
});

app.delete("/rooms/:roomId/invites/:code", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const room = await pool.query(`SELECT owner_id FROM rooms WHERE id=$1`, [roomId]);
  if ((room.rowCount ?? 0) === 0) return res.status(404).json({ error: "room_not_found" });
  if (!room.rows?.[0]?.owner_id) return res.status(400).json({ error: "room_public_no_invite" });

  const codeErr = validateInviteCode(req.params.code);
  if (codeErr) return res.status(400).json({ error: codeErr });
  const code = normalizeInviteCode(String(req.params.code));

  const del = await pool.query(`DELETE FROM room_invites WHERE code=$1 AND room_id=$2`, [code, roomId]);
  if ((del.rowCount ?? 0) === 0) return res.status(404).json({ error: "invite_not_found" });
  void writeAuditLog({
    roomId,
    actorId: me,
    action: "invite_delete",
    targetType: "invite",
    targetId: code,
  });
  res.json({ ok: true });
});

// join room by invite code
app.post(
  "/invites/join",
  requireAuth,
  rateLimit({ name: "invites_join", windowMs: 60_000, max: 30, key: rateKeyByUserOrIp }),
  async (req, res) => {
  const me = (req as any).userId as string;
  const codeErr = validateInviteCode(req.body?.code);
  if (codeErr) return res.status(400).json({ error: codeErr });
  const code = normalizeInviteCode(String(req.body.code));

  await pool.query("BEGIN");
  try {
    const inv = await pool.query(
      `SELECT i.code, i.room_id, i.uses, i.max_uses, i.expires_at, r.name
       FROM room_invites i
       JOIN rooms r ON r.id = i.room_id
       WHERE i.code=$1
       FOR UPDATE`,
      [code]
    );
    if ((inv.rowCount ?? 0) === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "invite_not_found" });
    }

    const roomId = String(inv.rows?.[0]?.room_id || "");
    const roomName = String(inv.rows?.[0]?.name || "");
    const uses = Number(inv.rows?.[0]?.uses ?? 0);
    const maxUses = Number(inv.rows?.[0]?.max_uses ?? 10);
    const expiresAt = inv.rows?.[0]?.expires_at as any;

    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      await pool.query("ROLLBACK");
      return res.status(410).json({ error: "invite_expired" });
    }
    if (Number.isFinite(maxUses) && uses >= maxUses) {
      await pool.query("ROLLBACK");
      return res.status(410).json({ error: "invite_max_uses" });
    }

    if (roomId && !(await assertNotBannedFromRoom(roomId, me, res))) {
      await pool.query("ROLLBACK");
      return;
    }

    await pool.query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roomId, me]
    );
    await pool.query(`UPDATE room_invites SET uses = uses + 1 WHERE code=$1`, [code]);

    await pool.query("COMMIT");
    await wsBroadcastRoom(roomId, { type: "room_member_changed", roomId, userId: me, joined: true });
    void writeAuditLog({
      roomId,
      actorId: me,
      action: "room_join",
      targetType: "user",
      targetId: me,
      meta: { inviteCode: code },
    });
    res.json({ ok: true, roomId, roomName });
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
  }
);

// room members
app.get("/rooms/:roomId/members", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });

  const room = await pool.query(`SELECT id, owner_id FROM rooms WHERE id=$1`, [roomId]);
  if (room.rowCount === 0) return res.status(404).json({ error: "room_not_found" });
  const ownerId = room.rows?.[0]?.owner_id ? String(room.rows[0].owner_id) : null;
  if (!ownerId) return res.status(400).json({ error: "room_public_no_members" });

  if (!(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (!(await assertRoomMember(roomId, me, res))) return;

  const { rows } = await pool.query(
    `SELECT user_id, display_name, has_avatar
     FROM (
       SELECT rm.user_id, u.display_name, (u.avatar_data IS NOT NULL) AS has_avatar
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id=$1
       UNION
       SELECT r.owner_id AS user_id, u.display_name, (u.avatar_data IS NOT NULL) AS has_avatar
       FROM rooms r
       JOIN users u ON u.id = r.owner_id
       WHERE r.id=$1 AND r.owner_id IS NOT NULL
     ) x
     ORDER BY display_name ASC`,
    [roomId]
  );
  res.json(
    rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      hasAvatar: !!r.has_avatar,
      isOwner: ownerId === String(r.user_id),
      online: isUserOnline(String(r.user_id)),
    }))
  );
});

// room audit logs (owner only)
app.get("/rooms/:roomId/audit", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const limitRaw = req.query.limit;
  const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 50) || 50));

  const beforeRaw = typeof req.query.before === "string" ? req.query.before : "";
  let before: Date | null = null;
  if (beforeRaw) {
    const d = new Date(beforeRaw);
    if (!Number.isNaN(d.getTime())) before = d;
  }

  const { rows } = await pool.query(
    `SELECT l.id, l.action, l.target_type, l.target_id, l.meta, l.created_at,
            l.actor_id, u.display_name AS actor_name
     FROM audit_logs l
     JOIN users u ON u.id = l.actor_id
     WHERE l.room_id=$1
       AND ($2::timestamptz IS NULL OR l.created_at < $2)
     ORDER BY l.created_at DESC
     LIMIT $3`,
    [roomId, before, limit]
  );

  res.json(
    rows.map((r) => ({
      id: r.id,
      roomId,
      action: r.action,
      actorId: r.actor_id,
      actorDisplayName: r.actor_name,
      targetType: r.target_type ?? null,
      targetId: r.target_id ?? null,
      meta: r.meta ?? null,
      created_at: r.created_at,
    }))
  );
});

// search room messages (owner/member only)
app.get(
  "/rooms/:roomId/messages/search",
  requireAuth,
  rateLimit({ name: "room_message_search", windowMs: 10_000, max: 30, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const me = (req as any).userId as string;
    const roomId = String(req.params.roomId || "");
    if (!roomId) return res.status(400).json({ error: "roomId_required" });

    if (!(await assertNotBannedFromRoom(roomId, me, res))) return;
    if (!(await assertRoomMember(roomId, me, res))) return;

    const qRaw = typeof req.query.q === "string" ? req.query.q : "";
    const q = qRaw.trim();
    if (!q) return res.status(400).json({ error: "q_required" });
    if (q.length > 100) return res.status(400).json({ error: "q_too_long" });

    const limitRaw = req.query.limit;
    const limit = Math.min(50, Math.max(1, Number(limitRaw ?? 20) || 20));

    const channelId = typeof req.query.channelId === "string" ? req.query.channelId.trim() : "";
    const channelFilter = channelId ? channelId : null;

    const beforeRaw = typeof req.query.before === "string" ? req.query.before : "";
    let before: Date | null = null;
    if (beforeRaw) {
      const d = new Date(beforeRaw);
      if (!Number.isNaN(d.getTime())) before = d;
    }

    const { rows } = await pool.query(
      `SELECT m.id, m.channel_id, c.name AS channel_name,
              m.author_id, COALESCE(m.author_name, m.author) AS author_name,
              (u.avatar_data IS NOT NULL) AS author_has_avatar,
              m.content, m.created_at
       FROM messages m
       JOIN channels c ON c.id = m.channel_id
       LEFT JOIN users u ON u.id = m.author_id
       WHERE c.room_id=$1
         AND m.content ILIKE $2
         AND ($3::timestamptz IS NULL OR m.created_at < $3)
         AND ($4::text IS NULL OR m.channel_id = $4)
       ORDER BY m.created_at DESC
       LIMIT $5`,
      [roomId, `%${q}%`, before, channelFilter, limit + 1]
    );

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    res.json({
      items: page.map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        channelName: r.channel_name,
        authorId: r.author_id ?? "",
        author: r.author_name,
        authorHasAvatar: !!r.author_has_avatar,
        content: r.content,
        created_at: r.created_at,
      })),
      hasMore,
    });
  }
);

// personal audit logs (includes room + home actions where you are actor/target)
app.get("/audit", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;

  const limitRaw = req.query.limit;
  const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 50) || 50));

  const beforeRaw = typeof req.query.before === "string" ? req.query.before : "";
  let before: Date | null = null;
  if (beforeRaw) {
    const d = new Date(beforeRaw);
    if (!Number.isNaN(d.getTime())) before = d;
  }

  const scope = typeof req.query.scope === "string" ? String(req.query.scope) : "home";
  const onlyHome = scope === "home";

  const { rows } = await pool.query(
    `SELECT l.id, l.room_id, l.action, l.target_type, l.target_id, l.meta, l.created_at,
            l.actor_id, u.display_name AS actor_name
     FROM audit_logs l
     JOIN users u ON u.id = l.actor_id
     WHERE (l.actor_id=$1 OR (l.target_type='user' AND l.target_id=$1))
       AND ($2::timestamptz IS NULL OR l.created_at < $2)
       AND ($3::boolean = false OR l.room_id IS NULL)
     ORDER BY l.created_at DESC
     LIMIT $4`,
    [me, before, onlyHome, limit]
  );

  res.json(
    rows.map((r) => ({
      id: r.id,
      roomId: r.room_id ? String(r.room_id) : null,
      action: r.action,
      actorId: r.actor_id,
      actorDisplayName: r.actor_name,
      targetType: r.target_type ?? null,
      targetId: r.target_id ?? null,
      meta: r.meta ?? null,
      created_at: r.created_at,
    }))
  );
});

app.delete("/rooms/:roomId/members/me", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });

  const room = await pool.query(`SELECT id, owner_id FROM rooms WHERE id=$1`, [roomId]);
  if (room.rowCount === 0) return res.status(404).json({ error: "room_not_found" });
  const ownerId = room.rows?.[0]?.owner_id ? String(room.rows[0].owner_id) : null;
  if (!ownerId) return res.status(400).json({ error: "room_public_no_members" });

  if (!(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (!(await assertRoomMember(roomId, me, res))) return;
  if (ownerId === me) return res.status(400).json({ error: "owner_cannot_leave" });

  await pool.query(`DELETE FROM room_members WHERE room_id=$1 AND user_id=$2`, [roomId, me]);
  void writeAuditLog({ roomId, actorId: me, action: "room_leave", targetType: "user", targetId: me });
  await wsBroadcastRoom(roomId, { type: "room_member_changed", roomId, userId: me, joined: false });
  await wsRemoveUserFromRoom(me, roomId, "room_left");
  res.json({ ok: true });
});

app.delete("/rooms/:roomId/members/:userId", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const userIdErr = validateUserId(req.params.userId);
  if (userIdErr) return res.status(400).json({ error: userIdErr });
  const target = normalizeUserId(String(req.params.userId));
  if (target === me) return res.status(400).json({ error: "cannot_kick_self" });

  const room = await pool.query(`SELECT owner_id FROM rooms WHERE id=$1`, [roomId]);
  if ((room.rowCount ?? 0) === 0) return res.status(404).json({ error: "room_not_found" });
  if (!room.rows?.[0]?.owner_id) return res.status(400).json({ error: "room_public_no_members" });

  const del = await pool.query(`DELETE FROM room_members WHERE room_id=$1 AND user_id=$2`, [roomId, target]);
  if ((del.rowCount ?? 0) === 0) return res.status(404).json({ error: "not_member" });

  void writeAuditLog({ roomId, actorId: me, action: "room_kick", targetType: "user", targetId: target });
  await wsBroadcastRoom(roomId, { type: "room_member_changed", roomId, userId: target, joined: false });
  await wsRemoveUserFromRoom(target, roomId, "room_kicked");
  res.json({ ok: true });
});

// room channel activity (for unread)
app.get("/rooms/:roomId/channels/activity", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });

  const room = await pool.query(`SELECT id FROM rooms WHERE id=$1`, [roomId]);
  if (room.rowCount === 0) return res.status(404).json({ error: "room_not_found" });

  if (!(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (!(await assertRoomMember(roomId, me, res))) return;

  const { rows } = await pool.query(
    `SELECT c.id AS channel_id, MAX(m.created_at) AS last_message_at
     FROM channels c
     LEFT JOIN messages m ON m.channel_id = c.id
     WHERE c.room_id=$1
     GROUP BY c.id`,
    [roomId]
  );

  res.json(
    rows.map((r) => ({
      channelId: String(r.channel_id),
      lastMessageAt: r.last_message_at ? String(r.last_message_at) : null,
    }))
  );
});

// list messages
app.get("/channels/:channelId/messages", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const channelId = req.params.channelId;

  const ch = await pool.query(`SELECT id, room_id FROM channels WHERE id=$1`, [channelId]);
  if (ch.rowCount === 0) return res.status(404).json({ error: "channel_not_found" });
  const roomId = String(ch.rows?.[0]?.room_id || "");
  if (roomId && !(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (roomId && !(await assertRoomMember(roomId, me, res))) return;

  const limitRaw = req.query.limit;
  const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 50) || 50));
  const beforeRaw = req.query.before;
  const before = typeof beforeRaw === "string" && beforeRaw.trim() ? beforeRaw.trim() : null;
  if (before) {
    const t = Date.parse(before);
    if (!Number.isFinite(t)) return res.status(400).json({ error: "before_invalid" });
  }

  const viewer = authedUserId(req);

  const { rows: rawRows } = await pool.query(
    `SELECT m.id, m.channel_id
            , COALESCE(m.author_id, m.author) AS author_id
            , COALESCE(m.author_name, m.author) AS author_name
            , m.author
            , m.content, m.created_at, m.edited_at
            , m.reply_to
            , (u.avatar_data IS NOT NULL) AS author_has_avatar
            , EXISTS (
                SELECT 1
                FROM room_bans b
                WHERE b.room_id = $3
                  AND b.user_id = COALESCE(m.author_id, m.author)
              ) AS author_is_banned
     FROM messages m
     LEFT JOIN users u ON u.id = COALESCE(m.author_id, m.author)
     WHERE m.channel_id=$1
       AND ($4::timestamptz IS NULL OR m.created_at < $4::timestamptz)
     ORDER BY m.created_at DESC
     LIMIT $2 + 1`,
    [channelId, limit, roomId, before]
  );

  const hasMore = rawRows.length > limit;
  const rows = (hasMore ? rawRows.slice(0, limit) : rawRows).reverse();

  const messageIds = rows.map((r) => r.id);
  const replyIds = rows.map((r) => r.reply_to).filter(Boolean);

  const repliesById: Record<string, { id: string; author: string; content: string }> = {};
  if (replyIds.length > 0) {
    const replyRows = await pool.query(
      `SELECT id, COALESCE(author_name, author) AS author, content
       FROM messages
       WHERE id = ANY($1::text[])`,
      [replyIds]
    );
    for (const r of replyRows.rows) {
      repliesById[r.id] = { id: r.id, author: r.author, content: r.content };
    }
  }

  const attachmentsByMessage: Record<string, Array<{ id: string; mime_type: string }>> = {};
  if (messageIds.length > 0) {
    const a = await pool.query(
      `SELECT id, message_id, mime_type
       FROM message_attachments
       WHERE message_id = ANY($1::text[])
       ORDER BY created_at ASC`,
      [messageIds]
    );
    for (const row of a.rows) {
      (attachmentsByMessage[row.message_id] ||= []).push({ id: row.id, mime_type: row.mime_type });
    }
  }

  const reactionsByMessage: Record<
    string,
    Record<string, { emoji: string; count: number; byMe: boolean }>
  > = {};
  if (messageIds.length > 0) {
    const r = await pool.query(
      `SELECT message_id, emoji, author
       FROM message_reactions
       WHERE message_id = ANY($1::text[])`,
      [messageIds]
    );
    for (const row of r.rows) {
      const byEmoji = (reactionsByMessage[row.message_id] ||= {});
      const item = (byEmoji[row.emoji] ||= { emoji: row.emoji, count: 0, byMe: false });
      item.count += 1;
      if (viewer && row.author === viewer) item.byMe = true;
    }
  }

  const pollsByMessageId = await buildPollsByMessageIds(messageIds, viewer);

  res.json({
    items: rows.map((m) => ({
      id: m.id,
      channel_id: m.channel_id,
      author_id: m.author_id,
      author: m.author_name,
      author_has_avatar: !!m.author_has_avatar,
      author_is_banned: !!m.author_is_banned,
      content: m.content,
      created_at: m.created_at,
      edited_at: m.edited_at ?? null,
      reply_to: m.reply_to ?? null,
      reply: m.reply_to ? repliesById[m.reply_to] ?? null : null,
      attachments: attachmentsByMessage[m.id] ?? [],
      reactions: Object.values(reactionsByMessage[m.id] ?? {}),
      poll: pollsByMessageId[m.id] ?? null,
    })),
    hasMore,
  });
});

// create message
app.post(
  "/channels/:channelId/messages",
  requireAuth,
  rateLimit({ name: "message_create", windowMs: 10_000, max: 20, key: rateKeyByUserOrIp }),
  async (req, res) => {
  const channelId = String(req.params.channelId || "");
  if (!channelId) return res.status(400).json({ error: "channelId_required" });

  const ch = await pool.query(`SELECT id, room_id FROM channels WHERE id=$1`, [channelId]);
  if (ch.rowCount === 0) return res.status(404).json({ error: "channel_not_found" });
  const roomId = String(ch.rows?.[0]?.room_id || "");

  const authorId = (req as any).userId as string;
  if (roomId && !(await assertNotBannedFromRoom(roomId, authorId, res))) return;
  if (roomId && !(await assertRoomMember(roomId, authorId, res))) return;
  const u = await pool.query(`SELECT display_name FROM users WHERE id=$1`, [authorId]);
  if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });
  const authorName = String(u.rows[0].display_name || authorId);

  const replyTo = req.body?.replyTo;
  if (replyTo != null && typeof replyTo !== "string") {
    return res.status(400).json({ error: "replyTo_must_be_string_or_null" });
  }

  const attachmentsRaw = req.body?.attachments;
  const attachments: Array<{ mime_type: string; data: Buffer }> = [];
  if (attachmentsRaw != null) {
    if (!Array.isArray(attachmentsRaw)) return res.status(400).json({ error: "attachments_must_be_array" });
    if (attachmentsRaw.length > 1) return res.status(400).json({ error: "attachments_too_many" });
    for (const a of attachmentsRaw) {
      if (typeof a !== "object" || a == null) return res.status(400).json({ error: "attachment_invalid" });
      const dataUrl = (a as any).dataUrl;
      if (typeof dataUrl !== "string") return res.status(400).json({ error: "attachment_dataUrl_required" });
      const parsed = parseDataUrlAttachmentDetailed(dataUrl);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      if (parsed.bytes.length > 10 * 1024 * 1024) return res.status(400).json({ error: "attachment_too_large" });

      let data = parsed.bytes;
      let mimeType = parsed.mime;
      if (mimeType === "video/mp4") {
        const mode = String(process.env.TRANSCODE_MP4 ?? "auto").toLowerCase();
        const hint = detectMp4VideoCodecHint(data);
        const shouldTranscode = mode === "1" || mode === "true" || (mode !== "0" && mode !== "false" && hint !== "h264");
        if (shouldTranscode) {
          try {
            data = await transcodeMp4ToH264Aac(data);
            mimeType = "video/mp4";
          } catch (e: any) {
            const msg = String(e?.message ?? "attachment_transcode_failed");
            if (msg.startsWith("attachment_transcode_unavailable")) {
              return res.status(500).json({ error: "attachment_transcode_unavailable" });
            }
            if (msg.startsWith("attachment_transcode_timeout")) {
              return res.status(400).json({ error: "attachment_transcode_timeout" });
            }
            if (msg.startsWith("attachment_transcode_output_too_large")) {
              return res.status(400).json({ error: "attachment_transcode_output_too_large" });
            }
            return res.status(400).json({ error: "attachment_transcode_failed" });
          }
        }
      }

      attachments.push({ mime_type: mimeType, data });
    }
  }

  // content: 文字列自体は必須（型チェック）、ただし添付がある場合は空でもOK
  if (typeof req.body?.content !== "string") {
    return res.status(400).json({ error: "content_must_be_string" });
  }
  const content = String(req.body.content).trim();
  if (attachments.length === 0) {
    if (!content) return res.status(400).json({ error: "content_required" });
  }
  if (content.length > 2000) return res.status(400).json({ error: "content_too_long" });

  const id = randomUUID();

  await pool.query("BEGIN");
  try {
    if (typeof replyTo === "string") {
      const parent = await pool.query(
        `SELECT id FROM messages WHERE id=$1 AND channel_id=$2`,
        [replyTo, channelId]
      );
      if (parent.rowCount === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ error: "replyTo_not_found" });
      }
    }

    await pool.query(
      `INSERT INTO messages (id, channel_id, author, author_id, author_name, content, reply_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, channelId, authorName, authorId, authorName, content, replyTo ?? null]
    );

    const attachmentMetas: Array<{ id: string; mime_type: string }> = [];
    for (const a of attachments) {
      const aid = randomUUID();
      await pool.query(
        `INSERT INTO message_attachments (id, message_id, mime_type, data)
         VALUES ($1, $2, $3, $4)`,
        [aid, id, a.mime_type, a.data]
      );
      attachmentMetas.push({ id: aid, mime_type: a.mime_type });
    }

    await pool.query("COMMIT");

    let reply: any = null;
    if (typeof replyTo === "string") {
      const r = await pool.query(
        `SELECT id, COALESCE(author_name, author) AS author, content FROM messages WHERE id=$1`,
        [replyTo]
      );
      if ((r.rowCount ?? 0) > 0) reply = r.rows[0];
    }

    const avatar = await pool.query(`SELECT avatar_data IS NOT NULL AS has FROM users WHERE id=$1`, [authorId]);
    const authorHasAvatar = !!avatar.rows?.[0]?.has;

    const payload = {
      id,
      channel_id: channelId,
      author_id: authorId,
      author: authorName,
      author_has_avatar: authorHasAvatar,
      content,
      created_at: new Date().toISOString(),
      edited_at: null,
      reply_to: replyTo ?? null,
      reply,
      attachments: attachmentMetas,
      reactions: [],
    };

    // realtime: broadcast to subscribers of this channel
    wsBroadcastChannel(channelId, { type: "channel_message_created", channelId, message: payload });

    res.status(201).json(payload);
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
  }
);

// create poll (creates a message)
app.post(
  "/channels/:channelId/polls",
  requireAuth,
  rateLimit({ name: "poll_create", windowMs: 60_000, max: 10, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const channelId = String(req.params.channelId || "");
    if (!channelId) return res.status(400).json({ error: "channelId_required" });

    const me = (req as any).userId as string;

    const ch = await pool.query(`SELECT id, room_id FROM channels WHERE id=$1`, [channelId]);
    if (ch.rowCount === 0) return res.status(404).json({ error: "channel_not_found" });
    const roomId = String(ch.rows?.[0]?.room_id || "");
    if (roomId && !(await assertNotBannedFromRoom(roomId, me, res))) return;
    if (roomId && !(await assertRoomMember(roomId, me, res))) return;

    const questionErr = validatePollQuestion(req.body?.question);
    if (questionErr) return res.status(400).json({ error: questionErr });
    const optsErr = validatePollOptions(req.body?.options);
    if (optsErr) return res.status(400).json({ error: optsErr });

    const question = String(req.body.question).trim();
    const options = Array.from(
      new Set((req.body.options as any[]).map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean))
    );

    const u = await pool.query(`SELECT display_name, (avatar_data IS NOT NULL) AS has FROM users WHERE id=$1`, [me]);
    if ((u.rowCount ?? 0) === 0) return res.status(404).json({ error: "user_not_found" });
    const authorName = String(u.rows[0].display_name || me);
    const authorHasAvatar = !!u.rows?.[0]?.has;

    const messageId = randomUUID();
    const pollId = randomUUID();

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO messages (id, channel_id, author, author_id, author_name, content)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [messageId, channelId, me, me, authorName, question]
      );
      await pool.query(
        `INSERT INTO polls (id, message_id, question, created_by)
         VALUES ($1, $2, $3, $4)`,
        [pollId, messageId, question, me]
      );

      const optionIds: string[] = [];
      for (let i = 0; i < options.length; i++) {
        const oid = randomUUID();
        optionIds.push(oid);
        await pool.query(
          `INSERT INTO poll_options (id, poll_id, text, position)
           VALUES ($1, $2, $3, $4)`,
          [oid, pollId, options[i], i]
        );
      }

      await pool.query("COMMIT");

      const pollPayload = {
        id: pollId,
        question,
        options: optionIds.map((id, i) => ({ id, text: options[i], votes: 0, byMe: false })),
      };

      const payload = {
        id: messageId,
        channel_id: channelId,
        author_id: me,
        author: authorName,
        author_has_avatar: authorHasAvatar,
        author_is_banned: false,
        content: question,
        created_at: new Date().toISOString(),
        edited_at: null,
        reply_to: null,
        reply: null,
        attachments: [],
        reactions: [],
        poll: pollPayload,
      };

      wsBroadcastChannel(channelId, { type: "channel_message_created", channelId, message: payload });
      res.status(201).json(payload);
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
);

// vote poll
app.post(
  "/polls/:pollId/vote",
  requireAuth,
  rateLimit({ name: "poll_vote", windowMs: 10_000, max: 60, key: rateKeyByUserOrIp }),
  async (req, res) => {
    const me = (req as any).userId as string;
    const pollId = String(req.params.pollId || "");
    if (!pollId) return res.status(400).json({ error: "pollId_required" });

    const optionId = typeof req.body?.optionId === "string" ? String(req.body.optionId) : "";
    if (!optionId) return res.status(400).json({ error: "optionId_required" });

    const p = await pool.query(
      `SELECT p.id, p.message_id, m.channel_id, c.room_id
       FROM polls p
       JOIN messages m ON m.id = p.message_id
       JOIN channels c ON c.id = m.channel_id
       WHERE p.id=$1`,
      [pollId]
    );
    if ((p.rowCount ?? 0) === 0) return res.status(404).json({ error: "poll_not_found" });
    const messageId = String(p.rows?.[0]?.message_id || "");
    const channelId = String(p.rows?.[0]?.channel_id || "");
    const roomId = String(p.rows?.[0]?.room_id || "");

    if (roomId && !(await assertNotBannedFromRoom(roomId, me, res))) return;
    if (roomId && !(await assertRoomMember(roomId, me, res))) return;

    const opt = await pool.query(
      `SELECT id, text FROM poll_options WHERE id=$1 AND poll_id=$2`,
      [optionId, pollId]
    );
    if ((opt.rowCount ?? 0) === 0) return res.status(404).json({ error: "poll_option_not_found" });

    await pool.query("BEGIN");
    try {
      await pool.query(`DELETE FROM poll_votes WHERE poll_id=$1 AND user_id=$2`, [pollId, me]);
      await pool.query(`INSERT INTO poll_votes (poll_id, user_id, option_id) VALUES ($1, $2, $3)`, [pollId, me, optionId]);
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }

    const pollsByMessageId = await buildPollsByMessageIds([messageId], me);
    const pollPayload = pollsByMessageId[messageId];
    if (!pollPayload) return res.status(500).json({ error: "poll_build_failed" });

    wsBroadcastChannel(channelId, { type: "poll_updated", channelId, messageId, poll: pollPayload });
    res.json({ pollId, messageId, poll: pollPayload });
  }
);

// get attachment binary
app.get(
  "/attachments/:attachmentId",
  requireAuth,
  rateLimit({ name: "attachment_get", windowMs: 60_000, max: 300, key: rateKeyByUserOrIp }),
  async (req, res) => {
  const me = (req as any).userId as string;
  const attachmentId = req.params.attachmentId;
  const a = await pool.query(
    `SELECT a.id, a.mime_type, a.data, c.room_id
     FROM message_attachments a
     JOIN messages m ON m.id = a.message_id
     JOIN channels c ON c.id = m.channel_id
     WHERE a.id=$1`,
    [attachmentId]
  );
  if (a.rowCount === 0) return res.status(404).json({ error: "attachment_not_found" });
  const roomId = String(a.rows?.[0]?.room_id || "");
  if (roomId && !(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (roomId && !(await assertRoomMember(roomId, me, res))) return;
  const mime = String(a.rows[0].mime_type || "application/octet-stream");
  const data = a.rows[0].data as Buffer;

  res.setHeader("cache-control", "private, no-store");
  res.setHeader("content-disposition", "inline");
  res.setHeader("content-type", mime);
  res.setHeader("accept-ranges", "bytes");

  const range = String(req.headers.range ?? "");
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && data && data.length > 0) {
    const total = data.length;
    const startRaw = m[1] ? Number(m[1]) : NaN;
    const endRaw = m[2] ? Number(m[2]) : NaN;

    let start = 0;
    let end = total - 1;

    if (!Number.isNaN(startRaw)) start = startRaw;
    if (!Number.isNaN(endRaw)) end = endRaw;

    // suffix range: bytes=-N
    if (Number.isNaN(startRaw) && !Number.isNaN(endRaw)) {
      const n = Math.max(0, endRaw);
      start = Math.max(0, total - n);
      end = total - 1;
    }

    if (start < 0) start = 0;
    if (end >= total) end = total - 1;
    if (start > end || start >= total) {
      res.status(416);
      res.setHeader("content-range", `bytes */${total}`);
      return res.end();
    }

    const chunk = data.subarray(start, end + 1);
    res.status(206);
    res.setHeader("content-range", `bytes ${start}-${end}/${total}`);
    res.setHeader("content-length", String(chunk.length));
    return res.send(chunk);
  }

  res.send(data);
  }
);

// toggle reaction
app.post(
  "/messages/:messageId/reactions/toggle",
  requireAuth,
  rateLimit({ name: "reaction_toggle", windowMs: 10_000, max: 80, key: rateKeyByUserOrIp }),
  async (req, res) => {
  const messageId = req.params.messageId;

  const author = (req as any).userId as string;

  const msg = await pool.query(
    `SELECT m.id, m.channel_id, c.room_id
     FROM messages m
     JOIN channels c ON c.id = m.channel_id
     WHERE m.id=$1`,
    [messageId]
  );
  if (msg.rowCount === 0) return res.status(404).json({ error: "message_not_found" });
  const channelId = String(msg.rows?.[0]?.channel_id || "");
  const roomId = String(msg.rows?.[0]?.room_id || "");
  if (roomId && !(await assertNotBannedFromRoom(roomId, author, res))) return;
  if (roomId && !(await assertRoomMember(roomId, author, res))) return;

  const emojiErr = validateEmoji(req.body?.emoji);
  if (emojiErr) return res.status(400).json({ error: emojiErr });

  const emoji = String(req.body.emoji).trim();

  const existing = await pool.query(
    `SELECT id FROM message_reactions WHERE message_id=$1 AND author=$2 AND emoji=$3`,
    [messageId, author, emoji]
  );

  if ((existing.rowCount ?? 0) > 0) {
    await pool.query(
      `DELETE FROM message_reactions WHERE message_id=$1 AND author=$2 AND emoji=$3`,
      [messageId, author, emoji]
    );
  } else {
    if (emoji.startsWith("sticker:")) {
      const stickerId = emoji.slice("sticker:".length);
      const s = await pool.query(`SELECT 1 FROM stickers WHERE id=$1`, [stickerId]);
      if ((s.rowCount ?? 0) === 0) return res.status(404).json({ error: "sticker_not_found" });
    }
    await pool.query(
      `INSERT INTO message_reactions (id, message_id, author, emoji)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), messageId, author, emoji]
    );
  }

  const r = await pool.query(
    `SELECT emoji, author FROM message_reactions WHERE message_id=$1`,
    [messageId]
  );
  const byEmoji: Record<string, { emoji: string; count: number; byMe: boolean }> = {};
  for (const row of r.rows) {
    const item = (byEmoji[row.emoji] ||= { emoji: row.emoji, count: 0, byMe: false });
    item.count += 1;
    if (row.author === author) item.byMe = true;
  }

  if (channelId) {
    wsBroadcastChannel(channelId, {
      type: "message_reactions_updated",
      channelId,
      messageId,
      reactions: Object.values(byEmoji),
    });
  }

  res.json({ messageId, reactions: Object.values(byEmoji) });
  }
);

// edit message (author or room owner)
app.patch(
  "/messages/:messageId",
  requireAuth,
  rateLimit({ name: "message_edit", windowMs: 60_000, max: 60, key: rateKeyByUserOrIp }),
  async (req, res) => {
  const me = (req as any).userId as string;
  const messageId = String(req.params.messageId || "");
  if (!messageId) return res.status(400).json({ error: "messageId_required" });

  if (typeof req.body?.content !== "string") return res.status(400).json({ error: "content_must_be_string" });
  const content = String(req.body.content).trim();
  if (!content) return res.status(400).json({ error: "content_required" });
  if (content.length > 2000) return res.status(400).json({ error: "content_too_long" });

  const msg = await pool.query(
    `SELECT m.id, m.channel_id, c.room_id
            , COALESCE(m.author_id, m.author) AS author_id
            , r.owner_id
     FROM messages m
     JOIN channels c ON c.id = m.channel_id
     JOIN rooms r ON r.id = c.room_id
     WHERE m.id=$1`,
    [messageId]
  );
  if (msg.rowCount === 0) return res.status(404).json({ error: "message_not_found" });

  const channelId = String(msg.rows?.[0]?.channel_id || "");
  const roomId = String(msg.rows?.[0]?.room_id || "");
  const authorId = String(msg.rows?.[0]?.author_id || "");
  const ownerId = msg.rows?.[0]?.owner_id ? String(msg.rows[0].owner_id) : null;

  if (roomId && !(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (roomId && !(await assertRoomMember(roomId, me, res))) return;

  const canEdit = me === authorId || (ownerId && ownerId === me);
  if (!canEdit) return res.status(403).json({ error: "forbidden" });

  const upd = await pool.query(
    `UPDATE messages SET content=$2, edited_at=now() WHERE id=$1 RETURNING edited_at`,
    [messageId, content]
  );
  const editedAt = upd.rows?.[0]?.edited_at ?? null;

  if (roomId) {
    void writeAuditLog({
      roomId,
      actorId: me,
      action: "message_edit",
      targetType: "message",
      targetId: messageId,
      meta: { channelId, authorId, byOwner: !!(ownerId && ownerId === me && me !== authorId) },
    });
  }

  wsBroadcastChannel(channelId, { type: "channel_message_updated", channelId, messageId, content, edited_at: editedAt });
  res.json({ ok: true, messageId, content, edited_at: editedAt });
  }
);

// delete message (author or room owner)
app.delete(
  "/messages/:messageId",
  requireAuth,
  rateLimit({ name: "message_delete", windowMs: 60_000, max: 60, key: rateKeyByUserOrIp }),
  async (req, res) => {
  const me = (req as any).userId as string;
  const messageId = String(req.params.messageId || "");
  if (!messageId) return res.status(400).json({ error: "messageId_required" });

  const msg = await pool.query(
    `SELECT m.id, m.channel_id, c.room_id
            , COALESCE(m.author_id, m.author) AS author_id
            , r.owner_id
     FROM messages m
     JOIN channels c ON c.id = m.channel_id
     JOIN rooms r ON r.id = c.room_id
     WHERE m.id=$1`,
    [messageId]
  );
  if (msg.rowCount === 0) return res.status(404).json({ error: "message_not_found" });

  const channelId = String(msg.rows?.[0]?.channel_id || "");
  const roomId = String(msg.rows?.[0]?.room_id || "");
  const authorId = String(msg.rows?.[0]?.author_id || "");
  const ownerId = msg.rows?.[0]?.owner_id ? String(msg.rows[0].owner_id) : null;

  if (roomId && !(await assertNotBannedFromRoom(roomId, me, res))) return;
  if (roomId && !(await assertRoomMember(roomId, me, res))) return;

  const canDelete = me === authorId || (ownerId && ownerId === me);
  if (!canDelete) return res.status(403).json({ error: "forbidden" });

  await pool.query(`DELETE FROM messages WHERE id=$1`, [messageId]);
  if (roomId) {
    void writeAuditLog({
      roomId,
      actorId: me,
      action: "message_delete",
      targetType: "message",
      targetId: messageId,
      meta: { channelId, authorId, byOwner: !!(ownerId && ownerId === me && me !== authorId) },
    });
  }
  if (roomId && channelId) {
    wsBroadcastChannel(channelId, { type: "channel_message_deleted", channelId, messageId });
  }
  res.json({ ok: true });
  }
);

// create category
app.post("/rooms/:roomId/categories", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const nameErr = validateName(req.body?.name, "name");
  if (nameErr) return res.status(400).json({ error: nameErr });

  const id = randomUUID();
  const name = String(req.body.name).trim();
  const position = Number.isFinite(Number(req.body?.position)) ? Number(req.body.position) : 0;

  await pool.query(
    `INSERT INTO categories (id, room_id, name, position) VALUES ($1, $2, $3, $4)`,
    [id, roomId, name, position]
  );

  void writeAuditLog({
    roomId,
    actorId: me,
    action: "category_create",
    targetType: "category",
    targetId: id,
    meta: { name, position },
  });

  res.status(201).json({ id, room_id: roomId, name, position });
});

// delete category (also delete channels in the category)
app.delete("/rooms/:roomId/categories/:categoryId", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  const categoryId = req.params.categoryId;

  if (!(await assertRoomOwner(roomId, me, res))) return;

  const cat = await pool.query(`SELECT id, name FROM categories WHERE id=$1 AND room_id=$2`, [categoryId, roomId]);
  if (cat.rowCount === 0) return res.status(404).json({ error: "category_not_found" });
  const catName = cat.rows?.[0]?.name ? String(cat.rows[0].name) : null;

  await pool.query("BEGIN");
  try {
    // messages will cascade via channels -> messages
    await pool.query(
      `DELETE FROM channels WHERE room_id=$1 AND category_id=$2`,
      [roomId, categoryId]
    );
    await pool.query(
      `DELETE FROM categories WHERE id=$1 AND room_id=$2`,
      [categoryId, roomId]
    );
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }

  void writeAuditLog({
    roomId,
    actorId: me,
    action: "category_delete",
    targetType: "category",
    targetId: String(categoryId),
    meta: { name: catName },
  });

  res.json({ ok: true });
});

// create channel
app.post("/rooms/:roomId/channels", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  if (!(await assertRoomOwner(roomId, me, res))) return;

  const nameErr = validateName(req.body?.name, "name");
  if (nameErr) return res.status(400).json({ error: nameErr });

  const categoryId = req.body?.categoryId;
  if (categoryId != null && typeof categoryId !== "string") {
    return res.status(400).json({ error: "categoryId_must_be_string_or_null" });
  }

  if (typeof categoryId === "string") {
    const cat = await pool.query(
      `SELECT id FROM categories WHERE id=$1 AND room_id=$2`,
      [categoryId, roomId]
    );
    if (cat.rowCount === 0) return res.status(404).json({ error: "category_not_found" });
  }

  const id = randomUUID();
  const name = String(req.body.name).trim();
  const position = Number.isFinite(Number(req.body?.position)) ? Number(req.body.position) : 0;

  await pool.query(
    `INSERT INTO channels (id, room_id, category_id, name, position) VALUES ($1, $2, $3, $4, $5)`,
    [id, roomId, categoryId ?? null, name, position]
  );

  void writeAuditLog({
    roomId,
    actorId: me,
    action: "channel_create",
    targetType: "channel",
    targetId: id,
    meta: { name, position, categoryId: categoryId ?? null },
  });

  res.status(201).json({ id, room_id: roomId, category_id: categoryId ?? null, name, position });
});

// delete channel
app.delete("/rooms/:roomId/channels/:channelId", requireAuth, async (req, res) => {
  const me = (req as any).userId as string;
  const roomId = String(req.params.roomId || "");
  if (!roomId) return res.status(400).json({ error: "roomId_required" });
  const channelId = req.params.channelId;

  if (!(await assertRoomOwner(roomId, me, res))) return;

  const ch = await pool.query(`SELECT id, name FROM channels WHERE id=$1 AND room_id=$2`, [channelId, roomId]);
  if (ch.rowCount === 0) return res.status(404).json({ error: "channel_not_found" });
  const chName = ch.rows?.[0]?.name ? String(ch.rows[0].name) : null;

  await pool.query(`DELETE FROM channels WHERE id=$1 AND room_id=$2`, [channelId, roomId]);
  void writeAuditLog({
    roomId,
    actorId: me,
    action: "channel_delete",
    targetType: "channel",
    targetId: String(channelId),
    meta: { name: chName },
  });
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);

async function main() {
  await initDb();
  const server = createServer(app);
  setupWebSocket(server);
  server.listen(port, "0.0.0.0", () => {
    console.log(`YuiRoom backend listening on 0.0.0.0:${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

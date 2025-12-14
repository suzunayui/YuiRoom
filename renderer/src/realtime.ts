import { api } from "./api";

type RealtimeEvent =
  | { type: "hello"; userId: string }
  | { type: "room_banned"; roomId: string }
  | { type: "room_unbanned"; roomId: string }
  | { type: "room_left"; roomId: string }
  | { type: "room_kicked"; roomId: string }
  | { type: "room_ban_changed"; roomId: string; userId: string; banned: boolean }
  | { type: "room_member_changed"; roomId: string; userId: string; joined: boolean }
  | { type: "room_presence"; roomId: string; userId: string; online: boolean }
  | { type: "channel_message_deleted"; channelId: string; messageId: string }
  | { type: "channel_message_updated"; channelId: string; messageId: string; content: string; edited_at: string | null }
  | { type: "channel_message_created"; channelId: string; message: any }
  | { type: "message_reactions_updated"; channelId: string; messageId: string; reactions: any }
  | { type: "poll_updated"; channelId: string; messageId: string; poll: any }
  | { type: "dm_message_created"; threadId: string; message: any }
  | { type: "dm_reactions_updated"; threadId: string; messageId: string; reactions: any }
  | { type: "home_updated" }
  | { type: "subscribed_home" }
  | { type: "error"; error: string }
  | { type: string; [k: string]: any };

type Handler<T> = (ev: T) => void;

type SubKey = string;

let ws: WebSocket | null = null;
let wsToken: string | null = null;
let opening = false;
let reconnectTimer: number | null = null;
let reconnectDelayMs = 750;

function hasAnyHandlers() {
  return (
    channelHandlers.size > 0 ||
    channelReactionHandlers.size > 0 ||
    channelPollHandlers.size > 0 ||
    channelDeleteHandlers.size > 0 ||
    channelUpdateHandlers.size > 0 ||
    dmHandlers.size > 0 ||
    dmReactionHandlers.size > 0 ||
    dmErrorHandlers.size > 0 ||
    homeHandlers.size > 0 ||
    helloHandlers.size > 0 ||
    roomBannedHandlers.size > 0 ||
    roomUnbannedHandlers.size > 0 ||
    roomBanChangedHandlers.size > 0 ||
    roomLeftHandlers.size > 0 ||
    roomKickedHandlers.size > 0 ||
    roomMemberChangedHandlers.size > 0 ||
    roomPresenceHandlers.size > 0
  );
}

function scheduleReconnect() {
  if (reconnectTimer != null) return;
  if (!api.getAuthToken()) return;
  if (!hasAnyHandlers()) return;

  const delay = reconnectDelayMs;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    ensureConnected();
    reconnectDelayMs = Math.min(15_000, Math.floor(reconnectDelayMs * 1.6));
  }, delay);
}

const channelHandlers = new Map<SubKey, Set<Handler<any>>>();
const channelReactionHandlers = new Map<SubKey, Set<Handler<{ messageId: string; reactions: any }>>>();
const channelPollHandlers = new Map<SubKey, Set<Handler<{ messageId: string; poll: any }>>>();
const channelDeleteHandlers = new Map<SubKey, Set<Handler<{ messageId: string }>>>();
const channelUpdateHandlers = new Map<SubKey, Set<Handler<{ messageId: string; content: string; edited_at: string | null }>>>();
const dmHandlers = new Map<SubKey, Set<Handler<any>>>();
const dmReactionHandlers = new Map<SubKey, Set<Handler<{ messageId: string; reactions: any }>>>();
const dmErrorHandlers = new Map<SubKey, Set<Handler<string>>>();
const homeHandlers = new Set<Handler<void>>();
const helloHandlers = new Set<Handler<{ userId: string }>>();
const roomBannedHandlers = new Set<Handler<{ roomId: string }>>();
const roomUnbannedHandlers = new Set<Handler<{ roomId: string }>>();
const roomBanChangedHandlers = new Set<Handler<{ roomId: string; userId: string; banned: boolean }>>();
const roomLeftHandlers = new Set<Handler<{ roomId: string }>>();
const roomKickedHandlers = new Set<Handler<{ roomId: string }>>();
const roomMemberChangedHandlers = new Set<Handler<{ roomId: string; userId: string; joined: boolean }>>();
const roomPresenceHandlers = new Set<Handler<{ roomId: string; userId: string; online: boolean }>>();

function toWsBase(httpBase: string): string {
  // http(s)://host[:port][/path] -> ws(s)://host[:port]
  try {
    const u = new URL(httpBase);
    const wsProto = u.protocol === "https:" ? "wss:" : u.protocol === "http:" ? "ws:" : u.protocol;
    return `${wsProto}//${u.host}`;
  } catch {
    try {
      const origin = window.location.origin;
      const u = new URL(origin);
      const wsProto = u.protocol === "https:" ? "wss:" : u.protocol === "http:" ? "ws:" : u.protocol;
      return `${wsProto}//${u.host}`;
    } catch {
      return httpBase;
    }
  }
}

function wsUrl() {
  const base = toWsBase(api.base());
  return `${base}/ws`;
}

function ensureConnected() {
  const token = api.getAuthToken();
  if (!token) {
    closeWs();
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN && wsToken === token) return;
  if (opening) return;

  // token changed or not connected
  closeWs();
  wsToken = token;
  opening = true;

  try {
    ws = new WebSocket(wsUrl(), [`bearer.${token}`]);
  } catch {
    opening = false;
    ws = null;
    return;
  }

  ws.addEventListener("open", () => {
    opening = false;
    reconnectDelayMs = 750;
    if (reconnectTimer != null) {
      try {
        clearTimeout(reconnectTimer);
      } catch {
        // ignore
      }
      reconnectTimer = null;
    }
    // re-subscribe
    const channelIds = new Set<string>([
      ...channelHandlers.keys(),
      ...channelReactionHandlers.keys(),
      ...channelPollHandlers.keys(),
      ...channelDeleteHandlers.keys(),
      ...channelUpdateHandlers.keys(),
    ]);
    for (const channelId of channelIds) wsSend({ type: "subscribe", channelId });
    const threadIds = new Set<string>([...dmHandlers.keys(), ...dmReactionHandlers.keys()]);
    for (const threadId of threadIds) {
      wsSend({ type: "subscribe_dm", threadId });
    }
    if (homeHandlers.size > 0) wsSend({ type: "subscribe_home" });
  });

  ws.addEventListener("message", (e) => {
    let data: RealtimeEvent;
    try {
      data = JSON.parse(String((e as any).data ?? ""));
    } catch {
      return;
    }

    if (data.type === "error" && typeof (data as any).error === "string") {
      const threadId = (data as any).threadId;
      if (typeof threadId === "string") {
        const handlers = dmErrorHandlers.get(threadId);
        if (handlers) {
          for (const h of handlers) h(String((data as any).error));
        }
      }
      return;
    }

    if (data.type === "home_updated") {
      for (const h of homeHandlers) h(undefined);
      return;
    }

    if (data.type === "hello" && typeof (data as any).userId === "string") {
      const userId = String((data as any).userId);
      for (const h of helloHandlers) h({ userId });
      return;
    }

    if (data.type === "room_banned" && typeof (data as any).roomId === "string") {
      const roomId = String((data as any).roomId);
      for (const h of roomBannedHandlers) h({ roomId });
      return;
    }

    if (data.type === "room_unbanned" && typeof (data as any).roomId === "string") {
      const roomId = String((data as any).roomId);
      for (const h of roomUnbannedHandlers) h({ roomId });
      return;
    }

    if (data.type === "room_ban_changed") {
      const roomId = String((data as any).roomId ?? "");
      const userId = String((data as any).userId ?? "");
      const banned = Boolean((data as any).banned);
      if (!roomId || !userId) return;
      for (const h of roomBanChangedHandlers) h({ roomId, userId, banned });
      return;
    }

    if (data.type === "room_left" && typeof (data as any).roomId === "string") {
      const roomId = String((data as any).roomId);
      for (const h of roomLeftHandlers) h({ roomId });
      return;
    }

    if (data.type === "room_kicked" && typeof (data as any).roomId === "string") {
      const roomId = String((data as any).roomId);
      for (const h of roomKickedHandlers) h({ roomId });
      return;
    }

    if (data.type === "room_member_changed") {
      const roomId = String((data as any).roomId ?? "");
      const userId = String((data as any).userId ?? "");
      const joined = Boolean((data as any).joined);
      if (!roomId || !userId) return;
      for (const h of roomMemberChangedHandlers) h({ roomId, userId, joined });
      return;
    }

    if (data.type === "room_presence") {
      const roomId = String((data as any).roomId ?? "");
      const userId = String((data as any).userId ?? "");
      const online = Boolean((data as any).online);
      if (!roomId || !userId) return;
      for (const h of roomPresenceHandlers) h({ roomId, userId, online });
      return;
    }

    if (data.type === "channel_message_created" && typeof (data as any).channelId === "string") {
      const key = String((data as any).channelId);
      const handlers = channelHandlers.get(key);
      if (!handlers) return;
      for (const h of handlers) h((data as any).message);
      return;
    }

    if (data.type === "message_reactions_updated" && typeof (data as any).channelId === "string") {
      const key = String((data as any).channelId);
      const handlers = channelReactionHandlers.get(key);
      if (!handlers) return;
      const messageId = String((data as any).messageId ?? "");
      const reactions = (data as any).reactions;
      if (!messageId) return;
      for (const h of handlers) h({ messageId, reactions });
      return;
    }

    if (data.type === "poll_updated" && typeof (data as any).channelId === "string") {
      const key = String((data as any).channelId);
      const handlers = channelPollHandlers.get(key);
      if (!handlers) return;
      const messageId = String((data as any).messageId ?? "");
      const poll = (data as any).poll;
      if (!messageId) return;
      for (const h of handlers) h({ messageId, poll });
      return;
    }

    if (data.type === "channel_message_deleted" && typeof (data as any).channelId === "string") {
      const key = String((data as any).channelId);
      const handlers = channelDeleteHandlers.get(key);
      if (!handlers) return;
      const messageId = String((data as any).messageId ?? "");
      if (!messageId) return;
      for (const h of handlers) h({ messageId });
      return;
    }

    if (data.type === "channel_message_updated" && typeof (data as any).channelId === "string") {
      const key = String((data as any).channelId);
      const handlers = channelUpdateHandlers.get(key);
      if (!handlers) return;
      const messageId = String((data as any).messageId ?? "");
      const content = String((data as any).content ?? "");
      const edited_at = (data as any).edited_at ?? null;
      if (!messageId) return;
      for (const h of handlers) h({ messageId, content, edited_at });
      return;
    }

    if (data.type === "dm_message_created" && typeof (data as any).threadId === "string") {
      const key = String((data as any).threadId);
      const handlers = dmHandlers.get(key);
      if (!handlers) return;
      for (const h of handlers) h((data as any).message);
      return;
    }

    if (data.type === "dm_reactions_updated" && typeof (data as any).threadId === "string") {
      const key = String((data as any).threadId);
      const handlers = dmReactionHandlers.get(key);
      if (!handlers) return;
      const messageId = String((data as any).messageId ?? "");
      const reactions = (data as any).reactions;
      if (!messageId) return;
      for (const h of handlers) h({ messageId, reactions });
      return;
    }
  });

  ws.addEventListener("close", () => {
    opening = false;
    ws = null;
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    // ignore; close will follow
  });
}

function closeWs() {
  if (reconnectTimer != null) {
    try {
      clearTimeout(reconnectTimer);
    } catch {
      // ignore
    }
    reconnectTimer = null;
  }
  reconnectDelayMs = 750;
  try {
    ws?.close();
  } catch {
    // ignore
  }
  ws = null;
  wsToken = null;
  opening = false;
}

function wsSend(obj: unknown) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}

export const realtime = {
  subscribeChannelMessage(channelId: string, onMessage: Handler<any>) {
    ensureConnected();

    let set = channelHandlers.get(channelId);
    const first = !set;
    if (!set) {
      set = new Set();
      channelHandlers.set(channelId, set);
    }
    set.add(onMessage);

    if (first && !channelReactionHandlers.has(channelId)) wsSend({ type: "subscribe", channelId });

    return () => {
      const s = channelHandlers.get(channelId);
      if (!s) return;
      s.delete(onMessage);
      if (s.size === 0) {
        channelHandlers.delete(channelId);
        if (!channelReactionHandlers.has(channelId)) wsSend({ type: "unsubscribe", channelId });
      }
    };
  },

  subscribeChannelReactions(channelId: string, onUpdate: Handler<{ messageId: string; reactions: any }>) {
    ensureConnected();

    let set = channelReactionHandlers.get(channelId);
    const first = !set;
    if (!set) {
      set = new Set();
      channelReactionHandlers.set(channelId, set);
    }
    set.add(onUpdate);

    if (first && !channelHandlers.has(channelId)) wsSend({ type: "subscribe", channelId });

    return () => {
      const s = channelReactionHandlers.get(channelId);
      if (!s) return;
      s.delete(onUpdate);
      if (s.size === 0) {
        channelReactionHandlers.delete(channelId);
        if (!channelHandlers.has(channelId)) wsSend({ type: "unsubscribe", channelId });
      }
    };
  },

  subscribeChannelPolls(channelId: string, onUpdate: Handler<{ messageId: string; poll: any }>) {
    ensureConnected();
    const key = channelId;
    let set = channelPollHandlers.get(key);
    if (!set) {
      set = new Set();
      channelPollHandlers.set(key, set);
      wsSend({ type: "subscribe", channelId });
    }
    set.add(onUpdate as any);
    return () => {
      const s = channelPollHandlers.get(key);
      if (!s) return;
      s.delete(onUpdate as any);
      if (s.size === 0) {
        channelPollHandlers.delete(key);
        if (
          !channelHandlers.has(key) &&
          !channelReactionHandlers.has(key) &&
          !channelDeleteHandlers.has(key) &&
          !channelUpdateHandlers.has(key)
        ) {
          wsSend({ type: "unsubscribe", channelId: key });
        }
      }
    };
  },

  subscribeChannelDeleted(channelId: string, onDelete: Handler<{ messageId: string }>) {
    ensureConnected();

    let set = channelDeleteHandlers.get(channelId);
    const first = !set;
    if (!set) {
      set = new Set();
      channelDeleteHandlers.set(channelId, set);
    }
    set.add(onDelete);

    if (first && !channelHandlers.has(channelId) && !channelReactionHandlers.has(channelId) && !channelPollHandlers.has(channelId)) {
      wsSend({ type: "subscribe", channelId });
    }

    return () => {
      const s = channelDeleteHandlers.get(channelId);
      if (!s) return;
      s.delete(onDelete);
      if (s.size === 0) {
        channelDeleteHandlers.delete(channelId);
        if (
          !channelHandlers.has(channelId) &&
          !channelReactionHandlers.has(channelId) &&
          !channelPollHandlers.has(channelId) &&
          !channelUpdateHandlers.has(channelId)
        ) {
          wsSend({ type: "unsubscribe", channelId });
        }
      }
    };
  },

  subscribeChannelUpdated(channelId: string, onUpdate: Handler<{ messageId: string; content: string; edited_at: string | null }>) {
    ensureConnected();

    let set = channelUpdateHandlers.get(channelId);
    const first = !set;
    if (!set) {
      set = new Set();
      channelUpdateHandlers.set(channelId, set);
    }
    set.add(onUpdate);

    if (first && !channelHandlers.has(channelId) && !channelReactionHandlers.has(channelId) && !channelPollHandlers.has(channelId)) {
      wsSend({ type: "subscribe", channelId });
    }

    return () => {
      const s = channelUpdateHandlers.get(channelId);
      if (!s) return;
      s.delete(onUpdate);
      if (s.size === 0) {
        channelUpdateHandlers.delete(channelId);
        if (
          !channelHandlers.has(channelId) &&
          !channelReactionHandlers.has(channelId) &&
          !channelPollHandlers.has(channelId) &&
          !channelDeleteHandlers.has(channelId)
        ) {
          wsSend({ type: "unsubscribe", channelId });
        }
      }
    };
  },

  subscribeDmMessage(threadId: string, onMessage: Handler<any>) {
    ensureConnected();

    let set = dmHandlers.get(threadId);
    const first = !set;
    if (!set) {
      set = new Set();
      dmHandlers.set(threadId, set);
    }
    set.add(onMessage);

    if (first && !dmReactionHandlers.has(threadId)) {
      wsSend({ type: "subscribe_dm", threadId });
    }

    return () => {
      const s = dmHandlers.get(threadId);
      if (!s) return;
      s.delete(onMessage);
      if (s.size === 0) {
        dmHandlers.delete(threadId);
        if (!dmReactionHandlers.has(threadId)) wsSend({ type: "unsubscribe_dm", threadId });
      }
    };
  },

  subscribeDmReactions(threadId: string, onUpdate: Handler<{ messageId: string; reactions: any }>) {
    ensureConnected();

    let set = dmReactionHandlers.get(threadId);
    const first = !set;
    if (!set) {
      set = new Set();
      dmReactionHandlers.set(threadId, set);
    }
    set.add(onUpdate);

    if (first && !dmHandlers.has(threadId)) {
      wsSend({ type: "subscribe_dm", threadId });
    }

    return () => {
      const s = dmReactionHandlers.get(threadId);
      if (!s) return;
      s.delete(onUpdate);
      if (s.size === 0) {
        dmReactionHandlers.delete(threadId);
        if (!dmHandlers.has(threadId)) wsSend({ type: "unsubscribe_dm", threadId });
      }
    };
  },

  subscribeDmError(threadId: string, onError: Handler<string>) {
    ensureConnected();

    let set = dmErrorHandlers.get(threadId);
    if (!set) {
      set = new Set();
      dmErrorHandlers.set(threadId, set);
    }
    set.add(onError);

    return () => {
      const s = dmErrorHandlers.get(threadId);
      if (!s) return;
      s.delete(onError);
      if (s.size === 0) dmErrorHandlers.delete(threadId);
    };
  },

  subscribeHome(onUpdate: Handler<void>) {
    ensureConnected();
    const first = homeHandlers.size === 0;
    homeHandlers.add(onUpdate);
    if (first) wsSend({ type: "subscribe_home" });

    return () => {
      homeHandlers.delete(onUpdate);
      if (homeHandlers.size === 0) {
        wsSend({ type: "unsubscribe_home" });
      }
    };
  },

  subscribeHello(onHello: Handler<{ userId: string }>) {
    ensureConnected();
    helloHandlers.add(onHello);
    return () => {
      helloHandlers.delete(onHello);
    };
  },

  subscribeRoomBanned(onBanned: Handler<{ roomId: string }>) {
    ensureConnected();
    roomBannedHandlers.add(onBanned);
    return () => {
      roomBannedHandlers.delete(onBanned);
    };
  },

  subscribeRoomUnbanned(onUnbanned: Handler<{ roomId: string }>) {
    ensureConnected();
    roomUnbannedHandlers.add(onUnbanned);
    return () => {
      roomUnbannedHandlers.delete(onUnbanned);
    };
  },

  subscribeRoomBanChanged(onChange: Handler<{ roomId: string; userId: string; banned: boolean }>) {
    ensureConnected();
    roomBanChangedHandlers.add(onChange);
    return () => {
      roomBanChangedHandlers.delete(onChange);
    };
  },

  subscribeRoomLeft(onLeft: Handler<{ roomId: string }>) {
    ensureConnected();
    roomLeftHandlers.add(onLeft);
    return () => {
      roomLeftHandlers.delete(onLeft);
    };
  },

  subscribeRoomKicked(onKicked: Handler<{ roomId: string }>) {
    ensureConnected();
    roomKickedHandlers.add(onKicked);
    return () => {
      roomKickedHandlers.delete(onKicked);
    };
  },

  subscribeRoomMemberChanged(onChange: Handler<{ roomId: string; userId: string; joined: boolean }>) {
    ensureConnected();
    roomMemberChangedHandlers.add(onChange);
    return () => {
      roomMemberChangedHandlers.delete(onChange);
    };
  },

  subscribeRoomPresence(onPresence: Handler<{ roomId: string; userId: string; online: boolean }>) {
    ensureConnected();
    roomPresenceHandlers.add(onPresence);
    return () => {
      roomPresenceHandlers.delete(onPresence);
    };
  },

  ensureConnected,
  close: closeWs,
};

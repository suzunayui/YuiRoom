export type Room = {
  id: string;
  name: string;
  owner_id?: string | null;
};

export type Category = {
  id: string;
  name: string;
  position: number;
};

export type Channel = {
  id: string;
  name: string;
  position: number;
  category_id?: string | null;
};

export type RoomTree = {
  room: Room;
  categories: Array<{
    id: string;
    name: string;
    position: number;
    channels: Array<{ id: string; name: string; position: number }>;
  }>;
  uncategorized: Array<{ id: string; name: string; position: number }>;
};

export type RoomBan = {
  userId: string;
  displayName: string;
  reason: string | null;
  created_at: string;
};

export type InviteCreated = {
  code: string;
  roomId: string;
};

export type RoomInvite = {
  code: string;
  uses: number;
  max_uses: number;
  expires_at: string;
  created_at: string;
};

export type RoomMember = {
  userId: string;
  displayName: string;
  hasAvatar: boolean;
  isOwner: boolean;
  online?: boolean;
};

export type AuditLog = {
  id: string;
  roomId: string | null;
  action: string;
  actorId: string;
  actorDisplayName: string;
  targetType: string | null;
  targetId: string | null;
  meta: any;
  created_at: string;
};

export type ChannelActivity = {
  channelId: string;
  lastMessageAt: string | null;
};

export type InviteJoinResult = {
  ok: true;
  roomId: string;
  roomName: string;
};

export type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  author: string;
  author_has_avatar?: boolean;
  author_is_banned?: boolean;
  content: string;
  created_at: string;
  edited_at?: string | null;
  reply_to?: string | null;
  reply?: { id: string; author: string; content: string } | null;
  attachments?: Array<{ id: string; mime_type: string }>;
  reactions?: Array<{ emoji: string; count: number; byMe: boolean }>;
};

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3000";
}

let authToken: string | null = null;
let onAuthError: ((reason: string) => void) | null = null;

function authHeaders(): Record<string, string> {
  return authToken ? { authorization: `Bearer ${authToken}` } : {};
}

async function handleAuthFailure(res: Response) {
  if (res.status !== 401) return;
  // トークン失効/未設定/不正など。以後のリクエストを止めるために破棄。
  authToken = null;
  const msg = (await extractError(res)) ?? "auth_invalid";
  try {
    onAuthError?.(msg);
  } catch {
    // ignore
  }
}

async function extractError(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    if (data && typeof data === "object" && "error" in (data as any)) {
      const e = (data as any).error;
      if (typeof e === "string" && e.trim()) return e;
    }
  } catch {
    // ignore
  }
  return null;
}

async function getJson<T>(path: string): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`, { headers: authHeaders() });
  await handleAuthFailure(res);
  if (!res.ok) {
    const msg = await extractError(res);
    throw new Error(msg ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}


async function deleteJson<T>(path: string): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`, { method: "DELETE", headers: authHeaders() });
  await handleAuthFailure(res);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  await handleAuthFailure(res);
  if (!res.ok) {
    const msg = await extractError(res);
    throw new Error(msg ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  await handleAuthFailure(res);
  if (!res.ok) {
    const msg = await extractError(res);
    throw new Error(msg ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export type AuthOk = {
  ok: true;
  userId: string;
  displayName: string;
  token: string;
};

export type FriendUser = {
  userId: string;
  displayName: string;
  hasAvatar: boolean;
};

export type FriendRequests = {
  incoming: Array<{ id: string; userId: string; displayName: string; hasAvatar: boolean }>;
  outgoing: Array<{ id: string; userId: string; displayName: string; hasAvatar: boolean }>;
};

export type DmThread = {
  threadId: string;
  userId: string;
  displayName: string;
  hasAvatar: boolean;
};

export type DmMessage = {
  id: string;
  thread_id: string;
  author_id: string;
  author: string;
  author_has_avatar?: boolean;
  content: string;
  created_at: string;
};

export const api = {
  base: apiBase,
  getAuthToken: () => authToken,
  setAuthToken: (token: string | null) => {
    authToken = token && token.trim() ? token.trim() : null;
  },
  setOnAuthError: (fn: ((reason: string) => void) | null) => {
    onAuthError = fn;
  },
  health: () => getJson<{ ok: boolean }>("/health"),
  listRooms: () => getJson<Room[]>("/rooms"),
  getRoomTree: (roomId: string) => getJson<RoomTree>(`/rooms/${encodeURIComponent(roomId)}/tree`),
  createRoom: (name: string) => postJson<Room>("/rooms", { name }),
  deleteRoom: (roomId: string) => deleteJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}`),
  createCategory: (roomId: string, name: string, position?: number) =>
    postJson<{ id: string; room_id: string; name: string; position: number }>(
      `/rooms/${encodeURIComponent(roomId)}/categories`,
      { name, position }
    ),
  deleteCategory: (roomId: string, categoryId: string) =>
    deleteJson<{ ok: boolean }>(
      `/rooms/${encodeURIComponent(roomId)}/categories/${encodeURIComponent(categoryId)}`
    ),
  createChannel: (roomId: string, name: string, categoryId?: string | null, position?: number) =>
    postJson<{ id: string; room_id: string; category_id: string | null; name: string; position: number }>(
      `/rooms/${encodeURIComponent(roomId)}/channels`,
      { name, categoryId: categoryId ?? null, position }
    ),
  deleteChannel: (roomId: string, channelId: string) =>
    deleteJson<{ ok: boolean }>(
      `/rooms/${encodeURIComponent(roomId)}/channels/${encodeURIComponent(channelId)}`
    ),

  createRoomInvite: (roomId: string) =>
    postJson<InviteCreated>(`/rooms/${encodeURIComponent(roomId)}/invites`, {}),
  listRoomInvites: (roomId: string) =>
    getJson<RoomInvite[]>(`/rooms/${encodeURIComponent(roomId)}/invites`),
  deleteRoomInvite: (roomId: string, code: string) =>
    deleteJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/invites/${encodeURIComponent(code)}`),
  listRoomMembers: (roomId: string) =>
    getJson<RoomMember[]>(`/rooms/${encodeURIComponent(roomId)}/members`),
  listRoomAudit: (roomId: string, opts?: { before?: string; limit?: number }) => {
    const q = new URLSearchParams();
    q.set("limit", String(opts?.limit ?? 50));
    if (opts?.before) q.set("before", opts.before);
    return getJson<AuditLog[]>(`/rooms/${encodeURIComponent(roomId)}/audit?${q.toString()}`);
  },
  listMyAudit: (opts?: { before?: string; limit?: number; scope?: "home" | "all" }) => {
    const q = new URLSearchParams();
    q.set("limit", String(opts?.limit ?? 50));
    q.set("scope", String(opts?.scope ?? "home"));
    if (opts?.before) q.set("before", opts.before);
    return getJson<AuditLog[]>(`/audit?${q.toString()}`);
  },
  listChannelActivity: (roomId: string) =>
    getJson<ChannelActivity[]>(`/rooms/${encodeURIComponent(roomId)}/channels/activity`),
  leaveRoom: (roomId: string) =>
    deleteJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/members/me`),
  kickRoomMember: (roomId: string, userId: string) =>
    deleteJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`),
  joinByInvite: (code: string) =>
    postJson<InviteJoinResult>(`/invites/join`, { code }),

  listRoomBans: (roomId: string) => getJson<RoomBan[]>(`/rooms/${encodeURIComponent(roomId)}/bans`),
  banUser: (roomId: string, userId: string, reason?: string | null) =>
    postJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/bans`, { userId, reason: reason ?? null }),
  unbanUser: (roomId: string, userId: string) =>
    deleteJson<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/bans/${encodeURIComponent(userId)}`),
  attachmentUrl: (attachmentId: string) => {
    const base = apiBase();
    return `${base}/attachments/${encodeURIComponent(attachmentId)}`;
  },
  fetchAttachmentBlob: async (attachmentId: string): Promise<Blob> => {
    const base = apiBase();
    const res = await fetch(`${base}/attachments/${encodeURIComponent(attachmentId)}`, { headers: authHeaders() });
    await handleAuthFailure(res);
    if (!res.ok) {
      const msg = await extractError(res);
      throw new Error(msg ?? `HTTP ${res.status}`);
    }
    return await res.blob();
  },
  userAvatarUrl: (userId: string) => `${apiBase()}/users/${encodeURIComponent(userId)}/avatar`,
  setUserAvatar: (userId: string, dataUrl: string | null) =>
    postJson<{ ok: boolean }>(`/users/${encodeURIComponent(userId)}/avatar`, {
      dataUrl: dataUrl && dataUrl.trim() ? dataUrl : null,
    }),
  setUserDisplayName: (userId: string, displayName: string) =>
    postJson<{ ok: boolean }>(`/users/${encodeURIComponent(userId)}/displayName`, { displayName }),
  listMessages: (channelId: string, limit?: number) => {
    const q = new URLSearchParams();
    q.set("limit", String(limit ?? 50));
    return getJson<{ items: Message[]; hasMore: boolean }>(
      `/channels/${encodeURIComponent(channelId)}/messages?${q.toString()}`
    );
  },
  listMessagesBefore: (channelId: string, beforeIso: string, limit?: number) => {
    const q = new URLSearchParams();
    q.set("limit", String(limit ?? 50));
    q.set("before", beforeIso);
    return getJson<{ items: Message[]; hasMore: boolean }>(
      `/channels/${encodeURIComponent(channelId)}/messages?${q.toString()}`
    );
  },
  createMessage: (
    channelId: string,
    content: string,
    opts?: { replyTo?: string | null; attachmentDataUrl?: string | null }
  ) =>
    postJson<Message>(`/channels/${encodeURIComponent(channelId)}/messages`, {
      content,
      replyTo: opts?.replyTo ?? null,
      attachments: opts?.attachmentDataUrl ? [{ dataUrl: opts.attachmentDataUrl }] : [],
    }),
  toggleReaction: (messageId: string, emoji: string) =>
    postJson<{ messageId: string; reactions: Array<{ emoji: string; count: number; byMe: boolean }> }>(
      `/messages/${encodeURIComponent(messageId)}/reactions/toggle`,
      { emoji }
    ),
  deleteMessage: (messageId: string) =>
    deleteJson<{ ok: boolean }>(`/messages/${encodeURIComponent(messageId)}`),
  editMessage: (messageId: string, content: string) =>
    patchJson<{ ok: boolean; messageId: string; content: string; edited_at: string | null }>(
      `/messages/${encodeURIComponent(messageId)}`,
      { content }
    ),

  // passkey
  passkeyRegisterOptions: (userId: string, displayName: string) =>
    postJson<any>("/auth/register/options", { userId, displayName }),
  passkeyRegisterVerify: (userId: string, response: any) =>
    postJson<AuthOk>("/auth/register/verify", { userId, response }),
  passkeyLoginOptions: (userId: string) => postJson<any>("/auth/login/options", { userId }),
  passkeyLoginVerify: (userId: string, response: any) =>
    postJson<AuthOk>("/auth/login/verify", { userId, response }),

  // friends / dm
  listFriends: () => getJson<FriendUser[]>("/friends"),
  listFriendRequests: () => getJson<FriendRequests>("/friends/requests"),
  sendFriendRequest: (toUserId: string) => postJson<{ ok: true; id: string }>("/friends/requests", { toUserId }),
  acceptFriendRequest: (requestId: string) =>
    postJson<{ ok: boolean }>(`/friends/requests/${encodeURIComponent(requestId)}/accept`, {}),
  rejectFriendRequest: (requestId: string) =>
    postJson<{ ok: boolean }>(`/friends/requests/${encodeURIComponent(requestId)}/reject`, {}),

  deleteFriend: (userId: string) =>
    deleteJson<{ ok: boolean }>(`/friends/${encodeURIComponent(userId)}`),

  listDmThreads: () => getJson<DmThread[]>("/dm/threads"),
  openDmThread: (userId: string) => postJson<{ ok: boolean; threadId: string }>("/dm/threads", { userId }),
  listDmMessages: (threadId: string, limit?: number) => {
    const q = new URLSearchParams();
    q.set("limit", String(limit ?? 200));
    return getJson<DmMessage[]>(`/dm/threads/${encodeURIComponent(threadId)}/messages?${q.toString()}`);
  },
  sendDmMessage: (threadId: string, content: string) =>
    postJson<DmMessage>(`/dm/threads/${encodeURIComponent(threadId)}/messages`, { content }),
};

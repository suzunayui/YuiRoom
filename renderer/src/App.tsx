import { useMemo, useState, useEffect, useRef } from "react";
import "./App.css";
import { api } from "./api";
import type { Room, RoomTree } from "./api";
import { ServerList } from "./ServerList";
import { ChannelList } from "./ChannelList";
import { MessageArea } from "./MessageArea";
import { Modal } from "./Modal";
import { MemberPane } from "./MemberPane";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { DmMessage, FriendRequests, FriendUser } from "./api";
import type { RoomMember } from "./api";
import type { AuditLog } from "./api";
import { realtime } from "./realtime";

type Mode = "login" | "register";

type LoginForm = { userId: string };
type RegisterForm = { userId: string; displayName: string };

const USER_ID_REGEX = /^[a-z0-9_-]{3,32}$/;

function normalizeUserId(v: string) {
  return v.trim().toLowerCase();
}

function validateUserId(userId: string): string | null {
  const v = normalizeUserId(userId);
  if (!v) return "ユーザーIDを入力してね";
  if (!USER_ID_REGEX.test(v)) return "ユーザーIDは a-z 0-9 _ - のみ、3〜32文字だよ（ドット不可）";
  return null;
}

function validateDisplayName(name: string): string | null {
  const v = name.trim();
  if (!v) return "ユーザー名を入力してね";
  if (v.length > 32) return "ユーザー名は32文字までにしてね";
  if (/[^\S\r\n]*[\r\n]+[^\S\r\n]*/.test(v)) return "改行は使えないよ";
  return null;
}

function displayNameKey(userId: string) {
  return `yuiroom.displayName:${userId}`;
}

function avatarKey(userId: string) {
  return `yuiroom.avatar:${userId}`;
}

const SAVED_USER_ID_KEY = "yuiroom.savedUserId";

function readSavedUserId(): string {
  try {
    return localStorage.getItem(SAVED_USER_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSavedUserId(userId: string | null) {
  try {
    const v = userId ? normalizeUserId(userId) : "";
    if (v) localStorage.setItem(SAVED_USER_ID_KEY, v);
    else localStorage.removeItem(SAVED_USER_ID_KEY);
  } catch {
    // ignore
  }
}

const HOME_ID = "__home__";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [mode, setMode] = useState<Mode>("login");

  const [rememberUserId, setRememberUserId] = useState(true);

  const [login, setLogin] = useState<LoginForm>(() => ({ userId: readSavedUserId() }));
  const [reg, setReg] = useState<RegisterForm>(() => ({ userId: readSavedUserId(), displayName: "" }));

  const loginErr = useMemo(() => validateUserId(login.userId), [login.userId]);
  const regUserIdErr = useMemo(() => validateUserId(reg.userId), [reg.userId]);
  const regNameErr = useMemo(() => validateDisplayName(reg.displayName), [reg.displayName]);

  const [agreeNoRecovery, setAgreeNoRecovery] = useState(false);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 仮：ログイン状態（後でパスキーに差し替え）
  const [authed, setAuthed] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsAvatar, setSettingsAvatar] = useState<string>("");
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Rooms画面
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // RoomView
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [tree, setTree] = useState<RoomTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // Home: friends & DM
  const [friendInput, setFriendInput] = useState("");
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  const [selectedDmThreadId, setSelectedDmThreadId] = useState<string | null>(null);
  const [selectedDmPeerName, setSelectedDmPeerName] = useState<string | null>(null);
  const [selectedDmPeerUserId, setSelectedDmPeerUserId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [dmText, setDmText] = useState("");
  const [dmSending, setDmSending] = useState(false);

  const openDmSeqRef = useRef(0);

  const [createModal, setCreateModal] = useState<
    | null
    | { kind: "room" }
    | { kind: "category" }
    | { kind: "channel"; categoryId: string | null }
  >(null);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deleteModal, setDeleteModal] = useState<
    | null
    | { kind: "room"; roomId: string; roomName: string }
    | { kind: "category"; roomId: string; categoryId: string; categoryName: string }
    | { kind: "channel"; roomId: string; channelId: string; channelName: string }
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [banModal, setBanModal] = useState<null | { roomId: string; roomName: string }>(null);
  const [banUserId, setBanUserId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banBusy, setBanBusy] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);

  const [inviteModal, setInviteModal] = useState<null | { roomId: string; roomName: string; isOwner: boolean }>(null);
  const [invites, setInvites] = useState<Array<{ code: string; uses: number; max_uses: number; expires_at: string; created_at: string }>>([]);
  const [members, setMembers] = useState<Array<{ userId: string; displayName: string; hasAvatar: boolean; isOwner: boolean }>>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [homeAuditOpen, setHomeAuditOpen] = useState(false);
  const [homeAuditLogs, setHomeAuditLogs] = useState<AuditLog[]>([]);
  const [homeAuditBusy, setHomeAuditBusy] = useState(false);
  const [homeAuditError, setHomeAuditError] = useState<string | null>(null);

  const [memberPane, setMemberPane] = useState<RoomMember[]>([]);
  const [memberPaneLoading, setMemberPaneLoading] = useState(false);
  const [memberPaneError, setMemberPaneError] = useState<string | null>(null);

  const [unreadByChannelId, setUnreadByChannelId] = useState<Record<string, boolean>>({});
  const lastReadRef = useRef<Record<string, string>>({});
  const selectedChannelIdRef = useRef<string | null>(null);
  const selectedRoomIdRef = useRef<string | null>(null);
  const selectedDmThreadIdRef = useRef<string | null>(null);
  const dmToastUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const lastToastRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  const [confirmModal, setConfirmModal] = useState<
    | null
    | { kind: "leave"; roomId: string; roomName: string }
    | { kind: "kick"; roomId: string; userId: string; displayName: string }
  >(null);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function loadRooms() {
    setRoomsLoading(true);
    try {
      // healthチェック（任意だけど、失敗時に原因分かりやすい）
      await api.health();
      const list = await api.listRooms();
      setRooms(list);
      // 最初のルームを選択
      if (list.length > 0 && !selectedRoomId) {
        setSelectedRoomId(list[0].id);
      }
    } catch (e: any) {
      setToast(e?.message ?? "failed");
      setRooms(null);
    } finally {
      setRoomsLoading(false);
    }
  }

  async function createRoom(name: string) {
    const room = await api.createRoom(name);
    setRooms((prev) => (prev ? [...prev, room] : [room]));
    setSelectedRoomId(room.id);
  }

  async function createCategory(name: string) {
    if (!selectedRoomId) return;
    await api.createCategory(selectedRoomId, name);
    await loadTree(selectedRoomId);
  }

  async function createChannel(args: { name: string; categoryId: string | null }) {
    if (!selectedRoomId) return;
    await api.createChannel(selectedRoomId, args.name, args.categoryId);
    await loadTree(selectedRoomId);
  }

  async function loadTree(roomId: string) {
    setTreeLoading(true);
    try {
      const t = await api.getRoomTree(roomId);
      setTree(t);
      // 初期選択：最初のチャンネル
      const first =
        t.categories?.[0]?.channels?.[0]?.id ??
        t.uncategorized?.[0]?.id ??
        null;
      setSelectedChannelId(first);
    } catch (e: any) {
      setToast(e?.message ?? "failed");
      setTree(null);
    } finally {
      setTreeLoading(false);
    }
  }

  function lastReadKey(userId: string) {
    return `yuiroom.lastReadAt:${userId}`;
  }

  function readLastRead(userId: string) {
    try {
      const raw = localStorage.getItem(lastReadKey(userId));
      if (!raw) return {};
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return {};
      return obj as Record<string, string>;
    } catch {
      return {};
    }
  }

  function writeLastRead(userId: string, map: Record<string, string>) {
    try {
      localStorage.setItem(lastReadKey(userId), JSON.stringify(map));
    } catch {
      // ignore
    }
  }

  async function loadMemberPane(roomId: string) {
    setMemberPaneLoading(true);
    setMemberPaneError(null);
    try {
      const list = await api.listRoomMembers(roomId);
      setMemberPane(list);
    } catch (e: any) {
      const msg = e?.message ?? "failed";
      // public room or not member => just hide list
      if (msg === "room_public_no_members" || msg === "not_member") {
        setMemberPane([]);
        setMemberPaneError(null);
      } else {
        setMemberPane([]);
        setMemberPaneError(msg);
      }
    } finally {
      setMemberPaneLoading(false);
    }
  }

  useEffect(() => {
    if (selectedRoomId && selectedRoomId !== HOME_ID) {
      loadTree(selectedRoomId);
      void loadMemberPane(selectedRoomId);
    } else {
      setTree(null);
      setSelectedChannelId(null);
      setMemberPane([]);
      setMemberPaneError(null);
      setUnreadByChannelId({});
    }
  }, [selectedRoomId]);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    selectedDmThreadIdRef.current = selectedDmThreadId;
  }, [selectedDmThreadId]);

  useEffect(() => {
    if (!authed || !currentUserId) return;
    lastReadRef.current = readLastRead(currentUserId);
  }, [authed, currentUserId]);

  useEffect(() => {
    if (!authed || !currentUserId) return;
    if (!selectedRoomId || selectedRoomId === HOME_ID) return;
    void (async () => {
      try {
        const activity = await api.listChannelActivity(selectedRoomId);
        const lastRead = lastReadRef.current;
        const next: Record<string, boolean> = {};
        for (const a of activity) {
          if (!a.lastMessageAt) continue;
          const readAt = lastRead[a.channelId];
          if (!readAt) continue;
          if (Date.parse(a.lastMessageAt) > Date.parse(readAt)) next[a.channelId] = true;
        }
        setUnreadByChannelId(next);
      } catch {
        // ignore
      }
    })();
  }, [authed, currentUserId, selectedRoomId]);

  useEffect(() => {
    if (!authed) return;
    const roomId = tree?.room?.id;
    if (!roomId) return;
    const channelIds = [
      ...tree.categories.flatMap((c) => c.channels.map((ch) => ch.id)),
      ...tree.uncategorized.map((ch) => ch.id),
    ];
    const channelNameById = new Map<string, string>();
    for (const c of tree.categories) for (const ch of c.channels) channelNameById.set(ch.id, ch.name);
    for (const ch of tree.uncategorized) channelNameById.set(ch.id, ch.name);

    function maybeToast(key: string, msg: string) {
      const now = Date.now();
      if (lastToastRef.current.key === key && now - lastToastRef.current.at < 1500) return;
      lastToastRef.current = { key, at: now };
      setToast(msg);
    }

    function isMentioned(content: unknown) {
      if (!currentUserId) return false;
      if (typeof content !== "string") return false;
      const c = content.toLowerCase();
      const idToken = `@${currentUserId.toLowerCase()}`;
      if (c.includes(idToken)) return true;
      const dn = (displayName || "").trim();
      if (dn) {
        const dnToken = `@${dn.toLowerCase()}`;
        if (c.includes(dnToken)) return true;
      }
      return false;
    }

    const unsubs = channelIds.map((channelId) =>
      realtime.subscribeChannelMessage(channelId, (msg) => {
        if (selectedChannelIdRef.current === channelId) return;
        setUnreadByChannelId((prev) => (prev[channelId] ? prev : { ...prev, [channelId]: true }));

        // toast on mention
        if (!msg || typeof msg !== "object") return;
        const authorId = String((msg as any).author_id ?? "");
        if (currentUserId && authorId === currentUserId) return;
        const content = (msg as any).content;
        if (!isMentioned(content)) return;
        const author = String((msg as any).author ?? "someone");
        const channelName = channelNameById.get(channelId) ?? "channel";
        const text = typeof content === "string" ? content.trim() : "";
        const snippet = text.length > 60 ? `${text.slice(0, 60)}…` : text;
        maybeToast(`mention:${channelId}:${(msg as any).id ?? ""}`, `@メンション #${channelName} — ${author}: ${snippet}`);
      })
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [authed, tree?.room?.id]);

  useEffect(() => {
    if (!authed || !currentUserId) return;

    let cancelled = false;

    function maybeToast(key: string, msg: string) {
      const now = Date.now();
      if (lastToastRef.current.key === key && now - lastToastRef.current.at < 1500) return;
      lastToastRef.current = { key, at: now };
      setToast(msg);
    }

    async function refreshDmToastSubscriptions() {
      try {
        const threads = await api.listDmThreads();
        if (cancelled) return;

        const nextIds = new Set(threads.map((t) => t.threadId));

        // unsubscribe removed
        for (const [id, unsub] of dmToastUnsubsRef.current.entries()) {
          if (nextIds.has(id)) continue;
          try { unsub(); } catch {}
          dmToastUnsubsRef.current.delete(id);
        }

        // subscribe new
        for (const t of threads) {
          const threadId = t.threadId;
          if (dmToastUnsubsRef.current.has(threadId)) continue;
          const unsub = realtime.subscribeDmMessage(threadId, (msg: any) => {
            const authorId = String(msg?.author_id ?? "");
            if (authorId === currentUserId) return;
            if (selectedRoomIdRef.current === HOME_ID && selectedDmThreadIdRef.current === threadId) return;
            const author = String(msg?.author ?? t.displayName ?? "DM");
            const text = String(msg?.content ?? "").trim();
            const snippet = text.length > 60 ? `${text.slice(0, 60)}…` : text;
            maybeToast(`dm:${threadId}:${String(msg?.id ?? "")}`, `DM — ${author}: ${snippet}`);
          });
          dmToastUnsubsRef.current.set(threadId, unsub);
        }
      } catch {
        // ignore
      }
    }

    void refreshDmToastSubscriptions();
    const unsubHome = realtime.subscribeHome(() => {
      void refreshDmToastSubscriptions();
    });

    return () => {
      cancelled = true;
      try { unsubHome(); } catch {}
      for (const unsub of dmToastUnsubsRef.current.values()) {
        try { unsub(); } catch {}
      }
      dmToastUnsubsRef.current.clear();
    };
  }, [authed, currentUserId, displayName]);

  function selectChannelAndMarkRead(channelId: string) {
    setSelectedChannelId(channelId);
    setUnreadByChannelId((prev) => {
      if (!prev[channelId]) return prev;
      const { [channelId]: _x, ...rest } = prev;
      return rest;
    });
    if (currentUserId) {
      const next = { ...lastReadRef.current, [channelId]: new Date().toISOString() };
      lastReadRef.current = next;
      writeLastRead(currentUserId, next);
    }
  }

  async function loadHome() {
    setHomeLoading(true);
    setHomeError(null);
    try {
      const [f, r] = await Promise.all([api.listFriends(), api.listFriendRequests()]);
      setFriends(f);
      setRequests(r);

      if (selectedDmPeerUserId && !f.some((x) => x.userId === selectedDmPeerUserId)) {
        setSelectedDmPeerName(null);
        setSelectedDmPeerUserId(null);
        setSelectedDmThreadId(null);
        setDmMessages([]);
        setDmError(null);
        setDmLoading(false);
        setDmText("");
        setToast("フレンドじゃなくなったからDMを閉じたよ");
      }
    } catch (e: any) {
      setHomeError(e?.message ?? "failed");
    } finally {
      setHomeLoading(false);
    }
  }

  useEffect(() => {
    if (!authed) return;
    if (selectedRoomId !== HOME_ID) return;
    void loadHome();
  }, [authed, selectedRoomId]);

  useEffect(() => {
    if (!authed) return;
    if (selectedRoomId !== HOME_ID) return;
    const unsub = realtime.subscribeHome(() => {
      void loadHome();
    });
    return unsub;
  }, [authed, selectedRoomId]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeRoomBanned(({ roomId }) => {
      let wasCurrent = false;
      setSelectedRoomId((prev) => {
        wasCurrent = prev === roomId;
        return HOME_ID;
      });
      setBanModal(null);
      setCreateModal(null);
      setDeleteModal(null);
      if (wasCurrent) setToast("このRoomからBANされました");
      void loadRooms();
    });
    return unsub;
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeRoomUnbanned(() => {
      setToast("BAN解除されました");
      void loadRooms();
      // もしHome表示中なら即反映、Room表示中でも一覧は更新される
      if (selectedRoomId === HOME_ID) void loadHome();
    });
    return unsub;
  }, [authed, selectedRoomId]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeRoomLeft(({ roomId }) => {
      let wasCurrent = false;
      setSelectedRoomId((prev) => {
        wasCurrent = prev === roomId;
        return HOME_ID;
      });
      setInviteModal(null);
      if (wasCurrent) setToast("退出しました");
      void loadRooms();
    });
    return unsub;
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeRoomKicked(({ roomId }) => {
      let wasCurrent = false;
      setSelectedRoomId((prev) => {
        wasCurrent = prev === roomId;
        return HOME_ID;
      });
      setInviteModal(null);
      if (wasCurrent) setToast("Roomから外されました");
      void loadRooms();
    });
    return unsub;
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeRoomMemberChanged(({ roomId }) => {
      if (!inviteModal) return;
      if (inviteModal.roomId !== roomId) return;
      void refreshMembers();
    });
    return unsub;
  }, [authed, inviteModal]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeRoomMemberChanged(({ roomId }) => {
      if (selectedRoomId !== roomId) return;
      void loadMemberPane(roomId);
    });
    return unsub;
  }, [authed, selectedRoomId]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeRoomPresence(({ roomId, userId, online }) => {
      if (selectedRoomId !== roomId) return;
      setMemberPane((prev) => prev.map((m) => (m.userId === userId ? { ...m, online } : m)));
    });
    return unsub;
  }, [authed, selectedRoomId]);

  useEffect(() => {
    if (!authed) return;
    const unsub = realtime.subscribeHello(() => {
      const rid = selectedRoomIdRef.current;
      if (rid && rid !== HOME_ID) void loadMemberPane(rid);
      if (inviteModal?.roomId) void refreshMembers();
    });
    return unsub;
  }, [authed, inviteModal?.roomId]);

  async function deleteFriend(userId: string, displayName: string) {
    const ok = window.confirm(`${displayName} をフレンドから削除しますか？`);
    if (!ok) return;
    setHomeError(null);
    try {
      await api.deleteFriend(userId);
      await loadHome();
      // 表示中DMが該当っぽければ閉じる（厳密な紐付けはしてないので安全側）
      if (selectedDmPeerUserId === userId || selectedDmPeerName === displayName) {
        setSelectedDmPeerName(null);
        setSelectedDmPeerUserId(null);
        setSelectedDmThreadId(null);
        setDmMessages([]);
        setDmError(null);
      }
    } catch (e: any) {
      setHomeError(e?.message ?? "failed");
    }
  }

  useEffect(() => {
    if (!authed) return;
    if (selectedRoomId !== HOME_ID) return;
    if (!selectedDmThreadId) {
      setDmMessages([]);
      setDmError(null);
      return;
    }
    const threadId = selectedDmThreadId;
    let cancelled = false;
    async function load() {
      setDmLoading(true);
      setDmError(null);
      try {
        const list = await api.listDmMessages(threadId, 200);
        if (!cancelled) setDmMessages(list);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message ?? "failed";
        if (msg === "not_friends" || msg === "forbidden") {
          setSelectedDmPeerName(null);
          setSelectedDmPeerUserId(null);
          setSelectedDmThreadId(null);
          setDmMessages([]);
          setDmError(null);
          setDmLoading(false);
          setDmText("");
          setToast("フレンドじゃないからDMできないよ");
          void loadHome();
          return;
        }
        setDmError(msg);
      } finally {
        if (!cancelled) setDmLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authed, selectedRoomId, selectedDmThreadId]);

  useEffect(() => {
    if (!selectedDmThreadId) return;
    const threadId = selectedDmThreadId;
    const unsub = realtime.subscribeDmMessage(threadId, (msg: DmMessage) => {
      setDmMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    return unsub;
  }, [selectedDmThreadId]);

  useEffect(() => {
    if (!selectedDmThreadId) return;
    const threadId = selectedDmThreadId;
    const unsub = realtime.subscribeDmError(threadId, (err: string) => {
      if (err !== "not_friends" && err !== "forbidden") return;
      setSelectedDmPeerName(null);
      setSelectedDmPeerUserId(null);
      setSelectedDmThreadId(null);
      setDmMessages([]);
      setDmError(null);
      setDmLoading(false);
      setDmText("");
      setToast("フレンドじゃないからDMできないよ");
      void loadHome();
    });
    return unsub;
  }, [selectedDmThreadId]);

  async function openDmWith(friend: FriendUser) {
    const seq = ++openDmSeqRef.current;
    // クリック直後に「DM画面をクリアして読み込み中」を出す（古いDMが残るのを防ぐ）
    setSelectedDmPeerName(friend.displayName);
    setSelectedDmPeerUserId(friend.userId);
    setSelectedDmThreadId(null);
    setDmMessages([]);
    setDmError(null);
    setDmLoading(true);
    try {
      const r = await api.openDmThread(friend.userId);
      if (openDmSeqRef.current !== seq) return; // 途中で別のフレンドを開いた
      setSelectedDmThreadId(r.threadId);
    } catch (e: any) {
      if (openDmSeqRef.current !== seq) return;
      setDmLoading(false);
      const msg = e?.message ?? "failed";
      if (msg === "not_friends" || msg === "forbidden") {
        setSelectedDmPeerName(null);
        setSelectedDmPeerUserId(null);
        setSelectedDmThreadId(null);
        setDmMessages([]);
        setDmError(null);
        setDmText("");
        setToast("フレンドじゃないからDMできないよ");
        void loadHome();
        return;
      }
      setDmError(msg);
    }
  }

  async function sendFriendRequest() {
    const toUserId = friendInput.trim().toLowerCase();
    if (!toUserId) return;
    const err = validateUserId(toUserId);
    if (err) {
      setHomeError(err);
      return;
    }
    setHomeError(null);
    try {
      await api.sendFriendRequest(toUserId);
      setFriendInput("");
      await loadHome();
      setAddFriendOpen(false);
    } catch (e: any) {
      setHomeError(e?.message ?? "failed");
    }
  }

  function openAddFriend() {
    setHomeError(null);
    setFriendInput("");
    setAddFriendOpen(true);
  }

  function closeAddFriend() {
    setAddFriendOpen(false);
    setFriendInput("");
  }

  async function acceptRequest(id: string) {
    setHomeError(null);
    try {
      await api.acceptFriendRequest(id);
      await loadHome();
    } catch (e: any) {
      setHomeError(e?.message ?? "failed");
    }
  }

  async function rejectRequest(id: string) {
    setHomeError(null);
    try {
      await api.rejectFriendRequest(id);
      await loadHome();
    } catch (e: any) {
      setHomeError(e?.message ?? "failed");
    }
  }

  async function sendDm() {
    if (!selectedDmThreadId) return;
    const content = dmText.trim();
    if (!content) return;
    setDmSending(true);
    setDmError(null);
    try {
      const msg = await api.sendDmMessage(selectedDmThreadId, content);
      setDmMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setDmText("");
    } catch (e: any) {
      const msg = e?.message ?? "failed";
      if (msg === "not_friends" || msg === "forbidden") {
        setSelectedDmPeerName(null);
        setSelectedDmPeerUserId(null);
        setSelectedDmThreadId(null);
        setDmMessages([]);
        setDmError(null);
        setDmLoading(false);
        setDmText("");
        setToast("フレンドじゃないからDMできないよ");
        void loadHome();
        return;
      }
      setDmError(msg);
    } finally {
      setDmSending(false);
    }
  }

  const selectedChannelName = useMemo(() => {
    if (!tree || !selectedChannelId) return null;
    for (const c of tree.categories) {
      const hit = c.channels.find((ch) => ch.id === selectedChannelId);
      if (hit) return hit.name;
    }
    const u = tree.uncategorized.find((ch) => ch.id === selectedChannelId);
    return u?.name ?? null;
  }, [tree, selectedChannelId]);

  async function onLogin() {
    const err = validateUserId(login.userId);
    if (err) return setToast(err);

    setBusy(true);
    setToast(null);
    try {
      const userId = normalizeUserId(login.userId);
      const options = await api.passkeyLoginOptions(userId);
      const response = await startAuthentication(options as any);
      const ok = await api.passkeyLoginVerify(userId, response as any);

      if (rememberUserId) writeSavedUserId(ok.userId);
      else writeSavedUserId(null);

      api.setAuthToken(ok.token);

      setLogin({ userId: ok.userId });
      setCurrentUserId(ok.userId);

      // 端末ローカルの上書きがあれば優先
      let name = ok.displayName || ok.userId;
      try {
        const stored = localStorage.getItem(displayNameKey(ok.userId));
        if (stored?.trim()) name = stored.trim();
      } catch {
        // ignore
      }
      setDisplayName(name);

      // 端末ローカルのアイコン
      try {
        const storedAvatar = localStorage.getItem(avatarKey(ok.userId));
        setAvatarDataUrl(storedAvatar || "");
      } catch {
        setAvatarDataUrl("");
      }

      setAuthed(true);
      await loadRooms();
    } catch (e: any) {
      setToast(e?.message ?? "パスキー認証に失敗したよ");
    } finally {
      setBusy(false);
    }
  }

  async function onRegister() {
    const err1 = validateUserId(reg.userId);
    const err2 = validateDisplayName(reg.displayName);
    if (err1) return setToast(err1);
    if (err2) return setToast(err2);
    if (!agreeNoRecovery) return setToast("同意にチェックしてね（復旧不可）");

    setBusy(true);
    setToast(null);
    try {
      const userId = normalizeUserId(reg.userId);
      const name = reg.displayName.trim();

      const options = await api.passkeyRegisterOptions(userId, name);
      const response = await startRegistration(options as any);
      const ok = await api.passkeyRegisterVerify(userId, response as any);

      if (rememberUserId) writeSavedUserId(ok.userId);
      else writeSavedUserId(null);

      api.setAuthToken(ok.token);

      setLogin({ userId: ok.userId });
      setCurrentUserId(ok.userId);
      setDisplayName(ok.displayName || ok.userId);

      // 新規登録時は端末ローカルのアイコン（あれば）を読み込み
      try {
        const storedAvatar = localStorage.getItem(avatarKey(ok.userId));
        setAvatarDataUrl(storedAvatar || "");
      } catch {
        setAvatarDataUrl("");
      }

      setAuthed(true);
      await loadRooms();
    } catch (e: any) {
      setToast(e?.message ?? "パスキー登録に失敗したよ");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setAuthed(false);
    setCurrentUserId(null);
    setDisplayName("");
    setAvatarDataUrl("");
    api.setAuthToken(null);
    realtime.close();
    setSelectedRoomId(null);
    setTree(null);
    setSelectedChannelId(null);
    setRooms(null);
    setToast(null);
  }

  useEffect(() => {
    api.setOnAuthError((reason) => {
      // 401が来た = トークン期限切れ/不正など。UIをログアウトに戻す。
      logout();
      setToast("認証が切れたよ。もう一度パスキーでログインしてね");
      console.warn("auth error:", reason);
    });
    return () => api.setOnAuthError(null);
  }, []);

  useEffect(() => {
    if (!rememberUserId) writeSavedUserId(null);
  }, [rememberUserId]);

  function openSettings() {
    setSettingsOpen(true);
    setSettingsName(displayName || currentUserId || "");
    setSettingsAvatar(avatarDataUrl || "");
    setSettingsError(null);
  }

  function closeSettings() {
    setSettingsOpen(false);
    setSettingsError(null);
  }

  async function saveSettings() {
    if (!currentUserId) return;
    const err = validateDisplayName(settingsName);
    if (err) return setSettingsError(err);
    setSettingsError(null);
    const name = settingsName.trim();
    setDisplayName(name);
    try {
      localStorage.setItem(displayNameKey(currentUserId), name);
    } catch {
      // ignore
    }

    const nextAvatar = settingsAvatar || "";
    setAvatarDataUrl(nextAvatar);
    try {
      if (nextAvatar) {
        localStorage.setItem(avatarKey(currentUserId), nextAvatar);
      } else {
        localStorage.removeItem(avatarKey(currentUserId));
      }
    } catch {
      // ignore
    }

    try {
      await api.setUserDisplayName(currentUserId, name);
      await api.setUserAvatar(currentUserId, nextAvatar ? nextAvatar : null);
    } catch (e: any) {
      setSettingsError(e?.message ?? "設定の保存に失敗したよ");
      return;
    }
    setSettingsOpen(false);
  }

  function openCreateRoom() {
    setCreateModal({ kind: "room" });
    setCreateName("");
    setCreateError(null);
  }

  function openCreateCategory() {
    setCreateModal({ kind: "category" });
    setCreateName("");
    setCreateError(null);
  }

  function openCreateChannel(categoryId: string | null) {
    setCreateModal({ kind: "channel", categoryId });
    setCreateName("");
    setCreateError(null);
  }

  function closeModal() {
    if (createBusy) return;
    setCreateModal(null);
    setCreateName("");
    setCreateError(null);
  }

  function openDeleteRoom() {
    if (!selectedRoomId || !rooms) return;
    const room = rooms.find((r) => r.id === selectedRoomId);
    if (!room) return;
    setDeleteModal({ kind: "room", roomId: room.id, roomName: room.name });
    setDeleteError(null);
  }

  function openBanModal(prefillUserId?: string) {
    if (!selectedRoomId || selectedRoomId === HOME_ID || !rooms || !currentUserId) return;
    const room = rooms.find((r) => r.id === selectedRoomId);
    if (!room) return;
    if (!room.owner_id || room.owner_id !== currentUserId) return;

    const target = typeof prefillUserId === "string" ? prefillUserId.trim().toLowerCase() : "";
    if (target && target === currentUserId) {
      setToast("自分はBANできません");
      return;
    }
    setBanModal({ roomId: room.id, roomName: room.name });
    setBanUserId(target);
    setBanReason("");
    setBanError(null);
  }

  function closeBanModal() {
    if (banBusy) return;
    setBanModal(null);
    setBanUserId("");
    setBanReason("");
    setBanError(null);
  }

  async function submitBan(action: "ban" | "unban") {
    if (!banModal) return;
    const err = validateUserId(banUserId);
    if (err) {
      setBanError(err);
      return;
    }
    setBanBusy(true);
    setBanError(null);
    try {
      if (action === "ban") {
        await api.banUser(banModal.roomId, banUserId.trim().toLowerCase(), banReason.trim() || null);
        setToast("BANしました");
      } else {
        await api.unbanUser(banModal.roomId, banUserId.trim().toLowerCase());
        setToast("BAN解除しました");
      }
      closeBanModal();
    } catch (e: any) {
      setBanError(e?.message ?? "failed");
    } finally {
      setBanBusy(false);
    }
  }

  async function openInviteModal() {
    if (!selectedRoomId || selectedRoomId === HOME_ID || !rooms || !currentUserId) return;
    const room = rooms.find((r) => r.id === selectedRoomId);
    if (!room) return;
    if (!room.owner_id) return; // public room has no member/invite settings

    setInviteBusy(true);
    setInviteError(null);
    try {
      const isOwner = room.owner_id === currentUserId;
      setInviteModal({ roomId: room.id, roomName: room.name, isOwner });
      const [m, inv, logs] = await Promise.all([
        api.listRoomMembers(room.id),
        isOwner ? api.listRoomInvites(room.id) : Promise.resolve([]),
        isOwner ? api.listRoomAudit(room.id, { limit: 50 }) : Promise.resolve([] as AuditLog[]),
      ]);
      setMembers(m);
      setInvites(inv);
      setAuditLogs(logs);
      setAuditError(null);
    } catch (e: any) {
      setInviteError(e?.message ?? "failed");
      setAuditError(null);
      setToast(e?.message ?? "failed");
    } finally {
      setInviteBusy(false);
    }
  }

  function closeInviteModal(force?: boolean) {
    if (inviteBusy && !force) return;
    setInviteModal(null);
    setInviteError(null);
    setInvites([]);
    setMembers([]);
    setAuditLogs([]);
    setAuditError(null);
    setConfirmModal(null);
  }

  async function refreshAudit() {
    if (!inviteModal || !inviteModal.isOwner) return;
    setInviteBusy(true);
    setAuditError(null);
    try {
      const logs = await api.listRoomAudit(inviteModal.roomId, { limit: 50 });
      setAuditLogs(logs);
    } catch (e: any) {
      setAuditError(e?.message ?? "failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function openHomeAudit() {
    if (homeAuditBusy) return;
    setHomeAuditOpen(true);
    setHomeAuditBusy(true);
    setHomeAuditError(null);
    try {
      const logs = await api.listMyAudit({ limit: 50, scope: "home" });
      setHomeAuditLogs(logs);
    } catch (e: any) {
      setHomeAuditError(e?.message ?? "failed");
      setHomeAuditLogs([]);
    } finally {
      setHomeAuditBusy(false);
    }
  }

  function closeHomeAudit() {
    if (homeAuditBusy) return;
    setHomeAuditOpen(false);
    setHomeAuditError(null);
    setHomeAuditLogs([]);
  }

  function closeConfirmModal() {
    if (inviteBusy) return;
    setConfirmModal(null);
  }

  async function refreshInvites() {
    if (!inviteModal) return;
    if (!inviteModal.isOwner) return;
    const list = await api.listRoomInvites(inviteModal.roomId);
    setInvites(list);
  }

  async function createInvite() {
    if (!inviteModal || inviteBusy) return;
    if (!inviteModal.isOwner) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      await api.createRoomInvite(inviteModal.roomId);
      await refreshInvites();
      setToast("招待コードを発行しました");
    } catch (e: any) {
      setInviteError(e?.message ?? "failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function deleteInvite(code: string) {
    if (!inviteModal || inviteBusy) return;
    if (!inviteModal.isOwner) return;
    const ok = window.confirm("この招待コードを削除しますか？");
    if (!ok) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      await api.deleteRoomInvite(inviteModal.roomId, code);
      await refreshInvites();
      setToast("削除しました");
    } catch (e: any) {
      setInviteError(e?.message ?? "failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function refreshMembers() {
    if (!inviteModal) return;
    const list = await api.listRoomMembers(inviteModal.roomId);
    setMembers(list);
  }

  async function leaveRoom(roomId: string) {
    if (!inviteModal || inviteBusy) return;
    setConfirmModal({ kind: "leave", roomId, roomName: inviteModal.roomName });
  }

  async function confirmLeaveRoom(roomId: string) {
    setInviteBusy(true);
    setInviteError(null);
    try {
      await api.leaveRoom(roomId);
      closeInviteModal(true);
      setSelectedRoomId(HOME_ID);
      await loadRooms();
      setToast("退出しました");
    } catch (e: any) {
      setInviteError(e?.message ?? "failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function kickMember(userId: string) {
    if (!inviteModal || inviteBusy) return;
    if (!inviteModal.isOwner) return;
    const target = members.find((m) => m.userId === userId);
    setConfirmModal({ kind: "kick", roomId: inviteModal.roomId, userId, displayName: target?.displayName ?? userId });
  }

  async function confirmKickMember(roomId: string, userId: string) {
    setInviteBusy(true);
    setInviteError(null);
    try {
      await api.kickRoomMember(roomId, userId);
      await refreshMembers();
      setToast("外しました");
    } catch (e: any) {
      setInviteError(e?.message ?? "failed");
    } finally {
      setInviteBusy(false);
    }
  }

  function banFromMemberList(userId: string) {
    if (inviteBusy) return;
    closeInviteModal(true);
    openBanModal(userId);
  }

  function deleteRoomFromSettings() {
    if (inviteBusy) return;
    closeInviteModal(true);
    openDeleteRoom();
  }

  function openJoinModal() {
    setJoinOpen(true);
    setJoinCode("");
    setJoinError(null);
  }

  function closeJoinModal() {
    if (joinBusy) return;
    setJoinOpen(false);
    setJoinCode("");
    setJoinError(null);
  }

  async function submitJoin() {
    if (joinBusy) return;
    const code = joinCode.trim();
    if (!code) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      const r = await api.joinByInvite(code);
      await loadRooms();
      setSelectedRoomId(r.roomId);
      closeJoinModal();
      setToast(`参加しました: ${r.roomName || r.roomId}`);
    } catch (e: any) {
      setJoinError(e?.message ?? "failed");
    } finally {
      setJoinBusy(false);
    }
  }

  function openDeleteCategory(categoryId: string, categoryName: string) {
    if (!selectedRoomId) return;
    setDeleteModal({ kind: "category", roomId: selectedRoomId, categoryId, categoryName });
    setDeleteError(null);
  }

  function openDeleteChannel(channelId: string, channelName: string) {
    if (!selectedRoomId) return;
    setDeleteModal({ kind: "channel", roomId: selectedRoomId, channelId, channelName });
    setDeleteError(null);
  }

  function closeDeleteModal() {
    if (deleteBusy) return;
    setDeleteModal(null);
    setDeleteError(null);
  }

  async function submitDelete() {
    if (!deleteModal) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (deleteModal.kind === "room") {
        await api.deleteRoom(deleteModal.roomId);
        // rooms再取得して選択も更新
        const list = await api.listRooms();
        setRooms(list);
        const next = list.length > 0 ? list[0].id : null;
        setSelectedRoomId(next);
      }
      if (deleteModal.kind === "category") {
        await api.deleteCategory(deleteModal.roomId, deleteModal.categoryId);
        await loadTree(deleteModal.roomId);
      }
      if (deleteModal.kind === "channel") {
        await api.deleteChannel(deleteModal.roomId, deleteModal.channelId);
        // 選択中チャンネルを消した場合は loadTree が初期選択を入れる
        await loadTree(deleteModal.roomId);
      }
      setDeleteModal(null);
    } catch (e: any) {
      setDeleteError(e?.message ?? "failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submitCreate() {
    const name = createName.trim();
    if (!name || !createModal) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      if (createModal.kind === "room") {
        await createRoom(name);
      }
      if (createModal.kind === "category") {
        await createCategory(name);
      }
      if (createModal.kind === "channel") {
        await createChannel({ name, categoryId: createModal.categoryId });
      }
      setCreateModal(null);
      setCreateName("");
    } catch (e: any) {
      const msg = e?.message ?? "failed";
      if (msg === "only_first_user_can_create_rooms") {
        setCreateError("Room作成は最初に作成したアカウントのみ可能です");
      } else {
        setCreateError(msg);
      }
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className={`app ${authed ? "authed" : ""}`}>
      {authed ? (
        // Discord風レイアウト
        <div style={{ display: "flex", height: "100vh", background: "#36393f" }}>
          {rooms && (
            <ServerList
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
              onRequestCreateRoom={roomsLoading ? undefined : openCreateRoom}
              onRequestJoinRoom={roomsLoading ? undefined : openJoinModal}
              homeId={HOME_ID}
            />
          )}
          {selectedRoomId === HOME_ID ? (
            <div
              style={{
                width: 260,
                background: "#2f3136",
                borderRight: "1px solid #202225",
                height: "100vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ padding: 14, borderBottom: "1px solid #202225" }}>
                <div style={{ color: "#ffffff", fontWeight: 900, fontSize: 14, marginBottom: 10 }}>
                  ホーム
                </div>
                <button
                  onClick={openAddFriend}
                  style={{
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: "#7289da",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                  title="フレンド申請"
                >
                  フレンドを追加する
                </button>
                <button
                  onClick={() => void openHomeAudit()}
                  disabled={homeAuditBusy}
                  style={{
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 8,
                    border: "1px solid #40444b",
                    background: "transparent",
                    color: "#dcddde",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                    marginTop: 10,
                    opacity: homeAuditBusy ? 0.7 : 1,
                  }}
                  title="監査ログ"
                >
                  監査ログ
                </button>
                {homeError && !addFriendOpen && (
                  <div style={{ color: "#ff7a7a", fontSize: 12, marginTop: 10 }}>{homeError}</div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "grid", gap: 14 }}>
                <div>
                  <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
                    フレンド
                  </div>
                  {homeLoading ? (
                    <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>
                  ) : friends.length === 0 ? (
                    <div style={{ color: "#8e9297", fontSize: 12 }}>まだフレンドがいないよ</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {friends.map((f) => (
                        <div key={f.userId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button
                            onClick={() => void openDmWith(f)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 10px",
                              borderRadius: 10,
                              border: "1px solid #40444b",
                              background: "transparent",
                              color: "#dcddde",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flex: 1,
                              minWidth: 0,
                            }}
                            title="DMを開く"
                          >
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "#7289da",
                                overflow: "hidden",
                                flexShrink: 0,
                                display: "grid",
                                placeItems: "center",
                                color: "#ffffff",
                                fontWeight: 900,
                                fontSize: 12,
                              }}
                            >
                              {f.hasAvatar ? (
                                <img
                                  src={api.userAvatarUrl(f.userId)}
                                  alt="avatar"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                f.displayName?.[0]?.toUpperCase?.() ?? "?"
                              )}
                            </div>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.displayName}
                            </div>
                          </button>
                          <button
                            onClick={() => void deleteFriend(f.userId, f.displayName)}
                            style={{
                              padding: "10px 10px",
                              borderRadius: 10,
                              border: "1px solid #40444b",
                              background: "transparent",
                              color: "#dcddde",
                              cursor: "pointer",
                              flexShrink: 0,
                              fontSize: 12,
                            }}
                            title="フレンド削除"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
                    申請（受信）
                  </div>
                  {homeLoading ? (
                    <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>
                  ) : requests.incoming.length === 0 ? (
                    <div style={{ color: "#8e9297", fontSize: 12 }}>受信申請はないよ</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {requests.incoming.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "1px solid #40444b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "#7289da",
                                overflow: "hidden",
                                flexShrink: 0,
                                display: "grid",
                                placeItems: "center",
                                color: "#ffffff",
                                fontWeight: 900,
                                fontSize: 12,
                              }}
                            >
                              {r.hasAvatar ? (
                                <img
                                  src={api.userAvatarUrl(r.userId)}
                                  alt="avatar"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                r.displayName?.[0]?.toUpperCase?.() ?? "?"
                              )}
                            </div>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.displayName}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => void acceptRequest(r.id)}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "none",
                                background: "#43b581",
                                color: "#ffffff",
                                cursor: "pointer",
                                fontWeight: 900,
                                fontSize: 12,
                              }}
                            >
                              承認
                            </button>
                            <button
                              onClick={() => void rejectRequest(r.id)}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "none",
                                background: "#f04747",
                                color: "#ffffff",
                                cursor: "pointer",
                                fontWeight: 900,
                                fontSize: 12,
                              }}
                            >
                              拒否
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
                    申請（送信）
                  </div>
                  {homeLoading ? (
                    <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>
                  ) : requests.outgoing.length === 0 ? (
                    <div style={{ color: "#8e9297", fontSize: 12 }}>送信中の申請はないよ</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {requests.outgoing.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "1px solid #40444b",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            color: "#dcddde",
                          }}
                          title="承認待ち"
                        >
                          <div
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              background: "#7289da",
                              overflow: "hidden",
                              flexShrink: 0,
                              display: "grid",
                              placeItems: "center",
                              color: "#ffffff",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            {r.hasAvatar ? (
                              <img
                                src={api.userAvatarUrl(r.userId)}
                                alt="avatar"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              r.displayName?.[0]?.toUpperCase?.() ?? "?"
                            )}
                          </div>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.displayName}
                          </div>
                          <div style={{ marginLeft: "auto", color: "#8e9297", fontSize: 12, fontWeight: 900 }}>
                            承認待ち
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : tree ? (
            <ChannelList
              tree={tree}
              selectedChannelId={selectedChannelId}
              onSelectChannel={selectChannelAndMarkRead}
              unreadByChannelId={unreadByChannelId}
              onRequestCreateCategory={
                treeLoading
                  ? undefined
                  : tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                    ? openCreateCategory
                    : undefined
              }
              onOpenRoomSettings={
                tree.room.owner_id
                  ? openInviteModal
                  : undefined
              }
              onRequestCreateChannel={
                treeLoading
                  ? undefined
                  : tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                    ? openCreateChannel
                    : undefined
              }
              onRequestDeleteCategory={
                tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                  ? openDeleteCategory
                  : undefined
              }
              onRequestDeleteChannel={
                tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                  ? openDeleteChannel
                  : undefined
              }
              currentUserName={displayName || currentUserId || "user"}
              currentUserAvatarUrl={avatarDataUrl || null}
              onOpenSettings={currentUserId ? openSettings : undefined}
            />
          ) : null}

          {selectedRoomId === HOME_ID ? (
            <div
              style={{
                flex: 1,
                background: "#36393f",
                color: "#dcddde",
                display: "flex",
                flexDirection: "column",
                height: "100vh",
              }}
            >
              <div
                style={{
                  padding: "16px",
                  borderBottom: "1px solid #202225",
                  fontSize: 16,
                  fontWeight: "bold",
                }}
              >
                {selectedDmPeerName ? `@ ${selectedDmPeerName}` : "フレンド未選択"}
              </div>

              <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
                {dmLoading && <div style={{ opacity: 0.8, fontSize: 13 }}>読み込み中…</div>}
                {dmError && <div style={{ color: "#ff7a7a", fontSize: 12, marginBottom: 10 }}>{dmError}</div>}
                {!dmLoading && !dmError && selectedDmThreadId && dmMessages.length === 0 && (
                  <div style={{ opacity: 0.8, fontSize: 13 }}>まだメッセージがないよ</div>
                )}

                {dmMessages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "2px 0",
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#7289da",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        fontWeight: "bold",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                      title={msg.author}
                    >
                      {msg.author_has_avatar ? (
                        <img
                          src={api.userAvatarUrl(msg.author_id)}
                          alt="avatar"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        msg.author?.[0]?.toUpperCase?.() ?? "?"
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: "bold",
                          color: "#ffffff",
                          marginBottom: 4,
                          display: "flex",
                          alignItems: "baseline",
                          gap: 8,
                        }}
                      >
                        {msg.author}
                        <span style={{ fontSize: 12, color: "#72767d", fontWeight: "normal" }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.4, wordWrap: "break-word" as any }}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: "12px 16px", borderTop: "1px solid #202225" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    value={dmText}
                    onChange={(e) => setDmText(e.target.value)}
                    placeholder={selectedDmThreadId ? "メッセージを送信" : "フレンドを選択してね"}
                    disabled={!selectedDmThreadId || dmSending}
                    style={{
                      flex: 1,
                      padding: "12px 12px",
                      borderRadius: 8,
                      border: "1px solid #40444b",
                      background: "#202225",
                      color: "#dcddde",
                      fontSize: 14,
                      outline: "none",
                      opacity: !selectedDmThreadId ? 0.6 : 1,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void sendDm();
                    }}
                  />
                  <button
                    onClick={() => void sendDm()}
                    disabled={!selectedDmThreadId || dmSending}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#7289da",
                      color: "#ffffff",
                      fontWeight: 900,
                      cursor: !selectedDmThreadId ? "not-allowed" : "pointer",
                      opacity: !selectedDmThreadId ? 0.6 : 1,
                    }}
                  >
                    送信
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flex: 1, height: "100vh" }}>
              <MessageArea
                selectedChannelId={selectedChannelId}
                selectedChannelName={selectedChannelName}
                onAuthorClick={
                  tree?.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                    ? ({ userId }) => openBanModal(userId)
                    : undefined
                }
                currentUserId={currentUserId}
                canModerate={!!(tree?.room.owner_id && currentUserId && tree.room.owner_id === currentUserId)}
              />
              <MemberPane members={memberPane} loading={memberPaneLoading} error={memberPaneError} />
            </div>
          )}
        </div>
      ) : (
        <>
          <header className="topbar authTopbar">
            <div className="brand">
              <div className="logo">YR</div>
              <div>
                <div className="title">YuiRoom</div>
              </div>
            </div>
          </header>

          <main className="card">
            {/* 画面切り替え（カード上部） */}
            <div className="cardTop">
              <div className="seg">
                <button
                  className={`segBtn ${mode === "login" ? "active" : ""}`}
                  onClick={() => setMode("login")}
                  disabled={busy}
                >
                  ログイン
                </button>
                <button
                  className={`segBtn ${mode === "register" ? "active" : ""}`}
                  onClick={() => setMode("register")}
                  disabled={busy}
                >
                  新規登録
                </button>
              </div>
            </div>

            {/* パネル（切り替えアニメ） */}
            <div key={mode} className="panel">
              {mode === "login" ? (
                <>
                  <h1>ログイン</h1>
                  <p className="desc">ユーザーIDを入力して、パスキーで認証します。</p>

                  <label className="label">
                    ユーザーID（重複不可・変更可）
                    <input
                      className={`input ${loginErr ? "bad" : ""}`}
                      value={login.userId}
                      onChange={(e) => setLogin({ userId: e.target.value })}
                      placeholder="例: user_id"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={busy}
                    />
                    {loginErr ? (
                      <div className="hint badText">{loginErr}</div>
                    ) : (
                      <div className="hint">a-z / 0-9 / _ / - のみ（3〜32文字）</div>
                    )}
                  </label>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={rememberUserId}
                      onChange={(e) => setRememberUserId(e.target.checked)}
                      disabled={busy}
                    />
                    <span>この端末にユーザーIDを保存する</span>
                  </label>

                  <button className="primary" onClick={onLogin} disabled={busy || !!loginErr}>
                    {busy ? "認証中…" : "パスキーでログイン"}
                  </button>
                </>
              ) : (
                <>
                  <h1>新規登録</h1>
                  <p className="desc">ユーザーIDとユーザー名を設定して、パスキーを登録します。</p>

                  <label className="label">
                    ユーザーID（重複不可・変更可）
                    <input
                      className={`input ${regUserIdErr ? "bad" : ""}`}
                      value={reg.userId}
                      onChange={(e) => setReg((p) => ({ ...p, userId: e.target.value }))}
                      placeholder="例: user_id"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={busy}
                    />
                    {regUserIdErr ? (
                      <div className="hint badText">{regUserIdErr}</div>
                    ) : (
                      <div className="hint">a-z / 0-9 / _ / - のみ（3〜32文字）</div>
                    )}
                  </label>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={rememberUserId}
                      onChange={(e) => setRememberUserId(e.target.checked)}
                      disabled={busy}
                    />
                    <span>この端末にユーザーIDを保存する</span>
                  </label>

                  <label className="label">
                    ユーザー名（表示名・日本語OK・重複OK）
                    <input
                      className={`input ${regNameErr ? "bad" : ""}`}
                      value={reg.displayName}
                      onChange={(e) => setReg((p) => ({ ...p, displayName: e.target.value }))}
                      placeholder="例: user_name"
                      disabled={busy}
                    />
                    {regNameErr ? (
                      <div className="hint badText">{regNameErr}</div>
                    ) : (
                      <div className="hint">1〜32文字、改行なし</div>
                    )}
                  </label>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={agreeNoRecovery}
                      onChange={(e) => setAgreeNoRecovery(e.target.checked)}
                      disabled={busy}
                    />
                    <span>パスキーを失うと復旧できないことを理解しました（同意）</span>
                  </label>

                  <button
                    className="primary"
                    onClick={onRegister}
                    disabled={busy || !!regUserIdErr || !!regNameErr || !agreeNoRecovery}
                  >
                    {busy ? "登録中…" : "パスキーを登録してはじめる"}
                  </button>
                </>
              )}
            </div>

            {toast && <div className="toast">{toast}</div>}
          </main>

        </>
      )}

      {/* ログアウトボタン（ログイン時のみ） */}
      {authed && (
        <button
          onClick={logout}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            border: "1px solid #72767d",
            background: "#36393f",
            color: "#dcddde",
            padding: "8px 12px",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          ログアウト
        </button>
      )}

      {authed && createModal && (
        <Modal
          title={
            createModal.kind === "room"
              ? "Roomを作成"
              : createModal.kind === "category"
              ? "カテゴリを作成"
              : "チャンネルを作成"
          }
          onClose={closeModal}
          footer={
            <>
              <button
                onClick={closeModal}
                disabled={createBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={submitCreate}
                disabled={createBusy || !createName.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: createBusy ? 0.7 : 1,
                }}
              >
                作成
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
              名前
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={createBusy}
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "#202225",
                  color: "#dcddde",
                  fontSize: 14,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") closeModal();
                }}
                placeholder={
                  createModal.kind === "room"
                    ? "例: Room 2"
                    : createModal.kind === "category"
                    ? "例: 企画"
                    : "例: general"
                }
              />
            </label>
            {createError && (
              <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{createError}</div>
            )}
          </div>
        </Modal>
      )}

      {authed && settingsOpen && (
        <Modal
          title="設定"
          onClose={closeSettings}
          footer={
            <>
              <button
                onClick={closeSettings}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                閉じる
              </button>
              <button
                onClick={saveSettings}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                保存
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
              表示名
              <input
                value={settingsName}
                onChange={(e) => setSettingsName(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "#202225",
                  color: "#dcddde",
                  fontSize: 14,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveSettings();
                  if (e.key === "Escape") closeSettings();
                }}
                placeholder="例: みかん"
              />
            </label>

            <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
              アイコン画像
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "#7289da",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                    color: "#ffffff",
                    fontWeight: 900,
                    fontSize: 16,
                  }}
                  title="プレビュー"
                >
                  {settingsAvatar ? (
                    <img
                      src={settingsAvatar}
                      alt="avatar preview"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    (settingsName || displayName || currentUserId || "?")?.[0]?.toUpperCase?.() ?? "?"
                  )}
                </div>

                <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!file.type.startsWith("image/")) return;
                      // localStorageに保存する都合上、サイズは控えめに
                      if (file.size > 2 * 1024 * 1024) {
                        alert("画像が大きすぎます（2MB以下にしてください）");
                        e.currentTarget.value = "";
                        return;
                      }
                      try {
                        const dataUrl = await fileToDataUrl(file);
                        setSettingsAvatar(dataUrl);
                      } catch {
                        alert("画像の読み込みに失敗しました");
                      }
                      e.currentTarget.value = "";
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #40444b",
                      background: "#202225",
                      color: "#dcddde",
                      fontSize: 13,
                    }}
                  />
                  <button
                    onClick={() => setSettingsAvatar("")}
                    style={{
                      justifySelf: "start",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #40444b",
                      background: "transparent",
                      color: "#dcddde",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    画像を削除
                  </button>
                </div>
              </div>
            </div>

            {settingsError && (
              <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{settingsError}</div>
            )}
          </div>
        </Modal>
      )}

      {authed && addFriendOpen && (
        <Modal
          title="フレンドを追加する"
          onClose={closeAddFriend}
          footer={
            <>
              <button
                onClick={closeAddFriend}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => void sendFriendRequest()}
                disabled={!friendInput.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: friendInput.trim() ? 1 : 0.6,
                }}
              >
                申請
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
              ユーザーID
              <input
                value={friendInput}
                onChange={(e) => setFriendInput(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "#202225",
                  color: "#dcddde",
                  fontSize: 14,
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendFriendRequest();
                  if (e.key === "Escape") closeAddFriend();
                }}
                placeholder="例: user_name"
              />
            </label>
            <div style={{ color: "#8e9297", fontSize: 12, lineHeight: 1.4 }}>
              相手に承認されるとフレンドになります。
            </div>
            {homeError && (
              <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{homeError}</div>
            )}
          </div>
        </Modal>
      )}

      {authed && deleteModal && (
        <Modal
          title="削除の確認"
          onClose={closeDeleteModal}
          footer={
            <>
              <button
                onClick={closeDeleteModal}
                disabled={deleteBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={submitDelete}
                disabled={deleteBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: deleteBusy ? 0.7 : 1,
                }}
              >
                削除する
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10, color: "#dcddde" }}>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>
              {deleteModal.kind === "room" && (
                <>Room「{deleteModal.roomName}」を削除する？</>
              )}
              {deleteModal.kind === "category" && (
                <>カテゴリ「{deleteModal.categoryName}」を削除する？（配下のチャンネルも消えるよ）</>
              )}
              {deleteModal.kind === "channel" && (
                <>チャンネル「{deleteModal.channelName}」を削除する？</>
              )}
            </div>
            {deleteError && (
              <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{deleteError}</div>
            )}
          </div>
        </Modal>
      )}

      {authed && banModal && (
        <Modal title={`BAN（${banModal.roomName}）`} onClose={closeBanModal}>
          <div style={{ display: "grid", gap: 10 }}>

            <label className="label">
              ユーザーID
              <input
                className="input"
                value={banUserId}
                onChange={(e) => setBanUserId(e.target.value)}
                placeholder="例: user_id"
                disabled={banBusy}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>

            <label className="label">
              理由（任意）
              <input
                className="input"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="任意"
                disabled={banBusy}
              />
            </label>

            {banError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{banError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="primary" onClick={() => void submitBan("ban")} disabled={banBusy}>
                {banBusy ? "処理中…" : "BAN"}
              </button>
              <button
                onClick={() => void submitBan("unban")}
                disabled={banBusy}
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  padding: "12px 14px",
                  borderRadius: 14,
                  fontWeight: 800,
                  cursor: "pointer",
                  background: "rgba(0,0,0,0.18)",
                  color: "#e8ecff",
                  marginTop: 10,
                  opacity: banBusy ? 0.45 : 1,
                }}
              >
                BAN解除
              </button>
            </div>
          </div>
        </Modal>
      )}

      {authed && inviteModal && (
        <Modal
          title={`Room設定（${inviteModal.roomName}）`}
          onClose={closeInviteModal}
        >
          <div style={{ display: "grid", gap: 14, color: "#dcddde" }}>
            {inviteError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{inviteError}</div>}

            <div style={{ fontSize: 12, color: "#b9bbbe" }}>メンバー</div>
            {members.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>なし</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {members.map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #40444b",
                      background: "#202225",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "#7289da",
                          display: "grid",
                          placeItems: "center",
                          color: "#ffffff",
                          fontWeight: 900,
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                        title={m.displayName}
                      >
                        {m.hasAvatar ? (
                          <img
                            src={api.userAvatarUrl(m.userId)}
                            alt="avatar"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          m.displayName?.[0]?.toUpperCase?.() ?? "?"
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {m.displayName}
                          {m.isOwner && <span style={{ marginLeft: 8, fontSize: 11, color: "#b9bbbe" }}>(owner)</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#8e9297", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                          {m.userId}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {inviteModal.isOwner && m.userId !== currentUserId && (
                        <button
                          onClick={() => banFromMemberList(m.userId)}
                          disabled={inviteBusy}
                          style={{
                            border: "none",
                            background: "#ed4245",
                            color: "#ffffff",
                            cursor: "pointer",
                            padding: "6px 10px",
                            borderRadius: 8,
                            fontWeight: 900,
                            fontSize: 12,
                            opacity: inviteBusy ? 0.7 : 1,
                          }}
                          title="BAN"
                        >
                          BAN
                        </button>
                      )}
                      {inviteModal.isOwner && m.userId !== currentUserId && !m.isOwner && (
                        <button
                          onClick={() => void kickMember(m.userId)}
                          disabled={inviteBusy}
                          style={{
                            border: "none",
                            background: "#ed4245",
                            color: "#ffffff",
                            cursor: "pointer",
                            padding: "6px 10px",
                            borderRadius: 8,
                            fontWeight: 900,
                            fontSize: 12,
                            opacity: inviteBusy ? 0.7 : 1,
                          }}
                          title="キック"
                        >
                          外す
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!inviteModal.isOwner && (
              <button
                onClick={() => void leaveRoom(inviteModal.roomId)}
                disabled={inviteBusy}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#ed4245",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 900,
                  opacity: inviteBusy ? 0.7 : 1,
                }}
              >
                退出する
              </button>
            )}

            {inviteModal.isOwner && (
              <>
                <div style={{ height: 1, background: "#202225" }} />
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    className="primary"
                    onClick={() => void createInvite()}
                    disabled={inviteBusy}
                    style={{ width: "100%" }}
                  >
                    {inviteBusy ? "処理中…" : "招待コードを発行"}
                  </button>
                </div>

                <div style={{ fontSize: 12, color: "#b9bbbe" }}>発行中の招待コード</div>
                {invites.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>なし</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {invites.map((inv) => {
                      const expiresMs = new Date(inv.expires_at).getTime();
                      const expired = Number.isFinite(expiresMs) ? expiresMs <= Date.now() : false;
                      const maxed = Number.isFinite(inv.max_uses) ? inv.uses >= inv.max_uses : false;
                      const inactive = expired || maxed;
                      return (
                      <div
                        key={inv.code}
                        style={{
                          border: "1px solid #40444b",
                          background: "#202225",
                          borderRadius: 10,
                          padding: "10px 12px",
                          display: "grid",
                          gap: 8,
                          opacity: inactive ? 0.6 : 1,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            fontSize: 16,
                            fontWeight: 900,
                            wordBreak: "break-all",
                            userSelect: "text",
                          }}
                          title="クリックでコピー"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(inv.code);
                              setToast("コピーしました");
                            } catch {
                              setToast("コピーできませんでした");
                            }
                          }}
                        >
                          {inv.code}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#b9bbbe", flexWrap: "wrap" }}>
                          <div>使用回数: {inv.uses}/{inv.max_uses}</div>
                          <div>期限: {new Date(inv.expires_at).toLocaleString()}</div>
                        </div>
                        {inactive && (
                          <div style={{ fontSize: 12, color: "#ff7a7a", fontWeight: 900 }}>
                            {expired ? "期限切れ" : "上限到達"}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(inv.code);
                                setToast("コピーしました");
                              } catch {
                                setToast("コピーできませんでした");
                              }
                            }}
                            disabled={inviteBusy}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: "1px solid #40444b",
                              background: "transparent",
                              color: "#dcddde",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 800,
                              width: "100%",
                            }}
                          >
                            コピー
                          </button>
                          <button
                            onClick={() => void deleteInvite(inv.code)}
                            disabled={inviteBusy}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: "none",
                              background: "#ed4245",
                              color: "#ffffff",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 900,
                              width: "100%",
                              opacity: inviteBusy ? 0.7 : 1,
                            }}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ height: 1, background: "#202225" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "#b9bbbe" }}>監査ログ</div>
                  <button
                    onClick={() => void refreshAudit()}
                    disabled={inviteBusy}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #40444b",
                      background: "transparent",
                      color: "#dcddde",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      opacity: inviteBusy ? 0.7 : 1,
                    }}
                    title="更新"
                  >
                    更新
                  </button>
                </div>
                {auditError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{auditError}</div>}
                {auditLogs.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>なし</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {auditLogs.slice(0, 50).map((l) => (
                      <div
                        key={l.id}
                        style={{
                          border: "1px solid #40444b",
                          background: "#202225",
                          borderRadius: 10,
                          padding: "8px 10px",
                          display: "grid",
                          gap: 4,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                          <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {l.actorDisplayName} ({l.actorId})
                          </div>
                          <div style={{ color: "#8e9297", flexShrink: 0 }}>{new Date(l.created_at).toLocaleString()}</div>
                        </div>
                        <div style={{ fontSize: 12, color: "#b9bbbe" }}>
                          {(() => {
                            const meta = l.meta && typeof l.meta === "object" ? (l.meta as any) : null;
                            const label =
                              l.action === "room_create"
                                ? "room_create"
                                : l.action === "room_delete"
                                  ? "room_delete"
                                  : l.action === "room_join"
                                    ? "room_join"
                                    : l.action === "room_leave"
                                      ? "room_leave"
                                      : l.action === "room_kick"
                                        ? "room_kick"
                                        : l.action === "room_ban"
                                          ? "room_ban"
                                          : l.action === "room_unban"
                                            ? "room_unban"
                                            : l.action === "invite_create"
                                              ? "invite_create"
                                              : l.action === "invite_delete"
                                                ? "invite_delete"
                                                : l.action === "message_edit"
                                                  ? "message_edit"
                                                  : l.action === "message_delete"
                                                    ? "message_delete"
                                                    : l.action === "category_create"
                                                      ? "category_create"
                                                      : l.action === "category_delete"
                                                        ? "category_delete"
                                                        : l.action === "channel_create"
                                                          ? "channel_create"
                                                          : l.action === "channel_delete"
                                                            ? "channel_delete"
                                                            : l.action;
                            const extra: string[] = [];
                            if (meta?.name) extra.push(`name=${String(meta.name)}`);
                            if (meta?.reason) extra.push(`reason=${String(meta.reason)}`);
                            if (meta?.inviteCode) extra.push(`code=${String(meta.inviteCode)}`);
                            if (meta?.channelId) extra.push(`channel=${String(meta.channelId)}`);
                            if (meta?.byOwner) extra.push("byOwner");
                            return `${label}${l.targetId ? ` (${l.targetId})` : ""}${extra.length ? ` - ${extra.join(" ")}` : ""}`;
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ height: 1, background: "#202225" }} />
                <div style={{ fontSize: 12, color: "#b9bbbe" }}>危険</div>
                <button
                  onClick={deleteRoomFromSettings}
                  disabled={inviteBusy}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: "#ed4245",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 900,
                    opacity: inviteBusy ? 0.7 : 1,
                    width: "100%",
                  }}
                  title="Roomを削除"
                >
                  Roomを削除
                </button>
              </>
            )}
          </div>
        </Modal>
      )}

      {authed && confirmModal && (
        <Modal
          title="確認"
          onClose={closeConfirmModal}
          footer={
            <>
              <button
                onClick={closeConfirmModal}
                disabled={inviteBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (confirmModal.kind === "leave") void confirmLeaveRoom(confirmModal.roomId);
                  if (confirmModal.kind === "kick") void confirmKickMember(confirmModal.roomId, confirmModal.userId);
                  setConfirmModal(null);
                }}
                disabled={inviteBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#ed4245",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 900,
                  opacity: inviteBusy ? 0.7 : 1,
                }}
              >
                実行
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10, color: "#dcddde" }}>
            {confirmModal.kind === "leave" && (
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                Room「{confirmModal.roomName}」から退出しますか？
              </div>
            )}
            {confirmModal.kind === "kick" && (
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                「{confirmModal.displayName}」をRoomから外しますか？
              </div>
            )}
          </div>
        </Modal>
      )}

      {authed && joinOpen && (
        <Modal
          title="招待コードで参加"
          onClose={closeJoinModal}
          footer={
            <>
              <button
                onClick={closeJoinModal}
                disabled={joinBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => void submitJoin()}
                disabled={joinBusy || !joinCode.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: joinBusy || !joinCode.trim() ? 0.7 : 1,
                }}
              >
                {joinBusy ? "参加中…" : "参加"}
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <label className="label">
              招待コード
              <input
                className="input"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="例: a1b2c3d4e5f6"
                disabled={joinBusy}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitJoin();
                  if (e.key === "Escape") closeJoinModal();
                }}
              />
            </label>
            {joinError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{joinError}</div>}
          </div>
        </Modal>
      )}

      {authed && homeAuditOpen && (
        <Modal
          title="監査ログ"
          onClose={closeHomeAudit}
          footer={
            <>
              <button
                onClick={closeHomeAudit}
                disabled={homeAuditBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 13,
                  opacity: homeAuditBusy ? 0.7 : 1,
                }}
              >
                閉じる
              </button>
              <button
                onClick={() => void openHomeAudit()}
                disabled={homeAuditBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: homeAuditBusy ? 0.7 : 1,
                }}
              >
                更新
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10, color: "#dcddde" }}>
            {homeAuditError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{homeAuditError}</div>}
            {homeAuditBusy ? (
              <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>
            ) : homeAuditLogs.length === 0 ? (
              <div style={{ color: "#8e9297", fontSize: 12 }}>なし</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {homeAuditLogs.slice(0, 50).map((l) => (
                  <div
                    key={l.id}
                    style={{
                      border: "1px solid #40444b",
                      background: "#202225",
                      borderRadius: 10,
                      padding: "8px 10px",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.actorDisplayName} ({l.actorId})
                      </div>
                      <div style={{ color: "#8e9297", flexShrink: 0 }}>{new Date(l.created_at).toLocaleString()}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#b9bbbe" }}>
                      {(() => {
                        const meta = l.meta && typeof l.meta === "object" ? (l.meta as any) : null;
                        const extra: string[] = [];
                        if (meta?.name) extra.push(`name=${String(meta.name)}`);
                        if (meta?.reason) extra.push(`reason=${String(meta.reason)}`);
                        if (meta?.requestId) extra.push(`request=${String(meta.requestId)}`);
                        if (meta?.threadId) extra.push(`thread=${String(meta.threadId)}`);
                        if (meta?.inviteCode) extra.push(`code=${String(meta.inviteCode)}`);
                        if (meta?.channelId) extra.push(`channel=${String(meta.channelId)}`);
                        if (meta?.byOwner) extra.push("byOwner");
                        return `${l.action}${l.targetId ? ` (${l.targetId})` : ""}${extra.length ? ` - ${extra.join(" ")}` : ""}`;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

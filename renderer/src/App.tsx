import { useMemo, useState, useEffect, useRef } from "react";
import "./App.css";
import { api } from "./api";
import type { Room, RoomTree } from "./api";
import { AuthScreen } from "./views/AuthScreen";
import { AppOverlays } from "./views/AppOverlays";
import { RoomView } from "./views/RoomView";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { DmMessage, DmSearchMessage, FriendRequests, FriendUser } from "./api";
import type { RoomMember } from "./api";
import type { AuditLog } from "./api";
import { realtime } from "./realtime";
import { useAppViewportVars } from "./hooks/useAppViewportVars";
import { useIsNarrow } from "./hooks/useIsNarrow";
import { useLatestRef } from "./hooks/useLatestRef";
import { useDmToastNotifications } from "./hooks/useDmToastNotifications";
import { useHomeAutoRefresh } from "./hooks/useHomeAutoRefresh";
import {
  HOME_ID,
  avatarKey,
  displayNameKey,
  extractInviteCode,
  fileToPngAvatarDataUrl,
  hasServerAvatar,
  inviteUrlFromCode,
  normalizeUserId,
  readEnterKeySends,
  readSavedUserId,
  validateDisplayName,
  validateUserId,
  writeEnterKeySends,
  writeSavedUserId,
} from "./app/appUtils";

type Mode = "login" | "register";

type LoginForm = { userId: string };
type RegisterForm = { userId: string; displayName: string };

type NotificationItem =
  | {
      id: string;
      kind: "mention";
      title: string;
      body: string;
      at: number;
      channelId: string;
      messageId: string;
    }
  | {
      id: string;
      kind: "dm";
      title: string;
      body: string;
      at: number;
      threadId: string;
      messageId: string;
      peer: { userId: string; displayName: string; hasAvatar: boolean };
    };

type UserActionStatus =
  | { kind: "self" }
  | { kind: "friend"; friend: FriendUser }
  | { kind: "outgoing"; requestId: string }
  | { kind: "incoming"; requestId: string }
  | { kind: "none" };

export default function App() {
  const [mode, setMode] = useState<Mode>("login");
  const isNarrow = useIsNarrow(900);
  const [mobileDrawer, setMobileDrawer] = useState<null | "rooms" | "nav" | "members">(null);
  const pendingInviteRef = useRef<string | null>(null);
  const [currentUserHasServerAvatar, setCurrentUserHasServerAvatar] = useState(false);
  const [currentUserAvatarVersion, setCurrentUserAvatarVersion] = useState(0);
  const [enterKeySends, setEnterKeySends] = useState(() => readEnterKeySends());

  const [rememberUserId, setRememberUserId] = useState(true);

  const [login, setLogin] = useState<LoginForm>(() => ({ userId: readSavedUserId() }));
  const [reg, setReg] = useState<RegisterForm>(() => ({ userId: readSavedUserId(), displayName: "" }));

  const loginErr = useMemo(() => validateUserId(login.userId), [login.userId]);
  const regUserIdErr = useMemo(() => validateUserId(reg.userId), [reg.userId]);
  const regNameErr = useMemo(() => validateDisplayName(reg.displayName), [reg.displayName]);

  const [agreeNoRecovery, setAgreeNoRecovery] = useState(false);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [focusMessage, setFocusMessage] = useState<null | { messageId: string; nonce: number }>(null);
  const [focusDmMessage, setFocusDmMessage] = useState<null | { threadId: string; messageId: string; nonce: number }>(null);
  const [userAction, setUserAction] = useState<null | { userId: string; displayName: string; hasAvatar: boolean }>(null);
  const [userActionStatus, setUserActionStatus] = useState<UserActionStatus | null>(null);
  const [userActionBusy, setUserActionBusy] = useState(false);
  const [userActionError, setUserActionError] = useState<string | null>(null);

  // 仮：ログイン状態（後でパスキーに差し替え）
  const [authed, setAuthed] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>("");

  const currentUserAvatarUrl =
    avatarDataUrl?.trim()
      ? avatarDataUrl
      : currentUserId && currentUserHasServerAvatar
        ? `${api.userAvatarUrl(currentUserId)}?v=${currentUserAvatarVersion}`
        : null;

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
  const [dmHasMore, setDmHasMore] = useState(false);
  const [dmHighlightId, setDmHighlightId] = useState<string | null>(null);
  const [dmError, setDmError] = useState<string | null>(null);
  const [dmText, setDmText] = useState("");
  const [dmSending, setDmSending] = useState(false);
  const [dmReactionPickerFor, setDmReactionPickerFor] = useState<string | null>(null);

  const [dmSearchOpen, setDmSearchOpen] = useState(false);
  const [dmSearchQ, setDmSearchQ] = useState("");
  const [dmSearchBusy, setDmSearchBusy] = useState(false);
  const [dmSearchError, setDmSearchError] = useState<string | null>(null);
  const [dmSearchItems, setDmSearchItems] = useState<DmSearchMessage[]>([]);
  const [dmSearchHasMore, setDmSearchHasMore] = useState(false);
  const dmSearchBeforeRef = useRef<string | null>(null);
  const dmSearchInputRef = useRef<HTMLInputElement | null>(null);

  const openDmSeqRef = useRef(0);
  const dmListRef = useRef<HTMLDivElement | null>(null);
  const dmMessagesRef = useRef<DmMessage[]>([]);
  const dmFocusRunRef = useRef(0);
  const dmLoadingMoreRef = useRef(false);

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
  const [roomSettingsTab, setRoomSettingsTab] = useState<"members" | "invites" | "audit" | "danger">("members");
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
  const lastToastRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const selectedChannelIdRef = useLatestRef(selectedChannelId);
  const selectedRoomIdRef = useLatestRef(selectedRoomId);
  const selectedDmThreadIdRef = useLatestRef(selectedDmThreadId);

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

  useAppViewportVars();

  useEffect(() => {
    try {
      const path = String(window.location?.pathname ?? "");
      const m = /^\/invite\/([a-z0-9]{6,32})(?:\/)?$/i.exec(path);
      if (m?.[1]) {
        pendingInviteRef.current = String(m[1]).toLowerCase();
        window.history.replaceState({}, "", "/");
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    const code = pendingInviteRef.current;
    if (!code) return;
    pendingInviteRef.current = null;
    setJoinOpen(true);
    setJoinCode(inviteUrlFromCode(code));
    setJoinError(null);
  }, [authed]);

  function openDmSearch() {
    if (!selectedDmThreadId) return;
    setDmSearchOpen(true);
    setDmSearchError(null);
    setDmSearchItems([]);
    setDmSearchHasMore(false);
    dmSearchBeforeRef.current = null;
    setTimeout(() => dmSearchInputRef.current?.focus(), 0);
  }

  function closeDmSearch() {
    setDmSearchOpen(false);
    setDmSearchQ("");
    setDmSearchError(null);
    setDmSearchItems([]);
    setDmSearchHasMore(false);
    dmSearchBeforeRef.current = null;
  }

  async function runDmSearch({ append }: { append: boolean }) {
    if (!selectedDmThreadId) return;
    const q = dmSearchQ.trim();
    if (!q) return;

    const before = append ? dmSearchBeforeRef.current : null;

    setDmSearchBusy(true);
    setDmSearchError(null);
    try {
      const r = await api.searchDmMessages(selectedDmThreadId, q, { limit: 20, before });
      if (append) {
        setDmSearchItems((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const add = r.items.filter((m) => !existing.has(m.id));
          return [...prev, ...add];
        });
      } else {
        setDmSearchItems(r.items);
      }
      setDmSearchHasMore(!!r.hasMore);
      const last = r.items[r.items.length - 1];
      if (last?.created_at) dmSearchBeforeRef.current = last.created_at;
    } catch (e: any) {
      setDmSearchError(e?.message ?? "failed");
    } finally {
      setDmSearchBusy(false);
    }
  }

  async function toggleDmReaction(messageId: string, emoji: string) {
    try {
      const res = await api.toggleDmReaction(messageId, emoji);
      setDmMessages((prev) => prev.map((m) => (m.id === res.messageId ? { ...m, reactions: res.reactions } : m)));
    } catch (e: any) {
      setToast(e?.message ?? "failed");
    }
  }

  useEffect(() => {
    if (!authed) return;
    function onKeyDown(e: KeyboardEvent) {
      const isK = String((e as any).key ?? "").toLowerCase() === "k";
      if (!isK) return;
      if (!(e.ctrlKey || (e as any).metaKey)) return;
      if (selectedRoomIdRef.current !== HOME_ID) return;
      if (!selectedDmThreadIdRef.current) return;
      e.preventDefault();
      openDmSearch();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authed, selectedDmThreadId]);

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

    function pushNotification(n: NotificationItem) {
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        const next = [n, ...prev];
        return next.slice(0, 20);
      });
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
        const msgId = String((msg as any).id ?? "");
        maybeToast(`mention:${channelId}:${msgId}`, `@メンション #${channelName} — ${author}: ${snippet}`);
        if (msgId) {
          pushNotification({
            id: `mention:${roomId}:${channelId}:${msgId}`,
            kind: "mention",
            title: `@メンション #${channelName}`,
            body: `${author}: ${snippet || "(本文なし)"}`,
            at: Date.now(),
            channelId,
            messageId: msgId,
          });
        }
      })
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [authed, tree?.room?.id]);

  useDmToastNotifications({
    authed,
    currentUserId,
    apiListDmThreads: api.listDmThreads,
    subscribeDmMessage: realtime.subscribeDmMessage,
    subscribeHome: realtime.subscribeHome,
    homeId: HOME_ID,
    selectedRoomIdRef,
    selectedDmThreadIdRef,
    setToast,
    setNotifications,
  });

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

  useHomeAutoRefresh({
    authed,
    selectedRoomId,
    homeId: HOME_ID,
    loadHome,
    subscribeHome: realtime.subscribeHome,
  });

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
      setDmHasMore(false);
      setDmHighlightId(null);
      return;
    }
    const threadId = selectedDmThreadId;
    let cancelled = false;
    async function load() {
      setDmLoading(true);
      setDmError(null);
      try {
        const r = await api.listDmMessages(threadId, 200);
        if (!cancelled) {
          setDmMessages(r.items);
          setDmHasMore(!!r.hasMore);
          setDmHighlightId(null);
          dmMessagesRef.current = r.items;
        }
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
          setDmHasMore(false);
          setDmHighlightId(null);
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
    dmMessagesRef.current = dmMessages;
  }, [dmMessages]);

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
    const unsub = realtime.subscribeDmReactions(threadId, ({ messageId, reactions }) => {
      setDmMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });
    return unsub;
  }, [selectedDmThreadId]);

  useEffect(() => {
    setDmReactionPickerFor(null);
    setDmSearchOpen(false);
    setDmSearchItems([]);
    setDmSearchError(null);
    setDmSearchHasMore(false);
    dmSearchBeforeRef.current = null;
  }, [selectedDmThreadId]);

  useEffect(() => {
    if (!focusDmMessage) return;
    if (!selectedDmThreadId) return;
    const threadId = selectedDmThreadId;
    if (threadId !== focusDmMessage.threadId) return;

    const runId = ++dmFocusRunRef.current;
    const targetId = focusDmMessage.messageId;

    async function ensureVisible() {
      if (dmMessagesRef.current.some((m) => m.id === targetId)) return;

      for (let i = 0; i < 30; i++) {
        if (dmFocusRunRef.current !== runId) return;
        const oldest = dmMessagesRef.current[0];
        if (!oldest) return;
        if (!dmHasMore) return;
        if (dmLoadingMoreRef.current) return;

        dmLoadingMoreRef.current = true;
        const el = dmListRef.current;
        const prevHeight = el?.scrollHeight ?? 0;
        const prevTop = el?.scrollTop ?? 0;

        try {
          const r = await api.listDmMessagesBefore(threadId, oldest.created_at, 200);
          if (dmFocusRunRef.current !== runId) return;

          setDmMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const add = r.items.filter((m) => !existing.has(m.id));
            const next = [...add, ...prev];
            dmMessagesRef.current = next;
            return next;
          });
          setDmHasMore(!!r.hasMore);

          setTimeout(() => {
            const el2 = dmListRef.current;
            if (!el2) return;
            const newHeight = el2.scrollHeight;
            el2.scrollTop = prevTop + (newHeight - prevHeight);
          }, 0);

          if (dmMessagesRef.current.some((m) => m.id === targetId)) return;
          if (!r.hasMore || r.items.length === 0) return;
        } catch {
          return;
        } finally {
          dmLoadingMoreRef.current = false;
        }
      }
    }

    void (async () => {
      await ensureVisible();
      if (dmFocusRunRef.current !== runId) return;
      if (!dmMessagesRef.current.some((m) => m.id === targetId)) return;
      requestAnimationFrame(() => {
        const el = document.getElementById(`dm_msg_${targetId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setDmHighlightId(targetId);
        setTimeout(() => setDmHighlightId((prev) => (prev === targetId ? null : prev)), 2000);
      });
    })();
  }, [focusDmMessage?.nonce, selectedDmThreadId, dmHasMore, dmMessages.length]);

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
      setDmHasMore(false);
      setDmHighlightId(null);
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
    setDmHasMore(false);
    setDmHighlightId(null);
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
        setDmHasMore(false);
        setDmHighlightId(null);
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

  function openNotification(id: string) {
    const n = notifications.find((x) => x.id === id);
    if (!n) return;
    setNotifications((prev) => prev.filter((x) => x.id !== id));
    if (n.kind === "mention") {
      setFocusMessage((prev) => ({ messageId: n.messageId, nonce: (prev?.nonce ?? 0) + 1 }));
      selectChannelAndMarkRead(n.channelId);
      return;
    }
    setSelectedRoomId(HOME_ID);
    setFocusDmMessage((prev) => ({
      threadId: n.threadId,
      messageId: n.messageId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    void openDmWith({
      userId: n.peer.userId,
      displayName: n.peer.displayName,
      hasAvatar: n.peer.hasAvatar,
    });
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
      const response = await startAuthentication({ optionsJSON: options } as any);
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
      setCurrentUserAvatarVersion(0);
      void (async () => {
        const has = await hasServerAvatar(ok.userId);
        setCurrentUserHasServerAvatar(has);
      })();

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
      const response = await startRegistration({ optionsJSON: options } as any);
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
      setCurrentUserAvatarVersion(0);
      void (async () => {
        const has = await hasServerAvatar(ok.userId);
        setCurrentUserHasServerAvatar(has);
      })();

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
    setCurrentUserHasServerAvatar(false);
    setCurrentUserAvatarVersion(0);
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
      const msg = e?.message ?? "failed";
      if (msg === "avatar_invalid_dataUrl") {
        setSettingsError("アイコン画像の形式が対応していません（PNG/JPEG/GIF/WebP）");
      } else if (msg === "avatar_too_large") {
        setSettingsError("アイコン画像が大きすぎます（2MB以下にしてください）");
      } else {
        setSettingsError(msg || "設定の保存に失敗したよ");
      }
      return;
    }

    setCurrentUserHasServerAvatar(!!nextAvatar);
    setCurrentUserAvatarVersion((v) => v + 1);
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
      setRoomSettingsTab(isOwner ? "invites" : "members");
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
    setRoomSettingsTab("members");
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
      setToast("招待URLを発行しました");
    } catch (e: any) {
      setInviteError(e?.message ?? "failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function deleteInvite(code: string) {
    if (!inviteModal || inviteBusy) return;
    if (!inviteModal.isOwner) return;
    const ok = window.confirm("この招待URLを削除しますか？");
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
    const code = extractInviteCode(joinCode);
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

  useEffect(() => {
    if (!authed) return;
    if (!userAction) return;
    void refreshUserActionStatus(userAction.userId);
  }, [authed, userAction?.userId]);

  function openUserActions(userId: string, hint?: { displayName?: string; hasAvatar?: boolean }) {
    const m = memberPane.find((x) => x.userId === userId) || null;
    const displayName = (m?.displayName || hint?.displayName || userId).trim() || userId;
    const hasAvatar = !!(m?.hasAvatar ?? hint?.hasAvatar);
    setUserAction({ userId, displayName, hasAvatar });
    setUserActionStatus(null);
    setUserActionError(null);
  }

  function closeUserActions() {
    if (userActionBusy) return;
    setUserAction(null);
    setUserActionStatus(null);
    setUserActionError(null);
  }

  async function refreshUserActionStatus(targetUserId: string) {
    setUserActionBusy(true);
    setUserActionError(null);
    try {
      if (currentUserId && targetUserId === currentUserId) {
        setUserActionStatus({ kind: "self" });
        return;
      }

      const [friendsList, reqs] = await Promise.all([api.listFriends(), api.listFriendRequests()]);

      const friend = friendsList.find((f) => f.userId === targetUserId) || null;
      if (friend) {
        setUserActionStatus({ kind: "friend", friend });
        return;
      }

      const outgoing = reqs.outgoing.find((r) => r.userId === targetUserId) || null;
      if (outgoing) {
        setUserActionStatus({ kind: "outgoing", requestId: outgoing.id });
        return;
      }

      const incoming = reqs.incoming.find((r) => r.userId === targetUserId) || null;
      if (incoming) {
        setUserActionStatus({ kind: "incoming", requestId: incoming.id });
        return;
      }

      setUserActionStatus({ kind: "none" });
    } catch (e: any) {
      setUserActionError(e?.message ?? "failed");
    } finally {
      setUserActionBusy(false);
    }
  }

  async function userActionSendFriendRequest() {
    if (!userAction) return;
    if (userActionBusy) return;
    setUserActionBusy(true);
    setUserActionError(null);
    try {
      await api.sendFriendRequest(userAction.userId);
      setToast("フレンド申請を送ったよ");
      await refreshUserActionStatus(userAction.userId);
    } catch (e: any) {
      setUserActionError(e?.message ?? "failed");
    } finally {
      setUserActionBusy(false);
    }
  }

  async function userActionAcceptFriendRequest(requestId: string) {
    if (!userAction) return;
    if (userActionBusy) return;
    setUserActionBusy(true);
    setUserActionError(null);
    try {
      await api.acceptFriendRequest(requestId);
      setToast("フレンド申請を承認したよ");
      await refreshUserActionStatus(userAction.userId);
    } catch (e: any) {
      setUserActionError(e?.message ?? "failed");
    } finally {
      setUserActionBusy(false);
    }
  }

  async function userActionRejectFriendRequest(requestId: string) {
    if (!userAction) return;
    if (userActionBusy) return;
    setUserActionBusy(true);
    setUserActionError(null);
    try {
      await api.rejectFriendRequest(requestId);
      setToast("フレンド申請を拒否したよ");
      await refreshUserActionStatus(userAction.userId);
    } catch (e: any) {
      setUserActionError(e?.message ?? "failed");
    } finally {
      setUserActionBusy(false);
    }
  }

  return (
    <div className={`app ${authed ? "authed" : ""}`}>
      {authed ? (
        <RoomView
          authed={authed}
          isNarrow={isNarrow}
          HOME_ID={HOME_ID}
          rooms={rooms}
          roomsLoading={roomsLoading}
          selectedRoomId={selectedRoomId}
          setSelectedRoomId={setSelectedRoomId}
          openCreateRoom={openCreateRoom}
          openJoinModal={openJoinModal}
          mobileDrawer={mobileDrawer}
          setMobileDrawer={setMobileDrawer}
          tree={tree}
          treeLoading={treeLoading}
          selectedChannelId={selectedChannelId}
          selectedChannelName={selectedChannelName}
          selectChannelAndMarkRead={selectChannelAndMarkRead}
          unreadByChannelId={unreadByChannelId}
          notifications={notifications}
          setNotifications={setNotifications}
          openNotification={openNotification}
          openCreateCategory={openCreateCategory}
          openInviteModal={openInviteModal}
          openCreateChannel={openCreateChannel}
          openDeleteCategory={openDeleteCategory}
          openDeleteChannel={openDeleteChannel}
          memberPane={memberPane}
          memberPaneLoading={memberPaneLoading}
          memberPaneError={memberPaneError}
          currentUserId={currentUserId}
          displayName={displayName}
          currentUserAvatarUrl={currentUserAvatarUrl}
          openSettings={openSettings}
          avatarDataUrl={avatarDataUrl}
          openAddFriend={openAddFriend}
          openHomeAudit={openHomeAudit}
          homeAuditBusy={homeAuditBusy}
          homeError={homeError}
          addFriendOpen={addFriendOpen}
          homeLoading={homeLoading}
          friends={friends}
          openDmWith={openDmWith}
          deleteFriend={deleteFriend}
          requests={requests}
          acceptRequest={acceptRequest}
          rejectRequest={rejectRequest}
          openUserActions={openUserActions}
          enterKeySends={enterKeySends}
          focusMessage={focusMessage}
          setFocusMessage={setFocusMessage}
          setFocusDmMessage={setFocusDmMessage}
          setDmSearchOpen={setDmSearchOpen}
          selectedDmPeerName={selectedDmPeerName}
          selectedDmThreadId={selectedDmThreadId}
          dmListRef={dmListRef}
          dmLoading={dmLoading}
          dmError={dmError}
          dmMessages={dmMessages}
          dmHighlightId={dmHighlightId}
          dmReactionPickerFor={dmReactionPickerFor}
          setDmReactionPickerFor={setDmReactionPickerFor}
          toggleDmReaction={toggleDmReaction}
          dmText={dmText}
          setDmText={setDmText}
          dmSending={dmSending}
          sendDm={sendDm}
          openDmSearch={openDmSearch}
          dmSearchOpen={dmSearchOpen}
          closeDmSearch={closeDmSearch}
          dmSearchBusy={dmSearchBusy}
          dmSearchQ={dmSearchQ}
          setDmSearchQ={setDmSearchQ}
          dmSearchError={dmSearchError}
          dmSearchItems={dmSearchItems}
          dmSearchHasMore={dmSearchHasMore}
          runDmSearch={runDmSearch}
          dmSearchInputRef={dmSearchInputRef}
        />
      ) : (
        <AuthScreen
          mode={mode}
          setMode={setMode}
          busy={busy}
          toast={toast}
          login={login}
          setLogin={setLogin}
          loginErr={loginErr}
          rememberUserId={rememberUserId}
          setRememberUserId={setRememberUserId}
          reg={reg}
          setReg={setReg as any}
          regUserIdErr={regUserIdErr}
          regNameErr={regNameErr}
          agreeNoRecovery={agreeNoRecovery}
          setAgreeNoRecovery={setAgreeNoRecovery}
          onLogin={onLogin}
          onRegister={onRegister}
        />
      )}

      <AppOverlays
        authed={authed}
        logout={logout}
        createModal={createModal}
        closeModal={closeModal}
        createBusy={createBusy}
        createName={createName}
        setCreateName={setCreateName}
        submitCreate={submitCreate}
        createError={createError}
        openJoinModal={openJoinModal}
        settingsOpen={settingsOpen}
        closeSettings={closeSettings}
        saveSettings={saveSettings}
        settingsName={settingsName}
        setSettingsName={setSettingsName}
        settingsAvatar={settingsAvatar}
        setSettingsAvatar={setSettingsAvatar}
        settingsError={settingsError}
        displayName={displayName}
        currentUserId={currentUserId}
        fileToPngAvatarDataUrl={fileToPngAvatarDataUrl}
        enterKeySends={enterKeySends}
        onChangeEnterKeySends={(v: boolean) => {
          setEnterKeySends(v);
          writeEnterKeySends(v);
        }}
        addFriendOpen={addFriendOpen}
        closeAddFriend={closeAddFriend}
        sendFriendRequest={sendFriendRequest}
        friendInput={friendInput}
        setFriendInput={setFriendInput}
        homeError={homeError}
        deleteModal={deleteModal}
        closeDeleteModal={closeDeleteModal}
        deleteBusy={deleteBusy}
        submitDelete={submitDelete}
        deleteError={deleteError}
        userAction={userAction}
        closeUserActions={closeUserActions}
        userActionBusy={userActionBusy}
        selectedRoomId={selectedRoomId}
        HOME_ID={HOME_ID}
        tree={tree}
        openBanModal={openBanModal}
        userActionError={userActionError}
        userActionStatus={userActionStatus}
        setSelectedRoomId={setSelectedRoomId}
        openDmWith={openDmWith}
        userActionSendFriendRequest={userActionSendFriendRequest}
        userActionAcceptFriendRequest={userActionAcceptFriendRequest}
        userActionRejectFriendRequest={userActionRejectFriendRequest}
        banModal={banModal}
        banUserId={banUserId}
        setBanUserId={setBanUserId}
        banReason={banReason}
        setBanReason={setBanReason}
        banBusy={banBusy}
        banError={banError}
        closeBanModal={closeBanModal}
        submitBan={submitBan}
        inviteModal={inviteModal}
        closeInviteModal={closeInviteModal}
        roomSettingsTab={roomSettingsTab}
        setRoomSettingsTab={setRoomSettingsTab}
        inviteBusy={inviteBusy}
        inviteError={inviteError}
        auditError={auditError}
        members={members}
        invites={invites}
        auditLogs={auditLogs}
        inviteUrlFromCode={inviteUrlFromCode}
        setToast={setToast}
        leaveRoom={leaveRoom}
        createInvite={createInvite}
        deleteInvite={deleteInvite}
        refreshAudit={refreshAudit}
        banFromMemberList={banFromMemberList}
        kickMember={kickMember}
        deleteRoomFromSettings={deleteRoomFromSettings}
        confirmModal={confirmModal}
        closeConfirmModal={closeConfirmModal}
        confirmLeaveRoom={confirmLeaveRoom}
        confirmKickMember={confirmKickMember}
        setConfirmModal={setConfirmModal}
        joinOpen={joinOpen}
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        joinBusy={joinBusy}
        joinError={joinError}
        closeJoinModal={closeJoinModal}
        submitJoin={submitJoin}
        homeAuditOpen={homeAuditOpen}
        homeAuditBusy={homeAuditBusy}
        homeAuditError={homeAuditError}
        homeAuditLogs={homeAuditLogs}
        closeHomeAudit={closeHomeAudit}
        openHomeAudit={openHomeAudit}
      />
    </div>
  );
}

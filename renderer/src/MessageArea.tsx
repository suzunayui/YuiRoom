import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Message } from "./api";
import { realtime } from "./realtime";
import { Modal } from "./Modal";

type Props = {
  selectedChannelId: string | null;
  selectedChannelName: string | null;
  onAuthorClick?: (author: { userId: string; displayName: string }) => void;
  currentUserId?: string | null;
  canModerate?: boolean;
  mentionCandidates?: Array<{ userId: string; displayName: string }>;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function AttachmentImage({
  attachmentId,
  onOpen,
}: {
  attachmentId: string;
  onOpen?: (src: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setUrl(null);
    setFailed(false);

    void (async () => {
      try {
        const blob = await api.fetchAttachmentBlob(attachmentId);
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!active) return;
        setFailed(true);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (failed) {
    return (
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          borderRadius: 8,
          border: "1px solid #3a3f47",
          background: "#2b2d31",
          color: "#8e9297",
          padding: 12,
          fontSize: 12,
        }}
      >
        画像の読み込みに失敗しました
      </div>
    );
  }

  if (!url) {
    return (
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          borderRadius: 8,
          border: "1px solid #202225",
          background: "#2b2d31",
          height: 180,
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(url)}
      style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
      title="画像を拡大"
    >
      <img
        src={url}
        alt="attachment"
        loading="lazy"
        style={{
          maxWidth: 420,
          width: "100%",
          borderRadius: 8,
          border: "1px solid #202225",
          display: "block",
        }}
      />
    </button>
  );
}

export function MessageArea({
  selectedChannelId,
  selectedChannelName,
  onAuthorClick,
  currentUserId,
  canModerate,
  mentionCandidates,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [replyTo, setReplyTo] = useState<null | { id: string; author: string; content: string }>(null);
  const [pendingImage, setPendingImage] = useState<null | { dataUrl: string; mime: string }>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [deleteModalFor, setDeleteModalFor] = useState<null | { id: string; author: string; content: string }>(null);
  const [deleting, setDeleting] = useState(false);
  const [editFor, setEditFor] = useState<null | { id: string; text: string }>(null);
  const [editing, setEditing] = useState(false);
  const [imageModalSrc, setImageModalSrc] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const reactionEmojis = ["👍", "❤️", "😂", "🎉", "😮", "😢", "😡", "🙏"];

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const mentionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastChannelIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedChannelId) {
        setMessages([]);
        setError(null);
        setHasMore(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const r = await api.listMessages(selectedChannelId, 50);
        if (!cancelled) {
          setMessages(r.items);
          setHasMore(!!r.hasMore);
          setReplyTo(null);
          setPendingImage(null);
          setReactionPickerFor(null);
          setDeleteModalFor(null);
          setEditFor(null);
          setImageModalSrc(null);
          setMentionOpen(false);
          setMentionQuery("");
          setMentionIndex(0);
          mentionRangeRef.current = null;
          shouldStickToBottomRef.current = true;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const unsub = realtime.subscribeChannelMessage(selectedChannelId, (msg: Message) => {
      const el = listRef.current;
      const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (atBottom) shouldStickToBottomRef.current = true;
    });
    return unsub;
  }, [selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const unsub = realtime.subscribeChannelReactions(selectedChannelId, ({ messageId, reactions }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });
    return unsub;
  }, [selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const unsub = realtime.subscribeChannelDeleted(selectedChannelId, ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (replyTo?.id === messageId) setReplyTo(null);
      if (reactionPickerFor === messageId) setReactionPickerFor(null);
      if (deleteModalFor?.id === messageId) setDeleteModalFor(null);
      if (editFor?.id === messageId) setEditFor(null);
    });
    return unsub;
  }, [selectedChannelId, replyTo?.id, reactionPickerFor, deleteModalFor?.id, editFor?.id]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const unsub = realtime.subscribeChannelUpdated(selectedChannelId, ({ messageId, content, edited_at }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content, edited_at } : m)));
      if (editFor?.id === messageId) setEditFor(null);
    });
    return unsub;
  }, [selectedChannelId, editFor?.id]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const unsub = realtime.subscribeRoomBanChanged(({ userId, banned }) => {
      setMessages((prev) => prev.map((m) => (m.author_id === userId ? { ...m, author_is_banned: banned } : m)));
    });
    return unsub;
  }, [selectedChannelId]);

  useEffect(() => {
    // メッセージ追加時は一番下へ（ページングでprepend時は維持）
    const el = listRef.current;
    if (!el) return;
    if (lastChannelIdRef.current !== selectedChannelId) {
      lastChannelIdRef.current = selectedChannelId;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (!shouldStickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
    shouldStickToBottomRef.current = false;
  }, [messages.length, selectedChannelId]);

  const mentionList = (() => {
    if (!mentionOpen) return [];
    const base = (mentionCandidates ?? [])
      .filter((c) => !!c.userId)
      .filter((c) => (!currentUserId ? true : c.userId !== currentUserId))
      .map((c) => ({ userId: c.userId, displayName: c.displayName || c.userId }));

    const q = mentionQuery.trim().toLowerCase();
    const list = q
      ? base.filter((c) => {
          const uid = c.userId.toLowerCase();
          const dn = c.displayName.toLowerCase();
          return uid.includes(q) || dn.includes(q);
        })
      : base;

    function score(v: { userId: string; displayName: string }) {
      if (!q) return 0;
      const uid = v.userId.toLowerCase();
      const dn = v.displayName.toLowerCase();
      if (uid.startsWith(q) || dn.startsWith(q)) return 0;
      return 1;
    }

    list.sort((a, b) => score(a) - score(b) || a.displayName.localeCompare(b.displayName));
    return list.slice(0, 8);
  })();

  useEffect(() => {
    if (!mentionOpen) return;
    if (mentionList.length === 0) {
      setMentionOpen(false);
      mentionRangeRef.current = null;
      return;
    }
    if (mentionIndex >= mentionList.length) setMentionIndex(0);
  }, [mentionOpen, mentionList.length, mentionIndex]);

  function updateMentionFromInput(value: string, cursor: number) {
    if (!mentionCandidates || mentionCandidates.length === 0) {
      setMentionOpen(false);
      mentionRangeRef.current = null;
      return;
    }

    const before = value.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at < 0) {
      setMentionOpen(false);
      mentionRangeRef.current = null;
      return;
    }

    const prev = at > 0 ? before[at - 1] : "";
    if (prev && /[0-9A-Za-z_]/.test(prev)) {
      setMentionOpen(false);
      mentionRangeRef.current = null;
      return;
    }

    const query = before.slice(at + 1);
    if (query.includes(" ") || query.includes("\t")) {
      setMentionOpen(false);
      mentionRangeRef.current = null;
      return;
    }

    setMentionQuery(query);
    setMentionOpen(true);
    setMentionIndex(0);
    mentionRangeRef.current = { start: at, end: cursor };
  }

  function applyMention(userId: string) {
    const range = mentionRangeRef.current;
    const input = textInputRef.current;
    if (!range || !input) return;

    const insert = `@${userId} `;
    const next = text.slice(0, range.start) + insert + text.slice(range.end);
    const caret = range.start + insert.length;

    setText(next);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionIndex(0);
    mentionRangeRef.current = null;

    requestAnimationFrame(() => {
      try {
        input.focus();
        input.setSelectionRange(caret, caret);
      } catch {
        // ignore
      }
    });
  }

  async function send() {
    if (!selectedChannelId) return;
    const content = text.trim();
    if (!content && !pendingImage) return;

    setSending(true);
    setError(null);
    try {
      const el = listRef.current;
      const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      const msg = await api.createMessage(selectedChannelId, content, {
        replyTo: replyTo?.id ?? null,
        attachmentDataUrl: pendingImage?.dataUrl ?? null,
      });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (atBottom) shouldStickToBottomRef.current = true;
      setText("");
      setReplyTo(null);
      setPendingImage(null);
      setMentionOpen(false);
      setMentionQuery("");
      setMentionIndex(0);
      mentionRangeRef.current = null;
    } catch (e: any) {
      setError(e?.message ?? "failed");
    } finally {
      setSending(false);
    }
  }

  async function loadMore() {
    if (!selectedChannelId) return;
    if (loadingMore) return;
    const oldest = messages[0];
    if (!oldest) return;

    setLoadingMore(true);
    setError(null);
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    try {
      const r = await api.listMessagesBefore(selectedChannelId, oldest.created_at, 50);
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const add = r.items.filter((m) => !existing.has(m.id));
        return [...add, ...prev];
      });
      setHasMore(!!r.hasMore);
      setTimeout(() => {
        const el2 = listRef.current;
        if (!el2) return;
        const newHeight = el2.scrollHeight;
        el2.scrollTop = prevTop + (newHeight - prevHeight);
      }, 0);
    } catch (e: any) {
      setError(e?.message ?? "failed");
    } finally {
      setLoadingMore(false);
    }
  }

  function openDeleteModal(msg: { id: string; author: string; content: string }) {
    if (!selectedChannelId) return;
    if (deleting) return;
    setDeleteModalFor({ id: msg.id, author: msg.author, content: msg.content });
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteModalFor(null);
  }

  async function confirmDelete() {
    if (!selectedChannelId) return;
    if (!deleteModalFor) return;
    if (deleting) return;

    setDeleting(true);
    setError(null);
    try {
      await api.deleteMessage(deleteModalFor.id);
      setMessages((prev) => prev.filter((m) => m.id !== deleteModalFor.id));
      if (replyTo?.id === deleteModalFor.id) setReplyTo(null);
      if (reactionPickerFor === deleteModalFor.id) setReactionPickerFor(null);
      setDeleteModalFor(null);
    } catch (e: any) {
      setError(e?.message ?? "failed");
    } finally {
      setDeleting(false);
    }
  }

  function openEdit(msg: Message) {
    if (editing) return;
    setEditFor({ id: msg.id, text: msg.content });
  }

  function closeEdit() {
    if (editing) return;
    setEditFor(null);
  }

  async function submitEdit() {
    if (!editFor) return;
    if (editing) return;
    const text = editFor.text.trim();
    if (!text) {
      setError("content_required");
      return;
    }
    setEditing(true);
    setError(null);
    try {
      const r = await api.editMessage(editFor.id, text);
      setMessages((prev) =>
        prev.map((m) => (m.id === editFor.id ? { ...m, content: r.content, edited_at: r.edited_at } : m))
      );
      setEditFor(null);
    } catch (e: any) {
      setError(e?.message ?? "failed");
    } finally {
      setEditing(false);
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const file = Array.from(items)
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .find((f): f is File => !!f);

    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    e.preventDefault();
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read_failed"));
        r.readAsDataURL(file);
      });
      setPendingImage({ dataUrl, mime: file.type });
    } catch (err: any) {
      setError(err?.message ?? "image_failed");
    }
  }

  async function handlePickImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    // dataURLでJSON送信する都合上、サイズは控えめに
    if (file.size > 2 * 1024 * 1024) {
      setError("画像が大きすぎます（2MB以下にしてください）");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read_failed"));
        r.readAsDataURL(file);
      });
      setPendingImage({ dataUrl, mime: file.type });
    } catch (err: any) {
      setError(err?.message ?? "image_failed");
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      const res = await api.toggleReaction(messageId, emoji);
      setMessages((prev) =>
        prev.map((m) => (m.id === res.messageId ? { ...m, reactions: res.reactions } : m))
      );
    } catch (e: any) {
      setError(e?.message ?? "failed");
    }
  }

  async function pickReaction(messageId: string, emoji: string) {
    await toggleReaction(messageId, emoji);
    setReactionPickerFor(null);
  }

  function scrollToMessage(messageId: string) {
    const el = document.getElementById(`msg_${messageId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div style={{
      flex: 1,
      background: "#36393f",
      color: "#dcddde",
      display: "flex",
      flexDirection: "column",
      height: "100vh"
    }}>
      {/* チャンネルヘッダー */}
      <div style={{
        padding: "16px",
        borderBottom: "1px solid #202225",
        fontSize: 16,
        fontWeight: "bold"
      }}>
        {selectedChannelName ? `# ${selectedChannelName}` : "チャンネル未選択"}
      </div>

      {/* メッセージリスト */}
      <div
        ref={listRef}
        className="messageList"
        style={{
          flex: 1,
          padding: "16px",
          overflowY: "auto",
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
          {hasMore && (
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={() => void loadMore()}
                disabled={!selectedChannelId || loadingMore || loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: loadingMore ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                  opacity: loadingMore ? 0.7 : 1,
                }}
              >
                {loadingMore ? "読み込み中…" : "古いメッセージを読み込む"}
              </button>
            </div>
          )}
          {loading && <div style={{ opacity: 0.8, fontSize: 13 }}>読み込み中…</div>}
          {error && <div style={{ color: "#ff7a7a", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          {!loading && !error && selectedChannelId && messages.length === 0 && (
            <div style={{ opacity: 0.8, fontSize: 13 }}>まだメッセージがないよ</div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              id={`msg_${msg.id}`}
              style={{
                marginBottom: 16,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "2px 0"
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
                {msg.reply && (
                  <div
                    onClick={() => scrollToMessage(msg.reply!.id)}
                    title="返信先へ移動"
                    style={{
                      fontSize: 12,
                      color: "#b9bbbe",
                      borderLeft: "2px solid #40444b",
                      paddingLeft: 10,
                      marginBottom: 6,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    ↩ <span style={{ color: "#ffffff", fontWeight: 800 }}>{msg.reply.author}</span>{" "}
                    {msg.reply.content.length > 80 ? `${msg.reply.content.slice(0, 80)}…` : msg.reply.content}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: "bold",
                    color: "#ffffff",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8
                  }}
                >
                  {onAuthorClick ? (
                    <button
                      type="button"
                      onClick={() => onAuthorClick({ userId: msg.author_id, displayName: msg.author })}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#ffffff",
                        fontWeight: "bold",
                        padding: 0,
                        cursor: "pointer",
                      }}
                      title={msg.author_id}
                    >
                      {msg.author}
                    </button>
                  ) : (
                    <span>{msg.author}</span>
                  )}

                  {msg.author_is_banned && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "rgba(237,66,69,0.16)",
                        border: "1px solid rgba(237,66,69,0.55)",
                        color: "#ff7a7a",
                        lineHeight: 1.2,
                      }}
                      title="このユーザーはBANされています"
                    >
                      BAN
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: "#72767d", fontWeight: "normal" }}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.4, wordWrap: "break-word" as any }}>
                  {editFor?.id === msg.id ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <textarea
                        value={editFor.text}
                        onChange={(e) => setEditFor((p) => (p ? { ...p, text: e.target.value } : p))}
                        disabled={editing}
                        style={{
                          width: "100%",
                          minHeight: 70,
                          resize: "vertical",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #40444b",
                          background: "#202225",
                          color: "#dcddde",
                          fontSize: 14,
                          lineHeight: 1.4,
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={closeEdit}
                          disabled={editing}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #40444b",
                            background: "transparent",
                            color: "#dcddde",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 800,
                            width: "100%",
                          }}
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={() => void submitEdit()}
                          disabled={editing || !editFor.text.trim()}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "none",
                            background: "#7289da",
                            color: "#ffffff",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 900,
                            width: "100%",
                            opacity: editing || !editFor.text.trim() ? 0.7 : 1,
                          }}
                        >
                          {editing ? "保存中…" : "保存"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {!!msg.edited_at && editFor?.id !== msg.id && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#8e9297" }}>編集済</div>
                )}

                {msg.attachments && msg.attachments.length > 0 && (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {msg.attachments.map((a) => (
                      <AttachmentImage key={a.id} attachmentId={a.id} onOpen={(src) => setImageModalSrc(src)} />
                    ))}
                  </div>
                )}

                {msg.reactions && msg.reactions.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {msg.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        onClick={() => toggleReaction(msg.id, r.emoji)}
                        style={{
                          border: "1px solid #40444b",
                          background: r.byMe ? "#40444b" : "transparent",
                          color: "#dcddde",
                          borderRadius: 999,
                          padding: "4px 8px",
                          fontSize: 12,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                        title="リアクション"
                      >
                        <span>{r.emoji}</span>
                        <span style={{ opacity: 0.9 }}>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    onClick={() => setReplyTo({ id: msg.id, author: msg.author, content: msg.content })}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#8e9297",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 0,
                    }}
                    title="返信"
                  >
                    返信
                  </button>

                  <button
                    onClick={() => setReactionPickerFor((prev) => (prev === msg.id ? null : msg.id))}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#8e9297",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 0,
                    }}
                    title="リアクションを追加"
                  >
                    リアクション
                  </button>

                  {(currentUserId && (msg.author_id === currentUserId || canModerate) && editFor?.id !== msg.id) && (
                    <button
                      onClick={() => openEdit(msg)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#b9bbbe",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 0,
                        fontWeight: 800,
                      }}
                      title="編集"
                    >
                      編集
                    </button>
                  )}

                  {(currentUserId && (msg.author_id === currentUserId || canModerate)) && (
                    <button
                      onClick={() => openDeleteModal({ id: msg.id, author: msg.author, content: msg.content })}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#ff7a7a",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 0,
                        fontWeight: 800,
                      }}
                      title="削除"
                    >
                      削除
                    </button>
                  )}
                </div>

                {reactionPickerFor === msg.id && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      padding: "10px 10px",
                      borderRadius: 10,
                      border: "1px solid #40444b",
                      background: "#2f3136",
                      maxWidth: 360,
                    }}
                  >
                    {reactionEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => pickReaction(msg.id, emoji)}
                        style={{
                          width: 36,
                          height: 32,
                          borderRadius: 8,
                          border: "1px solid #40444b",
                          background: "transparent",
                          color: "#dcddde",
                          cursor: "pointer",
                          fontSize: 16,
                          display: "grid",
                          placeItems: "center",
                        }}
                        title={emoji}
                        aria-label={`リアクション ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* メッセージ入力 */}
      <div style={{
        padding: "16px",
        borderTop: "1px solid #202225",
        paddingBottom: "24px" /* 下に余白を追加 */
      }}>
        {replyTo && (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #40444b",
              background: "#2f3136",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0, fontSize: 12, color: "#b9bbbe" }}>
              返信先: <span style={{ color: "#ffffff", fontWeight: 800 }}>{replyTo.author}</span>{" "}
              <span style={{ opacity: 0.9 }}>
                {replyTo.content.length > 60 ? `${replyTo.content.slice(0, 60)}…` : replyTo.content}
              </span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              style={{
                border: "none",
                background: "transparent",
                color: "#8e9297",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
              }}
              title="返信を解除"
              aria-label="返信を解除"
            >
              ×
            </button>
          </div>
        )}

        {pendingImage && (
          <div
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #40444b",
              background: "#2f3136",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <img
                src={pendingImage.dataUrl}
                alt="pasted"
                style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #202225" }}
              />
              <div style={{ fontSize: 12, color: "#b9bbbe", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                画像を添付（貼り付け）
              </div>
            </div>
            <button
              onClick={() => setPendingImage(null)}
              style={{
                border: "none",
                background: "transparent",
                color: "#8e9297",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
              }}
              title="添付を外す"
              aria-label="添付を外す"
            >
              ×
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedChannelId || sending}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #40444b",
              background: "#2f3136",
              color: "#dcddde",
              fontSize: 12,
              cursor: !selectedChannelId || sending ? "not-allowed" : "pointer",
              opacity: !selectedChannelId || sending ? 0.6 : 1,
              flexShrink: 0,
            }}
            title="画像を添付"
          >
            画像を添付
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              await handlePickImage(file);
            }}
          />

          <div style={{ position: "relative", width: "100%" }}>
            {mentionOpen && mentionList.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: "calc(100% + 8px)",
                  background: "#2f3136",
                  border: "1px solid #202225",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
                  maxHeight: 240,
                  overflowY: "auto",
                  zIndex: 5,
                }}
              >
                {mentionList.map((m, idx) => {
                  const active = idx === mentionIndex;
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMention(m.userId);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "none",
                        background: active ? "#40444b" : "transparent",
                        color: "#dcddde",
                        cursor: "pointer",
                        display: "grid",
                        gap: 2,
                      }}
                      title={`@${m.userId}`}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.displayName}
                      </div>
                      <div
                        style={{
                          color: "#8e9297",
                          fontSize: 12,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        @{m.userId}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <input
              ref={textInputRef}
              placeholder={`#${selectedChannelName || "channel"} にメッセージを送信（画像は貼り付け/添付OK）`}
              value={text}
              onChange={(e) => {
                const v = e.target.value;
                setText(v);
                const cursor = e.currentTarget.selectionStart ?? v.length;
                updateMentionFromInput(v, cursor);
              }}
              onClick={(e) => {
                const cursor = e.currentTarget.selectionStart ?? text.length;
                updateMentionFromInput(text, cursor);
              }}
              onKeyUp={(e) => {
                const cursor = e.currentTarget.selectionStart ?? text.length;
                updateMentionFromInput(text, cursor);
              }}
              onBlur={() => {
                setMentionOpen(false);
                mentionRangeRef.current = null;
              }}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (mentionOpen && mentionList.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => Math.min(i + 1, mentionList.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    const picked = mentionList[Math.min(mentionIndex, mentionList.length - 1)];
                    if (picked) applyMention(picked.userId);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionOpen(false);
                    mentionRangeRef.current = null;
                    return;
                  }
                }

                if (e.key === "Enter") send();
              }}
              disabled={!selectedChannelId || sending}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                border: "none",
                background: "#40444b",
                color: "#dcddde",
                fontSize: 14,
                opacity: !selectedChannelId ? 0.6 : 1,
              }}
            />
          </div>

          <button
            onClick={() => send()}
            disabled={!selectedChannelId || sending || (!text.trim() && !pendingImage)}
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "none",
              background: "#7289da",
              color: "#ffffff",
              fontWeight: 900,
              cursor:
                !selectedChannelId || sending || (!text.trim() && !pendingImage)
                  ? "not-allowed"
                  : "pointer",
              opacity:
                !selectedChannelId || sending || (!text.trim() && !pendingImage) ? 0.6 : 1,
              flexShrink: 0,
            }}
            title="送信"
          >
            送信
          </button>
        </div>
      </div>

      {deleteModalFor && (
        <Modal
          title="削除の確認"
          onClose={closeDeleteModal}
          footer={
            <>
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
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
                onClick={() => void confirmDelete()}
                disabled={deleting}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#ed4245",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 900,
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "削除中…" : "削除する"}
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10, color: "#dcddde" }}>
            <div style={{ fontSize: 12, color: "#b9bbbe" }}>
              {deleteModalFor.author} のメッセージを削除しますか？
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #40444b",
                background: "#202225",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 180,
                overflow: "auto",
              }}
            >
              {deleteModalFor.content || "(本文なし)"}
            </div>
          </div>
        </Modal>
      )}

      {imageModalSrc && (
        <Modal title="画像" onClose={() => setImageModalSrc(null)} maxWidth="min(1100px, 95vw)">
          <div style={{ display: "grid", placeItems: "center" }}>
            <img
              src={imageModalSrc}
              alt="full"
              style={{
                maxWidth: "90vw",
                maxHeight: "80vh",
                width: "auto",
                height: "auto",
                borderRadius: 12,
                border: "1px solid #202225",
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

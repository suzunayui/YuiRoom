import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../Modal";
import { COMMON_EMOJIS } from "../emoji";
import { StickerPickerPanel } from "./StickerPickerModal";

type Props = {
  open: boolean;
  title?: string;
  selected?: Set<string>;
  roomId?: string | null;
  currentUserId?: string | null;
  canModerate?: boolean;
  onClose: () => void;
  onPickEmoji: (emoji: string) => void | Promise<void>;
  onPickSticker: (stickerId: string) => void | Promise<void>;
};

function safeReadRecent(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string" && x.trim()).slice(0, 40);
  } catch {
    return [];
  }
}

function safeWriteRecent(storageKey: string, items: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 40)));
  } catch {
    // ignore
  }
}

function safeReadString(key: string, fallback = ""): string {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : String(v);
  } catch {
    return fallback;
  }
}

function safeWriteString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function normalizeEmojiInput(s: string): string {
  return s.replace(/\s+/g, "").slice(0, 32);
}

export function ReactionPickerModal({
  open,
  title = "リアクション",
  selected,
  roomId,
  currentUserId,
  canModerate,
  onClose,
  onPickEmoji,
  onPickSticker,
}: Props) {
  const tabKey = "yuiroom.reactionPicker.tab";
  const emojiRecentKey = "yuiroom.recentEmojis.unified";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [busyEmoji, setBusyEmoji] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const saved = safeReadString(tabKey, "emoji");
    setTab(saved === "sticker" ? "sticker" : "emoji");
    setQ("");
    setBusyEmoji(null);
    setRecents(safeReadRecent(emojiRecentKey));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    safeWriteString(tabKey, tab);
  }, [open, tab]);

  const filteredEmojis = useMemo(() => {
    const query = normalizeEmojiInput(q);
    if (!query) return COMMON_EMOJIS;
    return COMMON_EMOJIS.filter((e) => e.includes(query));
  }, [q]);

  async function pickEmoji(raw: string) {
    const emoji = normalizeEmojiInput(raw);
    if (!emoji) return;
    setBusyEmoji(emoji);
    try {
      await onPickEmoji(emoji);
      setRecents((prev) => {
        const next = [emoji, ...prev.filter((x) => x !== emoji)].slice(0, 40);
        safeWriteRecent(emojiRecentKey, next);
        return next;
      });
    } finally {
      setBusyEmoji(null);
    }
  }

  if (!open) return null;

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <div style={{ color: "#8e9297", fontSize: 12, lineHeight: 1.4, marginRight: "auto" }}>
            絵文字は入力欄に貼り付け→追加OK / スタンプはD&Dでも追加できます
          </div>
          <button
            onClick={onClose}
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
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setTab("emoji")}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #40444b",
              background: tab === "emoji" ? "#40444b" : "transparent",
              color: "#dcddde",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            絵文字
          </button>
          <button
            type="button"
            onClick={() => setTab("sticker")}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #40444b",
              background: tab === "sticker" ? "#40444b" : "transparent",
              color: "#dcddde",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            スタンプ
          </button>
        </div>

        {tab === "emoji" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="検索 / 絵文字を入力（ペースト可）"
                style={{
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 10,
                  border: "1px solid #40444b",
                  background: "#202225",
                  color: "#dcddde",
                  fontSize: 14,
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                  if (e.key === "Enter") void pickEmoji(q);
                }}
              />
              <button
                type="button"
                onClick={() => void pickEmoji(q)}
                disabled={!normalizeEmojiInput(q) || !!busyEmoji}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: !normalizeEmojiInput(q) || !!busyEmoji ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 900,
                  opacity: !normalizeEmojiInput(q) || !!busyEmoji ? 0.7 : 1,
                  minWidth: 84,
                }}
                title="入力した絵文字を追加"
              >
                追加
              </button>
            </div>

            {recents.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#8e9297", fontWeight: 900 }}>最近</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {recents.slice(0, 24).map((emoji) => (
                    <button
                      key={`r:${emoji}`}
                      type="button"
                      onClick={() => void pickEmoji(emoji)}
                      disabled={busyEmoji === emoji}
                      style={{
                        width: 36,
                        height: 32,
                        borderRadius: 8,
                        border: selected?.has(emoji) ? "1px solid rgba(114,137,218,0.9)" : "1px solid #40444b",
                        background: selected?.has(emoji) ? "rgba(114,137,218,0.18)" : "transparent",
                        color: "#dcddde",
                        cursor: busyEmoji === emoji ? "not-allowed" : "pointer",
                        fontSize: 16,
                        display: "grid",
                        placeItems: "center",
                        opacity: busyEmoji === emoji ? 0.7 : 1,
                      }}
                      title={emoji}
                      aria-label={`リアクション ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#8e9297", fontWeight: 900 }}>一覧</div>
              <div
                style={{
                  border: "1px solid #40444b",
                  background: "#2f3136",
                  borderRadius: 12,
                  padding: 10,
                  maxHeight: 320,
                  overflow: "auto",
                }}
              >
                {filteredEmojis.length === 0 ? (
                  <div style={{ color: "#8e9297", fontSize: 12 }}>候補なし（入力欄に絵文字を貼って「追加」できます）</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 36px)", gap: 8, justifyContent: "start" }}>
                    {filteredEmojis.map((emoji) => (
                      <button
                        key={`c:${emoji}`}
                        type="button"
                        onClick={() => void pickEmoji(emoji)}
                        disabled={busyEmoji === emoji}
                        style={{
                          width: 36,
                          height: 32,
                          borderRadius: 8,
                          border: selected?.has(emoji) ? "1px solid rgba(114,137,218,0.9)" : "1px solid #40444b",
                          background: selected?.has(emoji) ? "rgba(114,137,218,0.18)" : "transparent",
                          color: "#dcddde",
                          cursor: busyEmoji === emoji ? "not-allowed" : "pointer",
                          fontSize: 16,
                          display: "grid",
                          placeItems: "center",
                          opacity: busyEmoji === emoji ? 0.7 : 1,
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
          </div>
        ) : (
          <StickerPickerPanel
            roomId={roomId}
            currentUserId={currentUserId}
            canModerate={canModerate}
            selected={selected}
            onPick={(stickerId) => onPickSticker(stickerId)}
          />
        )}
      </div>
    </Modal>
  );
}

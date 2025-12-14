import type { RefObject } from "react";
import { api } from "../api";
import type { DmMessage, DmSearchMessage } from "../api";
import { Modal } from "../Modal";
import { renderTextWithLinks, renderTextWithLinksAndHighlights } from "../linkify";
import { EmojiPickerModal } from "../modals/EmojiPickerModal";

type Props = {
  selectedDmPeerName: string | null;
  selectedDmThreadId: string | null;

  enterKeySends: boolean;

  dmListRef: RefObject<HTMLDivElement | null>;
  dmLoading: boolean;
  dmError: string | null;
  dmMessages: DmMessage[];
  dmHighlightId: string | null;

  dmReactionPickerFor: string | null;
  setDmReactionPickerFor: (updater: (prev: string | null) => string | null) => void;
  toggleDmReaction: (messageId: string, emoji: string) => void | Promise<void>;

  dmText: string;
  setDmText: (v: string) => void;
  dmSending: boolean;
  sendDm: () => void | Promise<void>;

  openDmSearch: () => void;

  dmSearchOpen: boolean;
  closeDmSearch: () => void;
  dmSearchBusy: boolean;
  dmSearchQ: string;
  setDmSearchQ: (v: string) => void;
  dmSearchError: string | null;
  dmSearchItems: DmSearchMessage[];
  dmSearchHasMore: boolean;
  runDmSearch: (args: { append: boolean }) => void | Promise<void>;
  dmSearchInputRef: RefObject<HTMLInputElement | null>;
  onPickSearchResult: (messageId: string) => void;
};

export function DmPanel({
  selectedDmPeerName,
  selectedDmThreadId,
  enterKeySends,
  dmListRef,
  dmLoading,
  dmError,
  dmMessages,
  dmHighlightId,
  dmReactionPickerFor,
  setDmReactionPickerFor,
  toggleDmReaction,
  dmText,
  setDmText,
  dmSending,
  sendDm,
  openDmSearch,
  dmSearchOpen,
  closeDmSearch,
  dmSearchBusy,
  dmSearchQ,
  setDmSearchQ,
  dmSearchError,
  dmSearchItems,
  dmSearchHasMore,
  runDmSearch,
  dmSearchInputRef,
  onPickSearchResult,
}: Props) {
  return (
    <div
      style={{
        flex: 1,
        background: "#36393f",
        color: "#dcddde",
        display: "flex",
        flexDirection: "column",
        height: "var(--app-height)",
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

      {selectedDmThreadId && (
        <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <div style={{ marginRight: "auto", color: "#8e9297", fontSize: 12, alignSelf: "center" }}>Ctrl+K</div>
          <button
            onClick={openDmSearch}
            style={{
              border: "1px solid #40444b",
              background: "transparent",
              color: "#dcddde",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 900,
            }}
            title="検索 (Ctrl+K)"
          >
            検索
          </button>
        </div>
      )}

      <div ref={dmListRef} className="darkScroll" style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
        {dmLoading && <div style={{ opacity: 0.8, fontSize: 13 }}>読み込み中…</div>}
        {dmError && <div style={{ color: "#ff7a7a", fontSize: 12, marginBottom: 10 }}>{dmError}</div>}
        {!dmLoading && !dmError && selectedDmThreadId && dmMessages.length === 0 && (
          <div style={{ opacity: 0.8, fontSize: 13 }}>まだメッセージがないよ</div>
        )}

        {dmMessages.map((msg) => (
          <div
            key={msg.id}
            id={`dm_msg_${msg.id}`}
            style={{
              marginBottom: 16,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "6px 8px",
              borderRadius: 12,
              background: dmHighlightId === msg.id ? "rgba(114,137,218,0.20)" : "transparent",
              transition: "background 180ms ease",
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
                <img src={api.userAvatarUrl(msg.author_id)} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
              <div style={{ fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordWrap: "break-word" as any }}>
                {renderTextWithLinks(msg.content)}
              </div>

              {msg.reactions && msg.reactions.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {msg.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      onClick={() => void toggleDmReaction(msg.id, r.emoji)}
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
                  onClick={() => setDmReactionPickerFor((prev) => (prev === msg.id ? null : msg.id))}
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
              </div>

            </div>
          </div>
        ))}
      </div>

      <EmojiPickerModal
        open={!!dmReactionPickerFor}
        title="リアクション"
        storageKey={`yuiroom.recentEmojis.dm:${selectedDmThreadId || "none"}`}
        selected={
          dmReactionPickerFor
            ? new Set(
              (dmMessages.find((m) => m.id === dmReactionPickerFor)?.reactions ?? []).filter((r) => r.byMe).map((r) => r.emoji)
            )
            : undefined
        }
        onClose={() => setDmReactionPickerFor(() => null)}
        onPick={(emoji) => {
          const id = dmReactionPickerFor;
          if (!id) return;
          void toggleDmReaction(id, emoji);
        }}
      />

      <div
        style={{
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom) + var(--app-occluded-bottom))",
          borderTop: "1px solid #202225",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <textarea
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
              minHeight: 44,
              maxHeight: 160,
              resize: "none",
              lineHeight: 1.4,
              overflowY: "auto",
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || (e as any).isComposing) return;
              const shouldSend = enterKeySends ? !e.shiftKey : e.shiftKey;
              if (!shouldSend) return;
              e.preventDefault();
              void sendDm();
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

      {dmSearchOpen && (
        <Modal
          title="DM検索"
          onClose={closeDmSearch}
          maxWidth="min(720px, 95vw)"
          footer={
            <>
              <button
                onClick={closeDmSearch}
                disabled={dmSearchBusy}
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
                onClick={() => void runDmSearch({ append: false })}
                disabled={dmSearchBusy || !dmSearchQ.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 900,
                  opacity: dmSearchBusy || !dmSearchQ.trim() ? 0.7 : 1,
                }}
              >
                検索
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <input
              ref={dmSearchInputRef}
              value={dmSearchQ}
              onChange={(e) => setDmSearchQ(e.target.value)}
              placeholder="Search (Ctrl+K)"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void runDmSearch({ append: false });
              }}
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 10,
                border: "1px solid #40444b",
                background: "#202225",
                color: "#dcddde",
                fontSize: 14,
                outline: "none",
              }}
            />

            {dmSearchError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{dmSearchError}</div>}

            {dmSearchItems.length === 0 ? (
              <div style={{ color: "#8e9297", fontSize: 12 }}>見つからない</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {dmSearchItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onPickSearchResult(it.id)}
                    style={{
                      textAlign: "left",
                      border: "1px solid #40444b",
                      background: "#202225",
                      color: "#dcddde",
                      borderRadius: 12,
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "grid",
                      gap: 6,
                    }}
                    title={it.author}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.author}</div>
                      <div style={{ color: "#8e9297", fontSize: 12, flexShrink: 0 }}>{new Date(it.created_at).toLocaleString()}</div>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere", opacity: 0.95 }}>
                      {renderTextWithLinksAndHighlights(it.content.length > 180 ? `${it.content.slice(0, 180)}…` : it.content, dmSearchQ)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {dmSearchHasMore && (
              <button
                type="button"
                onClick={() => void runDmSearch({ append: true })}
                disabled={dmSearchBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                  opacity: dmSearchBusy ? 0.7 : 1,
                }}
              >
                {dmSearchBusy ? "読み込み中…" : "さらに読み込む"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

import type { RoomTree } from "./api";

type Props = {
  tree: RoomTree;
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
  unreadByChannelId?: Record<string, boolean>;
  notifications?: Array<{ id: string; kind: "dm" | "mention"; title: string; body: string; at: number }>;
  onOpenNotification?: (id: string) => void;
  onDismissNotification?: (id: string) => void;
  onClearNotifications?: () => void;
  onRequestCreateCategory?: () => void;
  onOpenRoomSettings?: () => void;
  onRequestCreateChannel?: (categoryId: string | null) => void;
  onRequestDeleteCategory?: (categoryId: string, categoryName: string) => void;
  onRequestDeleteChannel?: (channelId: string, channelName: string) => void;
  currentUserName: string;
  currentUserAvatarUrl?: string | null;
  onOpenSettings?: () => void;
};

export function ChannelList({
  tree,
  selectedChannelId,
  onSelectChannel,
  unreadByChannelId,
  notifications,
  onOpenNotification,
  onDismissNotification,
  onClearNotifications,
  onRequestCreateCategory,
  onOpenRoomSettings,
  onRequestCreateChannel,
  onRequestDeleteCategory,
  onRequestDeleteChannel,
  currentUserName,
  currentUserAvatarUrl,
  onOpenSettings,
}: Props) {
  return (
    <div style={{
      width: 240,
      minWidth: 240,
      flexShrink: 0,
      background: "#2f3136",
      color: "#dcddde",
      padding: "16px 0",
      display: "flex",
      flexDirection: "column",
      height: "100dvh",
      minHeight: "100vh",
      overflow: "hidden"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, padding: "0 16px" }}>
        <div style={{ fontSize: 16, fontWeight: "bold" }}>{tree.room.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onOpenRoomSettings && (
            <button
              onClick={onOpenRoomSettings}
              style={{
                border: "none",
                background: "transparent",
                color: "#8e9297",
                cursor: "pointer",
                fontSize: 18,
                padding: 0,
                lineHeight: 1,
              }}
              title="Room設定"
              aria-label="Room設定"
            >
              ⚙
            </button>
          )}
          {onRequestCreateCategory && (
            <button
              onClick={onRequestCreateCategory}
              style={{
                border: "none",
                background: "transparent",
                color: "#8e9297",
                cursor: "pointer",
                fontSize: 18,
                padding: 0,
                lineHeight: 1
              }}
              title="カテゴリ作成"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tree.categories.map((cat) => (
          <div key={cat.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 16px", marginBottom: 8 }}>
              <div style={{
                fontSize: 12,
                fontWeight: "bold",
                color: "#8e9297",
                textTransform: "uppercase",
              }}>
                {cat.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {onRequestCreateChannel && (
                  <button
                    onClick={() => onRequestCreateChannel(cat.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#8e9297",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: 0,
                      lineHeight: 1
                    }}
                    title="チャンネル作成"
                  >
                    +
                  </button>
                )}
                {onRequestDeleteCategory && (
                  <button
                    onClick={() => onRequestDeleteCategory(cat.id, cat.name)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#8e9297",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: 0,
                      lineHeight: 1
                    }}
                    title="カテゴリ削除"
                    aria-label="カテゴリ削除"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div>
              {cat.channels.map((ch) => {
                const active = ch.id === selectedChannelId;
                return (
                  <button
                    key={ch.id}
                    onClick={() => onSelectChannel(ch.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 8px",
                      background: active ? "#40444b" : "transparent",
                      color: active ? "#ffffff" : "#dcddde",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "background 0.1s ease"
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "#35373c";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span style={{ color: "#8e9297" }}>#</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
                    {!!unreadByChannelId?.[ch.id] && !active && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: "#f04747",
                          flexShrink: 0,
                          boxShadow: "0 0 0 2px rgba(0,0,0,0.25)",
                        }}
                        title="未読"
                      />
                    )}
                    {onRequestDeleteChannel && (
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRequestDeleteChannel(ch.id, ch.name);
                        }}
                        role="button"
                        aria-label="チャンネル削除"
                        title="チャンネル削除"
                        style={{
                          color: "#8e9297",
                          padding: "0 6px",
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </span>
                    )}
                  </button>
                );
              })}

            </div>
          </div>
        ))}

        {tree.uncategorized.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 16px", marginBottom: 8 }}>
              <div style={{
                fontSize: 12,
                fontWeight: "bold",
                color: "#8e9297",
                textTransform: "uppercase",
              }}>
                Uncategorized
              </div>
              {onRequestCreateChannel && (
                <button
                  onClick={() => onRequestCreateChannel(null)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#8e9297",
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 0,
                    lineHeight: 1
                  }}
                  title="チャンネル作成"
                >
                  +
                </button>
              )}
            </div>
            <div>
              {tree.uncategorized.map((ch) => {
                const active = ch.id === selectedChannelId;
                return (
                  <button
                    key={ch.id}
                    onClick={() => onSelectChannel(ch.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 8px",
                      background: active ? "#40444b" : "transparent",
                      color: active ? "#ffffff" : "#dcddde",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "background 0.1s ease"
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "#35373c";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span style={{ color: "#8e9297" }}>#</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
                    {!!unreadByChannelId?.[ch.id] && !active && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: "#f04747",
                          flexShrink: 0,
                          boxShadow: "0 0 0 2px rgba(0,0,0,0.25)",
                        }}
                        title="未読"
                      />
                    )}
                    {onRequestDeleteChannel && (
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRequestDeleteChannel(ch.id, ch.name);
                        }}
                        role="button"
                        aria-label="チャンネル削除"
                        title="チャンネル削除"
                        style={{
                          color: "#8e9297",
                          padding: "0 6px",
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </span>
                    )}
                  </button>
                );
              })}

            </div>
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid #202225",
          background: "#2b2d31",
          padding: "10px 12px",
          display: "grid",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ color: "#b9bbbe", fontSize: 12, fontWeight: 900 }}>通知</div>
          {onClearNotifications && (
            <button
              type="button"
              onClick={onClearNotifications}
              disabled={!notifications || notifications.length === 0}
              style={{
                border: "none",
                background: "transparent",
                color: !notifications || notifications.length === 0 ? "#5f636a" : "#8e9297",
                cursor: !notifications || notifications.length === 0 ? "default" : "pointer",
                fontSize: 12,
                fontWeight: 900,
                padding: 0,
              }}
              title="通知をクリア"
            >
              クリア
            </button>
          )}
        </div>

        {!notifications || notifications.length === 0 ? (
          <div style={{ color: "#8e9297", fontSize: 12 }}>なし</div>
        ) : (
          <div style={{ display: "grid", gap: 6, maxHeight: 160, overflowY: "auto" }}>
            {notifications.slice(0, 6).map((n) => {
              const t = new Date(n.at);
              const time = Number.isNaN(t.getTime())
                ? ""
                : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const badgeColor = n.kind === "dm" ? "#3ba55c" : "#faa61a";
              const badgeText = n.kind === "dm" ? "DM" : "@";
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onOpenNotification?.(n.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid #202225",
                    background: "#1f2124",
                    color: "#dcddde",
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "pointer",
                    display: "grid",
                    gap: 4,
                  }}
                  title={n.title}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 18,
                        height: 18,
                        padding: "0 6px",
                        borderRadius: 999,
                        background: badgeColor,
                        color: "#111",
                        fontSize: 11,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      {badgeText}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.title}
                    </span>
                    <span style={{ marginLeft: "auto", color: "#8e9297", fontSize: 11, flexShrink: 0 }}>
                      {time}
                    </span>
                    {onDismissNotification && (
                      <span
                        role="button"
                        aria-label="通知を消す"
                        title="通知を消す"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDismissNotification(n.id);
                        }}
                        style={{ color: "#8e9297", padding: "0 2px", cursor: "pointer", lineHeight: 1 }}
                      >
                        ×
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#b9bbbe", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.body}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{
        borderTop: "1px solid #202225",
        background: "#292b2f",
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#7289da",
              display: "grid",
              placeItems: "center",
              color: "#ffffff",
              fontWeight: 900,
              flexShrink: 0,
              overflow: "hidden",
            }}
            title={currentUserName}
          >
            {currentUserAvatarUrl ? (
              <img
                src={currentUserAvatarUrl}
                alt="avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              currentUserName?.[0]?.toUpperCase?.() ?? "?"
            )}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "#ffffff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={currentUserName}
          >
            {currentUserName}
          </div>
        </div>

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            style={{
              border: "none",
              background: "transparent",
              color: "#b9bbbe",
              cursor: "pointer",
              fontSize: 18,
              padding: 0,
              lineHeight: 1,
            }}
            title="設定"
            aria-label="設定"
          >
            ⚙
          </button>
        )}
      </div>
    </div>
  );
}

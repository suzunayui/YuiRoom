import type { RoomTree } from "./api";

type Props = {
  tree: RoomTree;
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
  unreadByChannelId?: Record<string, boolean>;
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
      background: "#2f3136",
      color: "#dcddde",
      padding: "16px 0",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
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

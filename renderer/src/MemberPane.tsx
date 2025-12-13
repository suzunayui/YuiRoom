import type { RoomMember } from "./api";
import { api } from "./api";

type Props = {
  members: RoomMember[];
  loading: boolean;
  error: string | null;
  onMemberClick?: (member: { userId: string; displayName: string; hasAvatar: boolean }) => void;
};

function byName(a: RoomMember, b: RoomMember) {
  const an = (a.displayName || a.userId).toLowerCase();
  const bn = (b.displayName || b.userId).toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

export function MemberPane({ members, loading, error, onMemberClick }: Props) {
  const online = members.filter((m) => !!m.online).sort(byName);
  const offline = members.filter((m) => !m.online).sort(byName);

  return (
    <div
      style={{
        width: 240,
        background: "#2f3136",
        color: "#dcddde",
        borderLeft: "1px solid #202225",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "14px 12px", borderBottom: "1px solid #202225", fontWeight: 900 }}>
        メンバー
      </div>

      <div
        className="darkScroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          justifyContent: "flex-start",
        }}
      >
        {loading && <div style={{ fontSize: 12, opacity: 0.8 }}>読み込み中…</div>}
        {error && <div style={{ fontSize: 12, color: "#ff7a7a" }}>{error}</div>}

        {!loading && !error && (
          <>
            <div style={{ fontSize: 12, color: "#b9bbbe", fontWeight: 900 }}>ONLINE — {online.length}</div>
            {online.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>なし</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {online.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => onMemberClick?.({ userId: m.userId, displayName: m.displayName, hasAvatar: m.hasAvatar })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      cursor: onMemberClick ? "pointer" : "default",
                      padding: 0,
                      textAlign: "left",
                    }}
                    title={m.displayName}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#3ba55c",
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
                        {m.isOwner && <span style={{ marginLeft: 6, fontSize: 11, color: "#b9bbbe" }}>(owner)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#8e9297", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {m.userId}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: 12, color: "#b9bbbe", fontWeight: 900 }}>OFFLINE — {offline.length}</div>
            {offline.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>なし</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {offline.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => onMemberClick?.({ userId: m.userId, displayName: m.displayName, hasAvatar: m.hasAvatar })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      opacity: 0.8,
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      cursor: onMemberClick ? "pointer" : "default",
                      padding: 0,
                      textAlign: "left",
                    }}
                    title={m.displayName}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#40444b",
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
                        {m.isOwner && <span style={{ marginLeft: 6, fontSize: 11, color: "#b9bbbe" }}>(owner)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#8e9297", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {m.userId}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

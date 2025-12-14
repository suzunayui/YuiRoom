import type { FriendRequests, FriendUser } from "../api";
import { api } from "../api";

type Props = {
  openAddFriend: () => void;
  openHomeAudit: () => Promise<void> | void;
  homeAuditBusy: boolean;
  homeError: string | null;
  addFriendOpen: boolean;

  homeLoading: boolean;
  friends: FriendUser[];
  openDmWith: (f: FriendUser) => Promise<void> | void;
  deleteFriend: (userId: string, displayName: string) => Promise<void> | void;

  requests: FriendRequests;
  acceptRequest: (requestId: string) => Promise<void> | void;
  rejectRequest: (requestId: string) => Promise<void> | void;
};

export function HomeSidebar(props: Props) {
  const {
    openAddFriend,
    openHomeAudit,
    homeAuditBusy,
    homeError,
    addFriendOpen,
    homeLoading,
    friends,
    openDmWith,
    deleteFriend,
    requests,
    acceptRequest,
    rejectRequest,
  } = props;

  return (
    <div
      style={{
        width: 260,
        background: "#2f3136",
        borderRight: "1px solid #202225",
        height: "var(--app-height)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: 14, borderBottom: "1px solid #202225" }}>
        <div style={{ color: "#ffffff", fontWeight: 900, fontSize: 14, marginBottom: 10 }}>ホーム</div>
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

      <div className="darkScroll" style={{ flex: 1, overflowY: "auto", padding: 10, display: "grid", gap: 14 }}>
        <div>
          <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900, marginBottom: 8 }}>フレンド</div>
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
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.displayName}</div>
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
          <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900, marginBottom: 8 }}>申請（受信）</div>
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
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.displayName}</div>
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
          <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900, marginBottom: 8 }}>申請（送信）</div>
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
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.displayName}</div>
                  <div style={{ marginLeft: "auto", color: "#8e9297", fontSize: 12, fontWeight: 900 }}>承認待ち</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


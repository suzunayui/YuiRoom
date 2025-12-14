import { api } from "../api";
import { ChannelList } from "../ChannelList";
import { Drawer } from "../Drawer";
import { MemberPane } from "../MemberPane";

export function MobileDrawers(props: any) {
  const {
    authed,
    isNarrow,
    mobileDrawer,
    setMobileDrawer,

    HOME_ID,
    rooms,
    roomsLoading,
    selectedRoomId,
    setSelectedRoomId,
    openCreateRoom,
    openJoinModal,

    tree,
    treeLoading,
    selectedChannelId,
    unreadByChannelId,
    currentUserId,
    displayName,
    currentUserAvatarUrl,
    openSettings,
    selectChannelAndMarkRead,
    openNotification,
    openCreateCategory,
    openInviteModal,
    openCreateChannel,
    openDeleteCategory,
    openDeleteChannel,

    avatarDataUrl,
    notifications,
    setNotifications,
    openAddFriend,
    openHomeAudit,
    homeAuditBusy,
    homeLoading,
    friends,
    openDmWith,
    openUserActions,
    requests,
    acceptRequest,
    rejectRequest,

    memberPane,
    memberPaneLoading,
    memberPaneError,
  } = props;

  if (!authed || !isNarrow) return null;

  return (
    <>
      <div style={{ position: "fixed", top: 10, left: 10, zIndex: 1150, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setMobileDrawer("rooms")}
          style={{
            border: "1px solid #40444b",
            background: "#202225",
            color: "#dcddde",
            borderRadius: 999,
            padding: "10px 12px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 900,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}
          aria-label="ルーム"
          title="ルーム"
        >
          ルーム
        </button>
        <button
          type="button"
          onClick={() => setMobileDrawer("nav")}
          disabled={!selectedRoomId}
          style={{
            border: "1px solid #40444b",
            background: "#202225",
            color: "#dcddde",
            borderRadius: 999,
            padding: "10px 12px",
            cursor: !selectedRoomId ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 900,
            opacity: !selectedRoomId ? 0.6 : 1,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}
          aria-label={selectedRoomId === HOME_ID ? "ホーム" : "チャンネル"}
          title={selectedRoomId === HOME_ID ? "ホーム" : "チャンネル"}
        >
          {selectedRoomId === HOME_ID ? "ホーム" : "チャンネル"}
        </button>
        {selectedRoomId !== HOME_ID && (
          <button
            type="button"
            onClick={() => setMobileDrawer("members")}
            style={{
              border: "1px solid #40444b",
              background: "#202225",
              color: "#dcddde",
              borderRadius: 999,
              padding: "10px 12px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 900,
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            }}
            aria-label="メンバー"
            title="メンバー"
          >
            メンバー
          </button>
        )}
      </div>

      {mobileDrawer === "rooms" && (
        <Drawer title="ルーム" onClose={() => setMobileDrawer(null)} side="left" width={340}>
          <div style={{ padding: 12, display: "grid", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                setMobileDrawer(null);
                setSelectedRoomId(HOME_ID);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid #40444b",
                background: selectedRoomId === HOME_ID ? "#40444b" : "transparent",
                color: "#dcddde",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ホーム（フレンド/DM）
            </button>

            {(rooms ?? []).map((r: any) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setMobileDrawer(null);
                  setSelectedRoomId(r.id);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid #40444b",
                  background: selectedRoomId === r.id ? "#40444b" : "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
                title={r.name}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                {selectedRoomId === r.id && <span style={{ color: "#8e9297", fontSize: 12 }}>表示中</span>}
              </button>
            ))}

            <div style={{ height: 1, background: "#202225", margin: "6px 0" }} />

            <button
              type="button"
              onClick={() => {
                setMobileDrawer(null);
                openCreateRoom();
              }}
              disabled={roomsLoading}
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 12,
                border: "none",
                background: "#7289da",
                color: "#ffffff",
                cursor: roomsLoading ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: roomsLoading ? 0.7 : 1,
              }}
            >
              ルーム作成
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileDrawer(null);
                openJoinModal();
              }}
              disabled={roomsLoading}
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid #40444b",
                background: "transparent",
                color: "#dcddde",
                cursor: roomsLoading ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: roomsLoading ? 0.7 : 1,
              }}
            >
              招待URLで参加
            </button>
          </div>
        </Drawer>
      )}

      {mobileDrawer === "nav" && (
        <Drawer
          title={selectedRoomId === HOME_ID ? "ホーム" : tree?.room?.name ? `# ${tree.room.name}` : "チャンネル"}
          onClose={() => setMobileDrawer(null)}
          side="left"
          width={360}
        >
          {selectedRoomId === HOME_ID ? (
            <div style={{ padding: 12, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawer(null);
                    if (currentUserId) openSettings();
                  }}
                  style={{
                    border: "1px solid #40444b",
                    background: "transparent",
                    color: "#dcddde",
                    borderRadius: 12,
                    padding: "10px 12px",
                    cursor: currentUserId ? "pointer" : "not-allowed",
                    fontWeight: 900,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: currentUserId ? 1 : 0.6,
                  }}
                  disabled={!currentUserId}
                  title="設定"
                  aria-label="設定"
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
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
                    {avatarDataUrl ? (
                      <img src={avatarDataUrl} alt="me" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      (displayName || currentUserId || "U")[0]?.toUpperCase?.() ?? "U"
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName || currentUserId || "user"}
                    </div>
                    <div style={{ color: "#8e9297", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {currentUserId ? `@${currentUserId}` : ""}
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", color: "#8e9297", fontSize: 12, fontWeight: 900 }}>設定</div>
                </button>
              </div>

              {notifications.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900 }}>通知</div>
                    <button
                      type="button"
                      onClick={() => setNotifications([])}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#8e9297",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 900,
                        padding: 0,
                      }}
                    >
                      クリア
                    </button>
                  </div>
                  {notifications.slice(0, 6).map((n: any) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setMobileDrawer(null);
                        openNotification(n.id);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #40444b",
                        background: "transparent",
                        color: "#dcddde",
                        cursor: "pointer",
                        display: "grid",
                        gap: 4,
                      }}
                      title={n.title}
                    >
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.title}
                      </div>
                      <div style={{ color: "#b9bbbe", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.body}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setMobileDrawer(null);
                  openAddFriend();
                }}
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "none",
                  background: "#7289da",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                フレンドを追加
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileDrawer(null);
                  void openHomeAudit();
                }}
                disabled={homeAuditBusy}
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: homeAuditBusy ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: homeAuditBusy ? 0.7 : 1,
                }}
              >
                監査ログ
              </button>

              <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900 }}>フレンド</div>
              {homeLoading ? (
                <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>
              ) : friends.length === 0 ? (
                <div style={{ color: "#8e9297", fontSize: 12 }}>まだフレンドがいないよ</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {friends.map((f: any) => (
                    <div
                      key={f.userId}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        border: "1px solid #40444b",
                        borderRadius: 12,
                        padding: "10px 10px",
                        background: "transparent",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMobileDrawer(null);
                          void openDmWith(f);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#dcddde",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flex: 1,
                          minWidth: 0,
                          padding: 0,
                          textAlign: "left",
                        }}
                        title="DMを開く"
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
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
                            <img src={api.userAvatarUrl(f.userId)} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            f.displayName?.[0]?.toUpperCase?.() ?? "?"
                          )}
                        </div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.displayName}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileDrawer(null);
                          openUserActions(f.userId, { displayName: f.displayName, hasAvatar: f.hasAvatar });
                        }}
                        style={{
                          border: "1px solid #40444b",
                          background: "transparent",
                          color: "#8e9297",
                          cursor: "pointer",
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 12,
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                        title="ユーザー"
                        aria-label="ユーザー"
                      >
                        …
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ color: "#8e9297", fontSize: 12, fontWeight: 900, marginTop: 8 }}>申請</div>
              {requests.incoming.length === 0 && requests.outgoing.length === 0 ? (
                <div style={{ color: "#8e9297", fontSize: 12 }}>申請はないよ</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {requests.incoming.map((r: any) => (
                    <div key={r.id} style={{ border: "1px solid #40444b", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>{r.displayName}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => void acceptRequest(r.id)}
                          style={{
                            flex: 1,
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "none",
                            background: "#3ba55c",
                            color: "#fff",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          承認
                        </button>
                        <button
                          type="button"
                          onClick={() => void rejectRequest(r.id)}
                          style={{
                            flex: 1,
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "none",
                            background: "#ed4245",
                            color: "#fff",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          拒否
                        </button>
                      </div>
                    </div>
                  ))}
                  {requests.outgoing.map((r: any) => (
                    <div key={r.id} style={{ border: "1px solid #40444b", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 4 }}>{r.displayName}</div>
                      <div style={{ color: "#8e9297", fontSize: 12 }}>送信済み</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tree ? (
            <ChannelList
              tree={tree}
              selectedChannelId={selectedChannelId}
              onSelectChannel={(id) => {
                setMobileDrawer(null);
                selectChannelAndMarkRead(id);
              }}
              unreadByChannelId={unreadByChannelId}
              notifications={notifications}
              onClearNotifications={() => setNotifications([])}
              onDismissNotification={(id) => setNotifications((prev: any[]) => prev.filter((n: any) => n.id !== id))}
              onOpenNotification={(id) => {
                setMobileDrawer(null);
                openNotification(id);
              }}
              onRequestCreateCategory={
                treeLoading
                  ? undefined
                  : tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                    ? () => {
                        setMobileDrawer(null);
                        openCreateCategory();
                      }
                    : undefined
              }
              onOpenRoomSettings={
                tree.room.owner_id
                  ? () => {
                      setMobileDrawer(null);
                      openInviteModal();
                    }
                  : undefined
              }
              onRequestCreateChannel={
                treeLoading
                  ? undefined
                  : tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                    ? (categoryId) => {
                        setMobileDrawer(null);
                        openCreateChannel(categoryId);
                      }
                    : undefined
              }
              onRequestDeleteCategory={
                tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                  ? (categoryId, categoryName) => {
                      setMobileDrawer(null);
                      openDeleteCategory(categoryId, categoryName);
                    }
                  : undefined
              }
              onRequestDeleteChannel={
                tree.room.owner_id && currentUserId && tree.room.owner_id === currentUserId
                  ? (channelId, channelName) => {
                      setMobileDrawer(null);
                      openDeleteChannel(channelId, channelName);
                    }
                  : undefined
              }
              currentUserName={displayName || currentUserId || "user"}
              currentUserAvatarUrl={currentUserAvatarUrl}
              onOpenSettings={
                currentUserId
                  ? () => {
                      setMobileDrawer(null);
                      openSettings();
                    }
                  : undefined
              }
            />
          ) : (
            <div style={{ padding: 12, color: "#8e9297", fontSize: 12 }}>読み込み中…</div>
          )}
        </Drawer>
      )}

      {mobileDrawer === "members" && (
        <Drawer title="メンバー" onClose={() => setMobileDrawer(null)} side="right" width={360}>
          <MemberPane
            members={memberPane}
            loading={memberPaneLoading}
            error={memberPaneError}
            onMemberClick={(m) => {
              setMobileDrawer(null);
              openUserActions(m.userId, { displayName: m.displayName, hasAvatar: m.hasAvatar });
            }}
          />
        </Drawer>
      )}
    </>
  );
}


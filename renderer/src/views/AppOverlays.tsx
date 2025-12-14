import { api } from "../api";
import { Modal } from "../Modal";
import { SettingsModal } from "../modals/SettingsModal";
import { BanModal } from "../modals/BanModal";
import { RoomSettingsModal } from "../modals/RoomSettingsModal";
import { ConfirmActionModal } from "../modals/ConfirmActionModal";
import { JoinRoomModal } from "../modals/JoinRoomModal";
import { HomeAuditModal } from "../modals/HomeAuditModal";
import { extractInviteCode } from "../app/appUtils";

export function AppOverlays(props: any) {
  const {
    authed,
    logout,

    createModal,
    closeModal,
    createBusy,
    createName,
    setCreateName,
    submitCreate,
    createError,
    openJoinModal,

    settingsOpen,
    closeSettings,
    saveSettings,
    settingsName,
    setSettingsName,
    settingsAvatar,
    setSettingsAvatar,
    settingsError,
    displayName,
    currentUserId,
    fileToPngAvatarDataUrl,
    enterKeySends,
    onChangeEnterKeySends,

    addFriendOpen,
    closeAddFriend,
    sendFriendRequest,
    friendInput,
    setFriendInput,
    homeError,

    deleteModal,
    closeDeleteModal,
    deleteBusy,
    submitDelete,
    deleteError,

    userAction,
    closeUserActions,
    userActionBusy,
    selectedRoomId,
    HOME_ID,
    tree,
    openBanModal,
    userActionError,
    userActionStatus,
    setSelectedRoomId,
    openDmWith,
    userActionSendFriendRequest,
    userActionAcceptFriendRequest,
    userActionRejectFriendRequest,

    banModal,
    banUserId,
    setBanUserId,
    banReason,
    setBanReason,
    banBusy,
    banError,
    closeBanModal,
    submitBan,

    inviteModal,
    closeInviteModal,
    roomSettingsTab,
    setRoomSettingsTab,
    inviteBusy,
    inviteError,
    auditError,
    members,
    invites,
    auditLogs,
    inviteUrlFromCode,
    setToast,
    leaveRoom,
    createInvite,
    deleteInvite,
    refreshAudit,
    banFromMemberList,
    kickMember,
    deleteRoomFromSettings,

    confirmModal,
    closeConfirmModal,
    confirmLeaveRoom,
    confirmKickMember,
    setConfirmModal,

    joinOpen,
    joinCode,
    setJoinCode,
    joinBusy,
    joinError,
    closeJoinModal,
    submitJoin,

    homeAuditOpen,
    homeAuditBusy,
    homeAuditError,
    homeAuditLogs,
    closeHomeAudit,
    openHomeAudit,
  } = props;

  return (
    <>
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
            cursor: "pointer",
          }}
        >
          ログアウト
        </button>
      )}

      {authed && createModal && (
        <Modal
          title={createModal.kind === "room" ? "Roomを作成" : createModal.kind === "category" ? "カテゴリを作成" : "チャンネルを作成"}
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
            {createError && <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{createError}</div>}
            {createModal.kind === "room" && (
              <button
                type="button"
                onClick={() => {
                  closeModal();
                  openJoinModal();
                }}
                disabled={createBusy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: createBusy ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: createBusy ? 0.7 : 1,
                }}
              >
                招待URLで参加
              </button>
            )}
          </div>
        </Modal>
      )}

      <SettingsModal
        open={authed && settingsOpen}
        onClose={closeSettings}
        onSave={saveSettings}
        settingsName={settingsName}
        setSettingsName={setSettingsName}
        settingsAvatar={settingsAvatar}
        setSettingsAvatar={setSettingsAvatar}
        settingsError={settingsError}
        displayName={displayName}
        currentUserId={currentUserId}
        fileToPngAvatarDataUrl={fileToPngAvatarDataUrl}
        enterKeySends={enterKeySends}
        onChangeEnterKeySends={onChangeEnterKeySends}
      />

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
            <div style={{ color: "#8e9297", fontSize: 12, lineHeight: 1.4 }}>相手に承認されるとフレンドになります。</div>
            {homeError && <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{homeError}</div>}
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
              {deleteModal.kind === "room" && <>Room「{deleteModal.roomName}」を削除する？</>}
              {deleteModal.kind === "category" && <>カテゴリ「{deleteModal.categoryName}」を削除する？（配下のチャンネルも消えるよ）</>}
              {deleteModal.kind === "channel" && <>チャンネル「{deleteModal.channelName}」を削除する？</>}
            </div>
            {deleteError && <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{deleteError}</div>}
          </div>
        </Modal>
      )}

      {authed && userAction && (
        <Modal
          title="ユーザー"
          onClose={closeUserActions}
          footer={
            <>
              <button
                onClick={closeUserActions}
                disabled={userActionBusy}
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
              {selectedRoomId &&
                selectedRoomId !== HOME_ID &&
                tree?.room.owner_id &&
                currentUserId &&
                tree.room.owner_id === currentUserId &&
                userAction.userId !== currentUserId && (
                  <button
                    onClick={() => {
                      closeUserActions();
                      openBanModal(userAction.userId);
                    }}
                    disabled={userActionBusy}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#ed4245",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 900,
                      opacity: userActionBusy ? 0.7 : 1,
                    }}
                  >
                    BAN…
                  </button>
                )}
            </>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                title={userAction.displayName}
              >
                {userAction.hasAvatar ? (
                  <img src={api.userAvatarUrl(userAction.userId)} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  userAction.displayName?.[0]?.toUpperCase?.() ?? "?"
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 900,
                    color: "#ffffff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {userAction.displayName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#b9bbbe",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {userAction.userId}
                </div>
              </div>
            </div>

            {userActionError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{userActionError}</div>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {userActionStatus?.kind === "friend" && (
                <button
                  onClick={() => {
                    setSelectedRoomId(HOME_ID);
                    void openDmWith(userActionStatus.friend);
                    closeUserActions();
                  }}
                  disabled={userActionBusy}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#3ba55c",
                    color: "#111",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 900,
                    opacity: userActionBusy ? 0.7 : 1,
                  }}
                >
                  DMを開く
                </button>
              )}

              {userActionStatus?.kind === "none" && (
                <button
                  onClick={() => void userActionSendFriendRequest()}
                  disabled={userActionBusy}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#7289da",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 900,
                    opacity: userActionBusy ? 0.7 : 1,
                  }}
                >
                  フレンド申請
                </button>
              )}

              {userActionStatus?.kind === "outgoing" && (
                <button
                  disabled
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #40444b",
                    background: "transparent",
                    color: "#b9bbbe",
                    cursor: "default",
                    fontSize: 13,
                    fontWeight: 900,
                    opacity: 0.85,
                  }}
                >
                  申請中
                </button>
              )}

              {userActionStatus?.kind === "incoming" && (
                <>
                  <button
                    onClick={() => void userActionAcceptFriendRequest(userActionStatus.requestId)}
                    disabled={userActionBusy}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#3ba55c",
                      color: "#111",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 900,
                      opacity: userActionBusy ? 0.7 : 1,
                    }}
                  >
                    承認
                  </button>
                  <button
                    onClick={() => void userActionRejectFriendRequest(userActionStatus.requestId)}
                    disabled={userActionBusy}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#ed4245",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 900,
                      opacity: userActionBusy ? 0.7 : 1,
                    }}
                  >
                    拒否
                  </button>
                </>
              )}

              {userActionStatus?.kind === "self" && <div style={{ color: "#b9bbbe", fontSize: 12 }}>自分だよ</div>}
              {!userActionStatus && <div style={{ color: "#b9bbbe", fontSize: 12 }}>読み込み中…</div>}
            </div>
          </div>
        </Modal>
      )}

      <BanModal
        open={authed && !!banModal}
        roomName={banModal?.roomName ?? ""}
        userId={banUserId}
        onChangeUserId={setBanUserId}
        reason={banReason}
        onChangeReason={setBanReason}
        busy={banBusy}
        error={banError}
        onClose={closeBanModal}
        onBan={() => void submitBan("ban")}
        onUnban={() => void submitBan("unban")}
      />

      <RoomSettingsModal
        open={authed && !!inviteModal}
        inviteModal={inviteModal}
        onClose={closeInviteModal}
        roomSettingsTab={roomSettingsTab}
        setRoomSettingsTab={setRoomSettingsTab}
        inviteBusy={inviteBusy}
        inviteError={inviteError}
        auditError={auditError}
        currentUserId={currentUserId}
        members={members}
        invites={invites}
        auditLogs={auditLogs}
        inviteUrlFromCode={inviteUrlFromCode}
        setToast={setToast}
        onLeaveRoom={(roomId: string) => void leaveRoom(roomId)}
        onCreateInvite={() => void createInvite()}
        onDeleteInvite={(code: string) => void deleteInvite(code)}
        onRefreshAudit={() => void refreshAudit()}
        onBanFromMemberList={banFromMemberList}
        onKickMember={(userId: string) => void kickMember(userId)}
        onDeleteRoom={deleteRoomFromSettings}
      />

      <ConfirmActionModal
        open={authed && !!confirmModal}
        action={confirmModal as any}
        busy={inviteBusy}
        onClose={closeConfirmModal}
        onConfirm={(action: any) => {
          if (action.kind === "leave") void confirmLeaveRoom(action.roomId);
          if (action.kind === "kick") void confirmKickMember(action.roomId, action.userId);
          setConfirmModal(null);
        }}
      />

      <JoinRoomModal
        open={authed && joinOpen}
        joinCode={joinCode}
        onChangeJoinCode={setJoinCode}
        busy={joinBusy}
        error={joinError}
        canJoin={!!extractInviteCode(joinCode)}
        onClose={closeJoinModal}
        onJoin={() => void submitJoin()}
      />

      <HomeAuditModal
        open={authed && homeAuditOpen}
        busy={homeAuditBusy}
        error={homeAuditError}
        logs={homeAuditLogs}
        onClose={closeHomeAudit}
        onRefresh={() => void openHomeAudit()}
      />
    </>
  );
}


import { Modal } from "../Modal";
import { api } from "../api";
import type { AuditLog, RoomInvite, RoomMember } from "../api";

export type RoomSettingsTab = "members" | "invites" | "audit" | "danger";

type InviteModalState = { roomId: string; roomName: string; isOwner: boolean };

type Props = {
  open: boolean;
  inviteModal: InviteModalState | null;
  onClose: () => void;

  roomSettingsTab: RoomSettingsTab;
  setRoomSettingsTab: (v: RoomSettingsTab) => void;

  inviteBusy: boolean;
  inviteError: string | null;
  auditError: string | null;

  currentUserId: string | null;

  members: RoomMember[];
  invites: RoomInvite[];
  auditLogs: AuditLog[];

  inviteUrlFromCode: (code: string) => string;
  setToast: (msg: string | null) => void;

  onLeaveRoom: (roomId: string) => void;
  onCreateInvite: () => void;
  onDeleteInvite: (code: string) => void;
  onRefreshAudit: () => void;
  onBanFromMemberList: (userId: string) => void;
  onKickMember: (userId: string) => void;
  onDeleteRoom: () => void;
};

export function RoomSettingsModal({
  open,
  inviteModal,
  onClose,
  roomSettingsTab,
  setRoomSettingsTab,
  inviteBusy,
  inviteError,
  auditError,
  currentUserId,
  members,
  invites,
  auditLogs,
  inviteUrlFromCode,
  setToast,
  onLeaveRoom,
  onCreateInvite,
  onDeleteInvite,
  onRefreshAudit,
  onBanFromMemberList,
  onKickMember,
  onDeleteRoom,
}: Props) {
  if (!open || !inviteModal) return null;

  return (
    <Modal title={`Room設定（${inviteModal.roomName}）`} onClose={onClose}>
      <div style={{ display: "grid", gap: 14, color: "#dcddde" }}>
        {inviteError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{inviteError}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setRoomSettingsTab("members")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid #40444b",
              background: roomSettingsTab === "members" ? "#40444b" : "transparent",
              color: "#dcddde",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            メンバー
          </button>
          {inviteModal.isOwner && (
            <>
              <button
                type="button"
                onClick={() => setRoomSettingsTab("invites")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #40444b",
                  background: roomSettingsTab === "invites" ? "#40444b" : "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                招待
              </button>
              <button
                type="button"
                onClick={() => setRoomSettingsTab("audit")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #40444b",
                  background: roomSettingsTab === "audit" ? "#40444b" : "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                監査ログ
              </button>
              <button
                type="button"
                onClick={() => setRoomSettingsTab("danger")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(237,66,69,0.55)",
                  background: roomSettingsTab === "danger" ? "rgba(237,66,69,0.18)" : "transparent",
                  color: "#ff7a7a",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                危険
              </button>
            </>
          )}
        </div>

        {roomSettingsTab === "members" && (
          <>
            <div style={{ fontSize: 12, color: "#b9bbbe" }}>メンバー</div>
            {members.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>なし</div>
            ) : (
              <div className="darkScroll" style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
                {members.map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #40444b",
                      background: "#202225",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "#7289da",
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
                          <img src={api.userAvatarUrl(m.userId)} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          m.displayName?.[0]?.toUpperCase?.() ?? "?"
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {m.displayName}
                          {m.isOwner && <span style={{ marginLeft: 8, fontSize: 11, color: "#b9bbbe" }}>(owner)</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#8e9297", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                          {m.userId}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {inviteModal.isOwner && m.userId !== currentUserId && (
                        <button
                          onClick={() => onBanFromMemberList(m.userId)}
                          disabled={inviteBusy}
                          style={{
                            border: "none",
                            background: "#ed4245",
                            color: "#ffffff",
                            cursor: "pointer",
                            padding: "6px 10px",
                            borderRadius: 8,
                            fontWeight: 900,
                            fontSize: 12,
                            opacity: inviteBusy ? 0.7 : 1,
                          }}
                          title="BAN"
                        >
                          BAN
                        </button>
                      )}
                      {inviteModal.isOwner && m.userId !== currentUserId && !m.isOwner && (
                        <button
                          onClick={() => onKickMember(m.userId)}
                          disabled={inviteBusy}
                          style={{
                            border: "none",
                            background: "#ed4245",
                            color: "#ffffff",
                            cursor: "pointer",
                            padding: "6px 10px",
                            borderRadius: 8,
                            fontWeight: 900,
                            fontSize: 12,
                            opacity: inviteBusy ? 0.7 : 1,
                          }}
                          title="キック"
                        >
                          外す
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!inviteModal.isOwner && (
              <button
                onClick={() => onLeaveRoom(inviteModal.roomId)}
                disabled={inviteBusy}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#ed4245",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 900,
                  opacity: inviteBusy ? 0.7 : 1,
                }}
              >
                退出する
              </button>
            )}
          </>
        )}

        {inviteModal.isOwner && roomSettingsTab === "invites" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="primary" onClick={onCreateInvite} disabled={inviteBusy} style={{ width: "100%" }}>
                {inviteBusy ? "処理中…" : "招待URLを発行"}
              </button>
            </div>

            <div style={{ fontSize: 12, color: "#b9bbbe" }}>発行中の招待URL</div>
            {invites.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>なし</div>
            ) : (
              <div className="darkScroll" style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
                {invites.map((inv) => {
                  const expiresMs = new Date(inv.expires_at).getTime();
                  const expired = Number.isFinite(expiresMs) ? expiresMs <= Date.now() : false;
                  const maxed = Number.isFinite(inv.max_uses) ? inv.uses >= inv.max_uses : false;
                  const inactive = expired || maxed;
                  return (
                    <div
                      key={inv.code}
                      style={{
                        border: "1px solid #40444b",
                        background: "#202225",
                        borderRadius: 10,
                        padding: "10px 12px",
                        display: "grid",
                        gap: 8,
                        opacity: inactive ? 0.6 : 1,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          fontSize: 16,
                          fontWeight: 900,
                          wordBreak: "break-all",
                          userSelect: "text",
                        }}
                        title="クリックでコピー"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(inviteUrlFromCode(inv.code));
                            setToast("コピーしました");
                          } catch {
                            setToast("コピーできませんでした");
                          }
                        }}
                      >
                        {inviteUrlFromCode(inv.code)}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#b9bbbe", flexWrap: "wrap" }}>
                        <div>
                          使用回数: {inv.uses}/{inv.max_uses}
                        </div>
                        <div>期限: {new Date(inv.expires_at).toLocaleString()}</div>
                      </div>
                      {inactive && (
                        <div style={{ fontSize: 12, color: "#ff7a7a", fontWeight: 900 }}>
                          {expired ? "期限切れ" : "上限到達"}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(inviteUrlFromCode(inv.code));
                              setToast("コピーしました");
                            } catch {
                              setToast("コピーできませんでした");
                            }
                          }}
                          disabled={inviteBusy}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid #40444b",
                            background: "transparent",
                            color: "#dcddde",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 800,
                            width: "100%",
                          }}
                        >
                          コピー
                        </button>
                        <button
                          onClick={() => onDeleteInvite(inv.code)}
                          disabled={inviteBusy}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "none",
                            background: "#ed4245",
                            color: "#ffffff",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 900,
                            width: "100%",
                            opacity: inviteBusy ? 0.7 : 1,
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {inviteModal.isOwner && roomSettingsTab === "audit" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#b9bbbe" }}>監査ログ</div>
              <button
                onClick={onRefreshAudit}
                disabled={inviteBusy}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #40444b",
                  background: "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                  opacity: inviteBusy ? 0.7 : 1,
                }}
                title="更新"
              >
                更新
              </button>
            </div>
            {auditError && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{auditError}</div>}
            {auditLogs.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>なし</div>
            ) : (
              <div className="darkScroll" style={{ display: "grid", gap: 6, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
                {auditLogs.slice(0, 50).map((l) => (
                  <div
                    key={l.id}
                    style={{
                      border: "1px solid #40444b",
                      background: "#202225",
                      borderRadius: 10,
                      padding: "8px 10px",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.actorDisplayName} ({l.actorId})
                      </div>
                      <div style={{ color: "#8e9297", flexShrink: 0 }}>{new Date(l.created_at).toLocaleString()}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#b9bbbe" }}>
                      {(() => {
                        const meta = l.meta && typeof l.meta === "object" ? (l.meta as any) : null;
                        const label =
                          l.action === "room_create"
                            ? "room_create"
                            : l.action === "room_delete"
                              ? "room_delete"
                              : l.action === "room_join"
                                ? "room_join"
                                : l.action === "room_leave"
                                  ? "room_leave"
                                  : l.action === "room_kick"
                                    ? "room_kick"
                                    : l.action === "room_ban"
                                      ? "room_ban"
                                      : l.action === "room_unban"
                                        ? "room_unban"
                                        : l.action === "invite_create"
                                          ? "invite_create"
                                          : l.action === "invite_delete"
                                            ? "invite_delete"
                                            : l.action === "message_edit"
                                              ? "message_edit"
                                              : l.action === "message_delete"
                                                ? "message_delete"
                                                : l.action === "category_create"
                                                  ? "category_create"
                                                  : l.action === "category_delete"
                                                    ? "category_delete"
                                                    : l.action === "channel_create"
                                                      ? "channel_create"
                                                      : l.action === "channel_delete"
                                                        ? "channel_delete"
                                                        : l.action;
                        const extra: string[] = [];
                        if (meta?.name) extra.push(`name=${String(meta.name)}`);
                        if (meta?.reason) extra.push(`reason=${String(meta.reason)}`);
                        if (meta?.inviteCode) extra.push(`code=${String(meta.inviteCode)}`);
                        if (meta?.channelId) extra.push(`channel=${String(meta.channelId)}`);
                        if (meta?.byOwner) extra.push("byOwner");
                        return `${label}${l.targetId ? ` (${l.targetId})` : ""}${extra.length ? ` - ${extra.join(" ")}` : ""}`;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {inviteModal.isOwner && roomSettingsTab === "danger" && (
          <>
            <div style={{ fontSize: 12, color: "#b9bbbe" }}>危険</div>
            <button
              onClick={onDeleteRoom}
              disabled={inviteBusy}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                background: "#ed4245",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 900,
                opacity: inviteBusy ? 0.7 : 1,
                width: "100%",
              }}
              title="Roomを削除"
            >
              Roomを削除
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}


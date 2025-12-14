import { Modal } from "../Modal";
import type { AuditLog } from "../api";

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  logs: AuditLog[];
  onClose: () => void;
  onRefresh: () => void;
};

export function HomeAuditModal({ open, busy, error, logs, onClose, onRefresh }: Props) {
  if (!open) return null;

  return (
    <Modal
      title="監査ログ"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #40444b",
              background: "transparent",
              color: "#dcddde",
              cursor: "pointer",
              fontSize: 13,
              opacity: busy ? 0.7 : 1,
            }}
          >
            閉じる
          </button>
          <button
            onClick={onRefresh}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: "#7289da",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
              opacity: busy ? 0.7 : 1,
            }}
          >
            更新
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10, color: "#dcddde" }}>
        {error && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{error}</div>}
        {busy ? (
          <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>
        ) : logs.length === 0 ? (
          <div style={{ color: "#8e9297", fontSize: 12 }}>なし</div>
        ) : (
          <div className="darkScroll" style={{ display: "grid", gap: 6, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
            {logs.slice(0, 50).map((l) => (
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
                    const extra: string[] = [];
                    if (meta?.name) extra.push(`name=${String(meta.name)}`);
                    if (meta?.reason) extra.push(`reason=${String(meta.reason)}`);
                    if (meta?.requestId) extra.push(`request=${String(meta.requestId)}`);
                    if (meta?.threadId) extra.push(`thread=${String(meta.threadId)}`);
                    if (meta?.inviteCode) extra.push(`code=${String(meta.inviteCode)}`);
                    if (meta?.channelId) extra.push(`channel=${String(meta.channelId)}`);
                    if (meta?.byOwner) extra.push("byOwner");
                    return `${l.action}${l.targetId ? ` (${l.targetId})` : ""}${extra.length ? ` - ${extra.join(" ")}` : ""}`;
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}


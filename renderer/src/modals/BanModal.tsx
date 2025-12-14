import { Modal } from "../Modal";

type Props = {
  open: boolean;
  roomName: string;
  userId: string;
  onChangeUserId: (v: string) => void;
  reason: string;
  onChangeReason: (v: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onBan: () => void;
  onUnban: () => void;
};

export function BanModal({
  open,
  roomName,
  userId,
  onChangeUserId,
  reason,
  onChangeReason,
  busy,
  error,
  onClose,
  onBan,
  onUnban,
}: Props) {
  if (!open) return null;

  return (
    <Modal title={`BAN（${roomName}）`} onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <label className="label">
          ユーザーID
          <input
            className="input"
            value={userId}
            onChange={(e) => onChangeUserId(e.target.value)}
            placeholder="例: user_id"
            disabled={busy}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        <label className="label">
          理由（任意）
          <input
            className="input"
            value={reason}
            onChange={(e) => onChangeReason(e.target.value)}
            placeholder="任意"
            disabled={busy}
          />
        </label>

        {error && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button className="primary" onClick={onBan} disabled={busy}>
            {busy ? "処理中…" : "BAN"}
          </button>
          <button
            onClick={onUnban}
            disabled={busy}
            style={{
              width: "100%",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: "12px 14px",
              borderRadius: 14,
              fontWeight: 800,
              cursor: "pointer",
              background: "rgba(0,0,0,0.18)",
              color: "#e8ecff",
              marginTop: 10,
              opacity: busy ? 0.45 : 1,
            }}
          >
            BAN解除
          </button>
        </div>
      </div>
    </Modal>
  );
}


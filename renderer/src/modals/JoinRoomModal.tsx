import { Modal } from "../Modal";

type Props = {
  open: boolean;
  joinCode: string;
  onChangeJoinCode: (v: string) => void;
  busy: boolean;
  error: string | null;
  canJoin: boolean;
  onClose: () => void;
  onJoin: () => void;
};

export function JoinRoomModal({ open, joinCode, onChangeJoinCode, busy, error, canJoin, onClose, onJoin }: Props) {
  if (!open) return null;

  return (
    <Modal
      title="招待URLで参加"
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
            }}
          >
            キャンセル
          </button>
          <button
            onClick={onJoin}
            disabled={busy || !canJoin}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: "#7289da",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
              opacity: busy || !canJoin ? 0.7 : 1,
            }}
          >
            {busy ? "参加中…" : "参加"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        <label className="label">
          招待URL（またはコード）
          <input
            className="input"
            value={joinCode}
            onChange={(e) => onChangeJoinCode(e.target.value)}
            placeholder="例: https://yuiroom.net/invite/abcdef または abcdef"
            disabled={busy}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") onJoin();
              if (e.key === "Escape") onClose();
            }}
          />
        </label>
        {error && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{error}</div>}
      </div>
    </Modal>
  );
}


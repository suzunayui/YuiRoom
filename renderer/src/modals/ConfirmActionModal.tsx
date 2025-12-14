import { Modal } from "../Modal";

export type ConfirmAction =
  | { kind: "leave"; roomId: string; roomName: string }
  | { kind: "kick"; roomId: string; userId: string; displayName: string };

type Props = {
  open: boolean;
  action: ConfirmAction | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (action: ConfirmAction) => void;
};

export function ConfirmActionModal({ open, action, busy, onClose, onConfirm }: Props) {
  if (!open || !action) return null;

  return (
    <Modal
      title="確認"
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
            onClick={() => onConfirm(action)}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: "#ed4245",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 900,
              opacity: busy ? 0.7 : 1,
            }}
          >
            実行
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10, color: "#dcddde" }}>
        {action.kind === "leave" && (
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>Room「{action.roomName}」から退出しますか？</div>
        )}
        {action.kind === "kick" && (
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>「{action.displayName}」をRoomから外しますか？</div>
        )}
      </div>
    </Modal>
  );
}


import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
};

export function Modal({ title, children, onClose, footer }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // オーバーレイクリックで閉じる（中身クリックは無視）
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "#2f3136",
          border: "1px solid #202225",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #202225",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 900, color: "#ffffff" }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#8e9297",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 0,
            }}
            aria-label="閉じる"
            title="閉じる"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>{children}</div>

        {footer && (
          <div
            style={{
              padding: 16,
              borderTop: "1px solid #202225",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

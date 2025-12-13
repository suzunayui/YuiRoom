import { useEffect } from "react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  maxWidth?: string;
};

export function Modal({ title, children, onClose, footer, maxWidth }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
          width: maxWidth ?? "min(520px, 100%)",
          maxHeight: "min(88vh, 860px)",
          background: "#2f3136",
          border: "1px solid #202225",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
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
            flexShrink: 0,
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

        <div className="darkScroll" style={{ padding: 16, overflowY: "auto", flex: "1 1 auto" }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: 16,
              borderTop: "1px solid #202225",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

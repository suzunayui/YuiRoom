import { useEffect } from "react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  side?: "left" | "right";
  children: ReactNode;
  onClose: () => void;
  width?: number;
};

export function Drawer({ title, side, children, onClose, width }: Props) {
  const s: "left" | "right" = side ?? "left";
  const w = width ?? 320;

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
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1200,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [s]: 0,
          width: `min(${w}px, 92vw)`,
          background: "#2f3136",
          borderRight: s === "left" ? "1px solid #202225" : undefined,
          borderLeft: s === "right" ? "1px solid #202225" : undefined,
          display: "flex",
          flexDirection: "column",
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
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 900, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </div>
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

        <div className="darkScroll" style={{ overflowY: "auto", flex: "1 1 auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}


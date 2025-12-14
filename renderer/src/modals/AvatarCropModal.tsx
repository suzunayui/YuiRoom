import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  src: string;
  outputSizePx?: number; // default 256
  onCancel: () => void;
  onApply: (dataUrlPng: string) => void;
};

type ImgInfo = { w: number; h: number } | null;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function AvatarCropModal({ open, src, outputSizePx = 256, onCancel, onApply }: Props) {
  const viewportSize = 280;
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgInfo, setImgInfo] = useState<ImgInfo>(null);
  const [zoom, setZoom] = useState(1.1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ id: number; startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setImgInfo(null);
    setZoom(1.1);
    setOffset({ x: 0, y: 0 });
    setDrag(null);
  }, [open, src]);

  const baseScale = useMemo(() => {
    if (!imgInfo) return 1;
    return Math.max(viewportSize / imgInfo.w, viewportSize / imgInfo.h);
  }, [imgInfo]);

  const { displayW, displayH, left, top, clampX, clampY } = useMemo(() => {
    if (!imgInfo) {
      return {
        displayW: 0,
        displayH: 0,
        left: 0,
        top: 0,
        clampX: { min: 0, max: 0 },
        clampY: { min: 0, max: 0 },
      };
    }
    const s = baseScale * zoom;
    const displayW = imgInfo.w * s;
    const displayH = imgInfo.h * s;
    const minX = (viewportSize - displayW) / 2;
    const maxX = (displayW - viewportSize) / 2;
    const minY = (viewportSize - displayH) / 2;
    const maxY = (displayH - viewportSize) / 2;
    const x = clamp(offset.x, minX, maxX);
    const y = clamp(offset.y, minY, maxY);
    const left = (viewportSize - displayW) / 2 + x;
    const top = (viewportSize - displayH) / 2 + y;
    return {
      displayW,
      displayH,
      left,
      top,
      clampX: { min: minX, max: maxX },
      clampY: { min: minY, max: maxY },
    };
  }, [imgInfo, baseScale, zoom, offset.x, offset.y]);

  useEffect(() => {
    if (!imgInfo) return;
    setOffset((prev) => ({
      x: clamp(prev.x, clampX.min, clampX.max),
      y: clamp(prev.y, clampY.min, clampY.max),
    }));
  }, [imgInfo, clampX.min, clampX.max, clampY.min, clampY.max]);

  if (!open) return null;

  function applyCrop() {
    const img = imgRef.current;
    if (!img || !imgInfo) return;

    const s = baseScale * zoom;
    const sourceX = (0 - left) / s;
    const sourceY = (0 - top) / s;
    const sourceW = viewportSize / s;
    const sourceH = viewportSize / s;

    const canvas = document.createElement("canvas");
    canvas.width = outputSizePx;
    canvas.height = outputSizePx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, outputSizePx, outputSizePx);
    const dataUrl = canvas.toDataURL("image/png");
    onApply(dataUrl);
  }

  return (
    <Modal
      title="アイコンをトリミング"
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={onCancel}
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
            onClick={applyCrop}
            disabled={!imgInfo}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              background: "#7289da",
              color: "#ffffff",
              cursor: imgInfo ? "pointer" : "not-allowed",
              fontSize: 13,
              fontWeight: 800,
              opacity: imgInfo ? 1 : 0.7,
            }}
          >
            適用
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            width: viewportSize,
            height: viewportSize,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #40444b",
            background: "#202225",
            position: "relative",
            touchAction: "none",
            userSelect: "none",
          }}
          onPointerDown={(e) => {
            if (!imgInfo) return;
            (e.currentTarget as any).setPointerCapture?.(e.pointerId);
            setDrag({ id: e.pointerId, startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y });
          }}
          onPointerMove={(e) => {
            if (!drag || drag.id !== e.pointerId) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            setOffset({ x: clamp(drag.startOffX + dx, clampX.min, clampX.max), y: clamp(drag.startOffY + dy, clampY.min, clampY.max) });
          }}
          onPointerUp={(e) => {
            if (!drag || drag.id !== e.pointerId) return;
            setDrag(null);
          }}
          onPointerCancel={(e) => {
            if (!drag || drag.id !== e.pointerId) return;
            setDrag(null);
          }}
        >
          <img
            ref={imgRef}
            src={src}
            alt="crop source"
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setImgInfo({ w: el.naturalWidth || 1, h: el.naturalHeight || 1 });
            }}
            style={{
              position: "absolute",
              left,
              top,
              width: displayW,
              height: displayH,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.18)",
              pointerEvents: "none",
            }}
          />
        </div>

        <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
          ズーム
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>

        <div style={{ color: "#8e9297", fontSize: 12, lineHeight: 1.4 }}>
          画像をドラッグして位置を調整できます。
        </div>
      </div>
    </Modal>
  );
}


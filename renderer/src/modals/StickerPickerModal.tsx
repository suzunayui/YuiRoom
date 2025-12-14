import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StickerMeta } from "../api";
import { Modal } from "../Modal";
import { AvatarCropModal } from "./AvatarCropModal";
import { StickerImg } from "../stickers";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (stickerId: string) => void | Promise<void>;
};

function safeReadRecent(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string" && x.trim()).slice(0, 40);
  } catch {
    return [];
  }
}

function safeWriteRecent(storageKey: string, items: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 40)));
  } catch {
    // ignore
  }
}

export function StickerPickerModal({ open, onClose, onPick }: Props) {
  const storageKey = "yuiroom.recentStickers";
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<StickerMeta[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRecents(safeReadRecent(storageKey));
    void (async () => {
      setBusy(true);
      try {
        const r = await api.listStickers();
        setItems(r);
      } catch (e: any) {
        setError(e?.message ?? "failed");
      } finally {
        setBusy(false);
      }
    })();
  }, [open]);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const recentMetas = useMemo(() => recents.map((id) => itemsById.get(id)).filter(Boolean) as StickerMeta[], [recents, itemsById]);

  async function handlePick(stickerId: string) {
    await onPick(stickerId);
    setRecents((prev) => {
      const next = [stickerId, ...prev.filter((x) => x !== stickerId)].slice(0, 40);
      safeWriteRecent(storageKey, next);
      return next;
    });
  }

  if (!open) return null;

  return (
    <>
      <Modal
        title="スタンプ"
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={creating}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #40444b",
                background: "transparent",
                color: "#dcddde",
                cursor: creating ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 900,
                opacity: creating ? 0.7 : 1,
              }}
              title="画像からスタンプを作成"
            >
              画像を追加
            </button>
            <div style={{ marginLeft: "auto" }} />
            <button
              onClick={onClose}
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
          </>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith("image/")) return;
            const url = URL.createObjectURL(file);
            setCropSrc(url);
            e.currentTarget.value = "";
          }}
        />

        <div style={{ display: "grid", gap: 12 }}>
          {error && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{error}</div>}
          {busy && <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>}

          {recentMetas.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#8e9297", fontWeight: 900 }}>最近</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {recentMetas.slice(0, 12).map((s) => (
                  <button
                    key={`r:${s.id}`}
                    type="button"
                    onClick={() => void handlePick(s.id)}
                    style={{
                      border: "1px solid #40444b",
                      background: "transparent",
                      borderRadius: 12,
                      padding: 8,
                      cursor: "pointer",
                    }}
                    title={s.name || "スタンプ"}
                    aria-label={`スタンプ ${s.name || s.id}`}
                  >
                    <StickerImg stickerId={s.id} size={44} title={s.name || ""} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#8e9297", fontWeight: 900 }}>一覧</div>
            <div
              style={{
                border: "1px solid #40444b",
                background: "#2f3136",
                borderRadius: 12,
                padding: 10,
                maxHeight: 360,
                overflow: "auto",
              }}
            >
              {items.length === 0 && !busy ? (
                <div style={{ color: "#8e9297", fontSize: 12 }}>まだスタンプがありません。「画像を追加」から作れます。</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                  {items.map((s) => (
                    <div key={s.id} style={{ position: "relative" }}>
                      <button
                        type="button"
                        onClick={() => void handlePick(s.id)}
                        style={{
                          width: "100%",
                          border: "1px solid #40444b",
                          background: "#202225",
                          borderRadius: 12,
                          padding: 10,
                          cursor: "pointer",
                          display: "grid",
                          justifyItems: "center",
                          gap: 6,
                        }}
                        title={s.name || "スタンプ"}
                      >
                        <StickerImg stickerId={s.id} size={56} title={s.name || ""} />
                        <div
                          style={{
                            fontSize: 11,
                            color: "#b9bbbe",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.name || "スタンプ"}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("このスタンプを削除しますか？（リアクションからも消えます）")) return;
                          void (async () => {
                            setDeletingId(s.id);
                            setError(null);
                            try {
                              await api.deleteSticker(s.id);
                              setItems((prev) => prev.filter((x) => x.id !== s.id));
                              setRecents((prev) => {
                                const next = prev.filter((x) => x !== s.id);
                                safeWriteRecent(storageKey, next);
                                return next;
                              });
                            } catch (e: any) {
                              setError(e?.message ?? "delete_failed");
                            } finally {
                              setDeletingId(null);
                            }
                          })();
                        }}
                        disabled={deletingId === s.id}
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 26,
                          height: 26,
                          borderRadius: 999,
                          border: "1px solid #40444b",
                          background: deletingId === s.id ? "#2f3136" : "#202225",
                          color: "#ff7a7a",
                          cursor: deletingId === s.id ? "not-allowed" : "pointer",
                          fontWeight: 900,
                          lineHeight: 1,
                          opacity: deletingId === s.id ? 0.6 : 1,
                        }}
                        title="削除"
                        aria-label="スタンプを削除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <AvatarCropModal
        open={!!cropSrc}
        src={cropSrc || ""}
        outputSizePx={128}
        onCancel={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        onApply={(pngDataUrl) => {
          void (async () => {
            setCreating(true);
            setError(null);
            try {
              const created = await api.createSticker(pngDataUrl, "");
              const meta: StickerMeta = { id: created.id, name: created.name ?? "", mimeType: created.mimeType ?? "image/png", createdAt: new Date().toISOString() };
              setItems((prev) => [meta, ...prev]);
            } catch (e: any) {
              const msg = String(e?.message ?? "");
              if (msg === "sticker_too_large") setError("スタンプが大きすぎます（画像を小さくしてください）");
              else if (msg === "sticker_invalid_dataUrl") setError("画像形式が対応していません（PNG/JPEG/GIF/WebP）");
              else setError(msg || "作成に失敗しました");
            } finally {
              setCreating(false);
              if (cropSrc) URL.revokeObjectURL(cropSrc);
              setCropSrc(null);
            }
          })();
        }}
      />
    </>
  );
}

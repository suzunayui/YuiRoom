import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StickerMeta } from "../api";
import { Modal } from "../Modal";
import { AvatarCropModal } from "./AvatarCropModal";
import { StickerImg } from "../stickers";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onPick: (stickerId: string) => void | Promise<void>;
  closeOnPick?: boolean;
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

function safeReadString(key: string, fallback = ""): string {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : String(v);
  } catch {
    return fallback;
  }
}

function safeWriteString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeReadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x) => typeof x === "string" && x.trim()));
  } catch {
    return new Set();
  }
}

function safeWriteSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

export function StickerPickerModal({ open, title = "スタンプ", onClose, onPick, closeOnPick = false }: Props) {
  const storageKey = "yuiroom.recentStickers";
  const favKey = "yuiroom.favoriteStickers";
  const qKey = "yuiroom.stickerPicker.query";
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<StickerMeta[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"recent" | "all" | "fav" | "manage">("recent");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRecents(safeReadRecent(storageKey));
    setFavorites(safeReadSet(favKey));
    setTab("recent");
    setQ(safeReadString(qKey, ""));
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
    if (!open) return;
    safeWriteString(qKey, q);
  }, [open, q]);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const recentMetas = useMemo(() => recents.map((id) => itemsById.get(id)).filter(Boolean) as StickerMeta[], [recents, itemsById]);
  const favoriteMetas = useMemo(() => {
    const arr: StickerMeta[] = [];
    for (const id of favorites) {
      const m = itemsById.get(id);
      if (m) arr.push(m);
    }
    arr.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ja"));
    return arr;
  }, [favorites, itemsById]);

  const filteredAll = useMemo(() => {
    const query = norm(q);
    const base = [...items];
    base.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ja"));
    if (!query) return base;
    return base.filter((s) => norm(s.name || "").includes(query) || norm(s.id).includes(query));
  }, [items, q]);

  const shown = useMemo(() => {
    if (tab === "recent") return recentMetas;
    if (tab === "fav") return favoriteMetas;
    if (tab === "all") return filteredAll;
    return filteredAll;
  }, [tab, recentMetas, favoriteMetas, filteredAll]);

  async function handlePick(stickerId: string) {
    await onPick(stickerId);
    if (closeOnPick) onClose();
    setRecents((prev) => {
      const next = [stickerId, ...prev.filter((x) => x !== stickerId)].slice(0, 40);
      safeWriteRecent(storageKey, next);
      return next;
    });
  }

  function toggleFav(stickerId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(stickerId)) next.delete(stickerId);
      else next.add(stickerId);
      safeWriteSet(favKey, next);
      return next;
    });
  }

  if (!open) return null;

  return (
    <>
      <Modal
        title={title}
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

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="検索（名前 / ID）"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #40444b",
                background: "#202225",
                color: "#dcddde",
                fontSize: 13,
                outline: "none",
              }}
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="追加する名前（任意）"
              style={{
                width: 220,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #40444b",
                background: "#202225",
                color: "#dcddde",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                { id: "recent", label: `最近${recentMetas.length ? ` (${recentMetas.length})` : ""}` },
                { id: "fav", label: `お気に入り${favoriteMetas.length ? ` (${favoriteMetas.length})` : ""}` },
                { id: "all", label: `すべて${items.length ? ` (${items.length})` : ""}` },
                { id: "manage", label: "管理" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #40444b",
                  background: tab === t.id ? "#40444b" : "transparent",
                  color: "#dcddde",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            className="darkScroll"
            style={{
              border: "1px solid #40444b",
              background: "#2f3136",
              borderRadius: 12,
              padding: 10,
              maxHeight: 420,
              overflow: "auto",
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              if (!file.type.startsWith("image/")) return;
              const url = URL.createObjectURL(file);
              setCropSrc(url);
            }}
            title="画像をドラッグ&ドロップで追加できます"
          >
            {items.length === 0 && !busy ? (
              <div style={{ color: "#8e9297", fontSize: 12 }}>まだスタンプがありません。「画像を追加」またはD&Dで作れます。</div>
            ) : shown.length === 0 ? (
              <div style={{ color: "#8e9297", fontSize: 12 }}>見つかりません</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
                {shown.map((s) => (
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
                      <StickerImg stickerId={s.id} size={64} title={s.name || ""} />
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFav(s.id);
                      }}
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        border: "1px solid #40444b",
                        background: "#202225",
                        color: favorites.has(s.id) ? "#faa61a" : "#8e9297",
                        cursor: "pointer",
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                      title={favorites.has(s.id) ? "お気に入り解除" : "お気に入り"}
                      aria-label={favorites.has(s.id) ? "お気に入り解除" : "お気に入り"}
                    >
                      {favorites.has(s.id) ? "★" : "☆"}
                    </button>

                    {tab === "manage" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
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
                              setFavorites((prev) => {
                                const next = new Set(prev);
                                next.delete(s.id);
                                safeWriteSet(favKey, next);
                                return next;
                              });
                            } catch (e2: any) {
                              setError(e2?.message ?? "delete_failed");
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
                    )}
                  </div>
                ))}
              </div>
            )}
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
              const created = await api.createSticker(pngDataUrl, newName.trim());
              const meta: StickerMeta = { id: created.id, name: created.name ?? "", mimeType: created.mimeType ?? "image/png", createdAt: new Date().toISOString() };
              setItems((prev) => [meta, ...prev]);
              setNewName("");
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

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

export function StickerPickerPanel({
  roomId,
  currentUserId,
  canModerate,
  selected,
  onPick,
}: {
  roomId?: string | null;
  currentUserId?: string | null;
  canModerate?: boolean;
  selected?: Set<string>;
  onPick: (stickerId: string) => void | Promise<void>;
}) {
  const scopeKey = roomId ? `room:${roomId}` : "me";
  const storageKey = `yuiroom.recentStickers:${scopeKey}`;
  const favKey = `yuiroom.favoriteStickers:${scopeKey}`;
  const qKey = "yuiroom.stickerPicker.query";
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<StickerMeta[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"recent" | "all" | "fav" | "manage">("recent");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setError(null);
    setRecents(safeReadRecent(storageKey));
    setFavorites(safeReadSet(favKey));
    setTab("recent");
    setQ(safeReadString(qKey, ""));
    void (async () => {
      setBusy(true);
      try {
        const r = roomId ? await api.listRoomStickers(roomId) : await api.listStickers();
        setItems(r);
      } catch (e: any) {
        setError(e?.message ?? "failed");
      } finally {
        setBusy(false);
      }
    })();
  }, [roomId, storageKey, favKey]);

  useEffect(() => {
    safeWriteString(qKey, q);
  }, [q]);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const recentMetas = useMemo(() => recents.map((id) => itemsById.get(id)).filter(Boolean) as StickerMeta[], [recents, itemsById]);
  const favoriteMetas = useMemo(() => {
    const arr: StickerMeta[] = [];
    for (const id of favorites) {
      const m = itemsById.get(id);
      if (m) arr.push(m);
    }
    arr.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ja"));
    return arr;
  }, [favorites, itemsById]);

  const filteredAll = useMemo(() => {
    const query = norm(q);
    const base = [...items];
    base.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ja"));
    if (!query) return base;
    return base.filter((s) => norm(s.name || "").includes(query) || norm(s.id).includes(query));
  }, [items, q]);

  const shown = useMemo(() => {
    if (tab === "recent") return recentMetas;
    if (tab === "fav") return favoriteMetas;
    if (tab === "all") return filteredAll;
    return filteredAll;
  }, [tab, recentMetas, favoriteMetas, filteredAll]);

  async function handlePick(stickerId: string) {
    await onPick(stickerId);
    setRecents((prev) => {
      const next = [stickerId, ...prev.filter((x) => x !== stickerId)].slice(0, 40);
      safeWriteRecent(storageKey, next);
      return next;
    });
  }

  function toggleFav(stickerId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(stickerId)) next.delete(stickerId);
      else next.add(stickerId);
      safeWriteSet(favKey, next);
      return next;
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!file.type.startsWith("image/")) return;
          void (async () => {
            if (file.type === "image/gif") {
              setCreating(true);
              setError(null);
              try {
                const dataUrl = await readFileAsDataUrl(file);
                const created = roomId
                  ? await api.createRoomSticker(roomId, dataUrl, newName.trim())
                  : await api.createSticker(dataUrl, newName.trim());
                const meta: StickerMeta = {
                  id: created.id,
                  name: created.name ?? "",
                  mimeType: created.mimeType ?? "image/gif",
                  createdAt: new Date().toISOString(),
                  createdBy: (created as any).createdBy ?? undefined,
                };
                setItems((prev) => [meta, ...prev]);
                setNewName("");
              } catch (e2: any) {
                const msg = String(e2?.message ?? "");
                if (msg === "sticker_too_large") setError("スタンプが大きすぎます（サイズを小さくしてください）");
                else if (msg === "sticker_invalid_dataUrl") setError("画像形式が対応していません（PNG/JPEG/GIF/WebP）");
                else setError(msg || "作成に失敗しました");
              } finally {
                setCreating(false);
              }
              return;
            }
            const url = URL.createObjectURL(file);
            setCropSrc(url);
          })();
          e.currentTarget.value = "";
        }}
      />

      {error && <div style={{ color: "#ff7a7a", fontSize: 12 }}>{error}</div>}
      {busy && <div style={{ color: "#8e9297", fontSize: 12 }}>読み込み中…</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索（名前 / ID）"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #40444b",
            background: "#202225",
            color: "#dcddde",
            fontSize: 13,
            outline: "none",
          }}
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="追加する名前（任意）"
          style={{
            width: 220,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #40444b",
            background: "#202225",
            color: "#dcddde",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={creating}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #40444b",
            background: "transparent",
            color: "#dcddde",
            cursor: creating ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 900,
            opacity: creating ? 0.7 : 1,
            whiteSpace: "nowrap",
          }}
          title="画像からスタンプを作成（GIFはそのまま登録）"
        >
          追加
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            { id: "recent", label: `最近${recentMetas.length ? ` (${recentMetas.length})` : ""}` },
            { id: "fav", label: `お気に入り${favoriteMetas.length ? ` (${favoriteMetas.length})` : ""}` },
            { id: "all", label: `すべて${items.length ? ` (${items.length})` : ""}` },
            { id: "manage", label: "管理" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #40444b",
              background: tab === t.id ? "#40444b" : "transparent",
              color: "#dcddde",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="darkScroll"
        style={{
          border: "1px solid #40444b",
          background: "#2f3136",
          borderRadius: 12,
          padding: 10,
          maxHeight: 420,
          overflow: "auto",
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (!file.type.startsWith("image/")) return;
          void (async () => {
            if (file.type === "image/gif") {
              setCreating(true);
              setError(null);
              try {
                const dataUrl = await readFileAsDataUrl(file);
                const created = roomId
                  ? await api.createRoomSticker(roomId, dataUrl, newName.trim())
                  : await api.createSticker(dataUrl, newName.trim());
                const meta: StickerMeta = {
                  id: created.id,
                  name: created.name ?? "",
                  mimeType: created.mimeType ?? "image/gif",
                  createdAt: new Date().toISOString(),
                  createdBy: (created as any).createdBy ?? undefined,
                };
                setItems((prev) => [meta, ...prev]);
                setNewName("");
              } catch (e2: any) {
                const msg = String(e2?.message ?? "");
                if (msg === "sticker_too_large") setError("スタンプが大きすぎます（サイズを小さくしてください）");
                else if (msg === "sticker_invalid_dataUrl") setError("画像形式が対応していません（PNG/JPEG/GIF/WebP）");
                else setError(msg || "作成に失敗しました");
              } finally {
                setCreating(false);
              }
              return;
            }
            const url = URL.createObjectURL(file);
            setCropSrc(url);
          })();
        }}
        title="画像をドラッグ&ドロップで追加できます（GIFもOK）"
      >
        {items.length === 0 && !busy ? (
          <div style={{ color: "#8e9297", fontSize: 12 }}>まだスタンプがありません。右上の「追加」またはD&Dで作れます。</div>
        ) : shown.length === 0 ? (
          <div style={{ color: "#8e9297", fontSize: 12 }}>見つかりません</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
            {shown.map((s) => {
              const reactionKey = `sticker:${s.id}`;
              const active = selected?.has(reactionKey);
              const canDelete = roomId ? (!!canModerate || (!!currentUserId && s.createdBy === currentUserId)) : true;
              return (
                <div key={s.id} style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => void handlePick(s.id)}
                    style={{
                      width: "100%",
                      border: active ? "1px solid rgba(114,137,218,0.9)" : "1px solid #40444b",
                      background: active ? "rgba(114,137,218,0.18)" : "#202225",
                      borderRadius: 12,
                      padding: 10,
                      cursor: "pointer",
                      display: "grid",
                      justifyItems: "center",
                      gap: 6,
                    }}
                    title={s.name || "スタンプ"}
                  >
                    <StickerImg stickerId={s.id} size={64} title={s.name || ""} />
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFav(s.id);
                    }}
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      border: "1px solid #40444b",
                      background: "#202225",
                      color: favorites.has(s.id) ? "#faa61a" : "#8e9297",
                      cursor: "pointer",
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                    title={favorites.has(s.id) ? "お気に入り解除" : "お気に入り"}
                    aria-label={favorites.has(s.id) ? "お気に入り解除" : "お気に入り"}
                  >
                    {favorites.has(s.id) ? "★" : "☆"}
                  </button>

                  {tab === "manage" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canDelete) return;
                        if (!window.confirm("このスタンプを削除しますか？（リアクションからも消えます）")) return;
                        void (async () => {
                          setDeletingId(s.id);
                          setError(null);
                          try {
                              if (roomId) await api.deleteRoomSticker(roomId, s.id);
                              else await api.deleteSticker(s.id);
                              setItems((prev) => prev.filter((x) => x.id !== s.id));
                              setRecents((prev) => {
                                const next = prev.filter((x) => x !== s.id);
                                safeWriteRecent(storageKey, next);
                              return next;
                            });
                            setFavorites((prev) => {
                              const next = new Set(prev);
                              next.delete(s.id);
                              safeWriteSet(favKey, next);
                              return next;
                            });
                          } catch (e2: any) {
                            setError(e2?.message ?? "delete_failed");
                          } finally {
                            setDeletingId(null);
                          }
                        })();
                      }}
                      disabled={deletingId === s.id || !canDelete}
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
                        cursor: deletingId === s.id || !canDelete ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        lineHeight: 1,
                        opacity: deletingId === s.id || !canDelete ? 0.5 : 1,
                      }}
                      title={canDelete ? "削除" : "削除できません（作成者/ownerのみ）"}
                      aria-label="スタンプを削除"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              const created = roomId
                ? await api.createRoomSticker(roomId, pngDataUrl, newName.trim())
                : await api.createSticker(pngDataUrl, newName.trim());
              const meta: StickerMeta = {
                id: created.id,
                name: created.name ?? "",
                mimeType: created.mimeType ?? "image/png",
                createdAt: new Date().toISOString(),
                createdBy: (created as any).createdBy ?? undefined,
              };
              setItems((prev) => [meta, ...prev]);
              setNewName("");
            } catch (e: any) {
              const msg = String(e?.message ?? "");
              if (msg === "sticker_too_large") setError("スタンプが大きすぎます（サイズを小さくしてください）");
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

    </div>
  );
}

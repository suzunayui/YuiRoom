import { Modal } from "../Modal";
import { useEffect, useState } from "react";
import { AvatarCropModal } from "./AvatarCropModal";

function dataUrlToFile(dataUrl: string, filename: string): File {
  const m = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl);
  if (!m) throw new Error("invalid_dataUrl");
  const mime = m[1] || "application/octet-stream";
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new File([bytes], filename, { type: mime });
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: () => void;

  settingsName: string;
  setSettingsName: (v: string) => void;

  settingsAvatar: string;
  setSettingsAvatar: (v: string) => void;

  settingsBio: string;
  setSettingsBio: (v: string) => void;

  settingsError: string | null;

  displayName: string;
  currentUserId: string | null;

  fileToPngAvatarDataUrl: (file: File, maxSizePx?: number) => Promise<string>;

  enterKeySends: boolean;
  onChangeEnterKeySends: (v: boolean) => void;
};

export function SettingsModal({
  open,
  onClose,
  onSave,
  settingsName,
  setSettingsName,
  settingsAvatar,
  setSettingsAvatar,
  settingsBio,
  setSettingsBio,
  settingsError,
  displayName,
  currentUserId,
  fileToPngAvatarDataUrl,
  enterKeySends,
  onChangeEnterKeySends,
}: Props) {
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  if (!open) return null;

  return (
    <>
      <Modal
        title="設定"
        onClose={onClose}
        footer={
          <>
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
            <button
              onClick={onSave}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                background: "#7289da",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              保存
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
            表示名
            <input
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 8,
                border: "1px solid #40444b",
                background: "#202225",
                color: "#dcddde",
                fontSize: 14,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onClose();
              }}
              placeholder="例: みかん"
            />
          </label>

          <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
            アイコン画像
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "#7289da",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                  color: "#ffffff",
                  fontWeight: 900,
                  fontSize: 16,
                }}
                title="プレビュー"
              >
                {settingsAvatar ? (
                  <img src={settingsAvatar} alt="avatar preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  (settingsName || displayName || currentUserId || "?")?.[0]?.toUpperCase?.() ?? "?"
                )}
              </div>

              <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith("image/")) return;
                    const url = URL.createObjectURL(file);
                    setCropSrc(url);
                    e.currentTarget.value = "";
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #40444b",
                    background: "#202225",
                    color: "#dcddde",
                    fontSize: 13,
                  }}
                />
                <button
                  onClick={() => setSettingsAvatar("")}
                  style={{
                    justifySelf: "start",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #40444b",
                    background: "transparent",
                    color: "#dcddde",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  画像を削除
                </button>
              </div>
            </div>
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
            ひとこと（80文字まで）
            <input
              value={settingsBio}
              onChange={(e) => setSettingsBio(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 8,
                border: "1px solid #40444b",
                background: "#202225",
                color: "#dcddde",
                fontSize: 14,
              }}
              placeholder="例: ねむい"
            />
          </label>

          <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#8e9297" }}>
            送信キー
            <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#dcddde", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={enterKeySends}
                onChange={(e) => onChangeEnterKeySends(e.target.checked)}
              />
              Enterで送信（Shift+Enterで改行）
            </label>
            <div style={{ color: "#8e9297", fontSize: 12, lineHeight: 1.4 }}>
              OFFにすると「Enterで改行 / Shift+Enterで送信」になります。
            </div>
          </div>

          {settingsError && <div style={{ color: "#ff7a7a", fontSize: 12, lineHeight: 1.3 }}>{settingsError}</div>}
        </div>
      </Modal>

      <AvatarCropModal
        open={!!cropSrc}
        src={cropSrc || ""}
        onCancel={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        onApply={async (pngDataUrl) => {
          try {
            const file = dataUrlToFile(pngDataUrl, "avatar.png");
            const normalized = await fileToPngAvatarDataUrl(file, 256);
            setSettingsAvatar(normalized);
          } catch (err: any) {
            const msg = String(err?.message ?? "");
            if (msg === "avatar_too_large") {
              alert("アイコン画像が大きすぎます（2MB以下になるよう縮小してください）");
            } else {
              alert("対応していない画像形式です（PNG/JPEG/GIF/WebP）");
            }
          } finally {
            if (cropSrc) URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }
        }}
      />
    </>
  );
}

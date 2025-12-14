import { api } from "../api";

const USER_ID_REGEX = /^[a-z0-9_-]{3,32}$/;

export const HOME_ID = "__home__";

const SAVED_USER_ID_KEY = "yuiroom.savedUserId";
const ENTER_KEY_SENDS_KEY = "yr_enter_key_sends_v1";

export function normalizeUserId(v: string) {
  return v.trim().toLowerCase();
}

export function validateUserId(userId: string): string | null {
  const v = normalizeUserId(userId);
  if (!v) return "ユーザーIDを入力してね";
  if (!USER_ID_REGEX.test(v)) return "ユーザーIDは a-z 0-9 _ - のみ、3〜32文字だよ（ドット不可）";
  return null;
}

export function validateDisplayName(name: string): string | null {
  const v = name.trim();
  if (!v) return "ユーザー名を入力してね";
  if (v.length > 32) return "ユーザー名は32文字までにしてね";
  if (/[^\S\r\n]*[\r\n]+[^\S\r\n]*/.test(v)) return "改行は使えないよ";
  return null;
}

function inviteBaseOrigin(): string {
  try {
    return new URL(api.base()).origin;
  } catch {
    try {
      return window.location.origin;
    } catch {
      return "";
    }
  }
}

export function inviteUrlFromCode(code: string): string {
  const origin = inviteBaseOrigin();
  const c = String(code || "").trim();
  return origin ? `${origin}/invite/${encodeURIComponent(c)}` : `/invite/${encodeURIComponent(c)}`;
}

export function extractInviteCode(input: string): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  if (/^[a-z0-9]{6,32}$/i.test(v)) return v.toLowerCase();

  const m1 = /(?:^|\/)(?:invite|invites)\/([a-z0-9]{6,32})(?:$|[/?#])/i.exec(v);
  if (m1?.[1]) return String(m1[1]).toLowerCase();

  const m2 = /(?:^|[?&#])code=([a-z0-9]{6,32})(?:$|[&#])/i.exec(v);
  if (m2?.[1]) return String(m2[1]).toLowerCase();

  try {
    const u = new URL(v);
    const q = u.searchParams.get("code") ?? u.searchParams.get("invite") ?? "";
    if (q && /^[a-z0-9]{6,32}$/i.test(q)) return q.toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "invite" || p === "invites");
    const cand = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];
    if (cand && /^[a-z0-9]{6,32}$/i.test(cand)) return cand.toLowerCase();
  } catch {
    // ignore
  }

  return "";
}

export function displayNameKey(userId: string) {
  return `yuiroom.displayName:${userId}`;
}

export function avatarKey(userId: string) {
  return `yuiroom.avatar:${userId}`;
}

export function readSavedUserId(): string {
  try {
    return localStorage.getItem(SAVED_USER_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeSavedUserId(userId: string | null) {
  try {
    const v = userId ? normalizeUserId(userId) : "";
    if (v) localStorage.setItem(SAVED_USER_ID_KEY, v);
    else localStorage.removeItem(SAVED_USER_ID_KEY);
  } catch {
    // ignore
  }
}

export function readEnterKeySends(): boolean {
  try {
    const v = localStorage.getItem(ENTER_KEY_SENDS_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    // ignore
  }
  return true; // default: Enter=send, Shift+Enter=newline
}

export function writeEnterKeySends(v: boolean) {
  try {
    localStorage.setItem(ENTER_KEY_SENDS_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

export async function hasServerAvatar(userId: string): Promise<boolean> {
  try {
    const res = await fetch(api.userAvatarUrl(userId), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export async function fileToPngAvatarDataUrl(file: File, maxSizePx = 256): Promise<string> {
  const src = await fileToDataUrl(file);

  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Unsupported image format"));
  });
  img.src = src;
  await loaded;

  function toPng(max: number) {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) throw new Error("Unsupported image format");
    const scale = Math.min(1, max / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, outW, outH);
    return canvas.toDataURL("image/png");
  }

  // Try to ensure the resulting dataUrl stays under backend limit (2MB).
  let max = maxSizePx;
  for (let i = 0; i < 4; i++) {
    const dataUrl = toPng(max);
    const comma = dataUrl.indexOf(",");
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes <= 2 * 1024 * 1024) return dataUrl;
    max = Math.max(64, Math.floor(max * 0.75));
  }
  throw new Error("avatar_too_large");
}


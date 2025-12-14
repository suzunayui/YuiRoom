import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

const stickerUrlCache = new Map<string, string>();
const stickerInFlight = new Map<string, Promise<string>>();

async function getStickerObjectUrl(stickerId: string): Promise<string> {
  const cached = stickerUrlCache.get(stickerId);
  if (cached) return cached;
  const inflight = stickerInFlight.get(stickerId);
  if (inflight) return inflight;

  const p = (async () => {
    const blob = await api.fetchStickerBlob(stickerId);
    const url = URL.createObjectURL(blob);
    stickerUrlCache.set(stickerId, url);
    return url;
  })().finally(() => {
    stickerInFlight.delete(stickerId);
  });

  stickerInFlight.set(stickerId, p);
  return p;
}

export function parseStickerIdFromReaction(emoji: string): string | null {
  if (!emoji) return null;
  if (!emoji.startsWith("sticker:")) return null;
  const id = emoji.slice("sticker:".length);
  return id ? id : null;
}

export function StickerImg({
  stickerId,
  size,
  title,
}: {
  stickerId: string;
  size: number;
  title?: string;
}) {
  const [url, setUrl] = useState<string | null>(stickerUrlCache.get(stickerId) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    const cached = stickerUrlCache.get(stickerId);
    if (cached) {
      setUrl(cached);
      return;
    }
    setUrl(null);
    void (async () => {
      try {
        const u = await getStickerObjectUrl(stickerId);
        if (!active) return;
        setUrl(u);
      } catch {
        if (!active) return;
        setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [stickerId]);

  const boxStyle = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: 8,
      background: "#2b2d31",
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      flexShrink: 0 as const,
    }),
    [size]
  );

  if (failed) {
    return (
      <div style={{ ...boxStyle, border: "1px solid #3a3f47", color: "#8e9297", fontSize: 10 }} title="スタンプ読み込み失敗">
        ?
      </div>
    );
  }
  if (!url) return <div style={{ ...boxStyle, border: "1px solid #202225" }} />;

  return <img src={url} alt="sticker" title={title} style={{ width: size, height: size, objectFit: "contain" }} />;
}


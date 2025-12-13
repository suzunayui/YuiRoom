import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { RoomTree } from "./api";

type Props = {
  roomId: string;
  onBackToRooms: () => void;
};

export function RoomView({ roomId, onBackToRooms }: Props) {
  const [tree, setTree] = useState<RoomTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const base = useMemo(() => api.base(), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = await api.getRoomTree(roomId);
        if (!cancelled) {
          setTree(t);
          // 初期選択：最初のチャンネル
          const first =
            t.categories?.[0]?.channels?.[0]?.id ??
            t.uncategorized?.[0]?.id ??
            null;
          setSelectedChannelId(first);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const selectedChannelName = useMemo(() => {
    if (!tree || !selectedChannelId) return null;
    for (const c of tree.categories) {
      const hit = c.channels.find((ch) => ch.id === selectedChannelId);
      if (hit) return hit.name;
    }
    const u = tree.uncategorized.find((ch) => ch.id === selectedChannelId);
    return u?.name ?? null;
  }, [tree, selectedChannelId]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>API: {base}</div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{tree?.room?.name ?? "Room"}</h2>
        </div>

        <button
          onClick={onBackToRooms}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
            padding: "10px 12px",
            borderRadius: 14,
            cursor: "pointer"
          }}
        >
          Room一覧へ
        </button>
      </div>

      {loading && <div style={{ opacity: 0.8 }}>読み込み中…</div>}

      {error && (
        <div style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)" }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>取得失敗</div>
          <div style={{ opacity: 0.85, fontSize: 12 }}>{String(error)}</div>
        </div>
      )}

      {!loading && !error && tree && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, alignItems: "start" }}>
          {/* left: category/channel */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.18)",
              borderRadius: 16,
              padding: 12
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>Channels</div>

            {tree.categories.map((cat) => (
              <div key={cat.id} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 13, opacity: 0.9, marginBottom: 6 }}>{cat.name}</div>

                <div style={{ display: "grid", gap: 6 }}>
                  {cat.channels.map((ch) => {
                    const active = ch.id === selectedChannelId;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setSelectedChannelId(ch.id)}
                        style={{
                          textAlign: "left",
                          padding: "10px 10px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          color: "inherit",
                          cursor: "pointer",
                          opacity: active ? 1 : 0.85
                        }}
                      >
                        # {ch.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {tree.uncategorized.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontWeight: 900, fontSize: 13, opacity: 0.9, marginBottom: 6 }}>Uncategorized</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {tree.uncategorized.map((ch) => {
                    const active = ch.id === selectedChannelId;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setSelectedChannelId(ch.id)}
                        style={{
                          textAlign: "left",
                          padding: "10px 10px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          color: "inherit",
                          cursor: "pointer",
                          opacity: active ? 1 : 0.85
                        }}
                      >
                        # {ch.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* right: message placeholder */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.18)",
              borderRadius: 16,
              padding: 12,
              minHeight: 360
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>
                {selectedChannelName ? `# ${selectedChannelName}` : "チャンネル未選択"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>（次：messages実装）</div>
            </div>

            <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13, lineHeight: 1.6 }}>
              ここにメッセージ一覧を出す予定！
              <br />
              まずは左ペイン（カテゴリ/チャンネル）が動いてることを確認しよう。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

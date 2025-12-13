import { useEffect, useMemo, useState } from "react";

type Room = {
  id: string;
  name: string;
};

function apiBase() {
  // Viteの環境変数（存在しない場合の保険も）
  return (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3000";
}

export function Rooms(props: { onSelectRoom: (roomId: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => apiBase(), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${base}/rooms`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Room[];
        if (!cancelled) setRooms(data);
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
  }, [base]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Rooms</h2>
        <span style={{ opacity: 0.7, fontSize: 12 }}>{base}</span>
      </div>

      {loading && <div style={{ opacity: 0.8 }}>読み込み中…</div>}

      {error && (
        <div style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)" }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>取得失敗</div>
          <div style={{ opacity: 0.85, fontSize: 12 }}>{String(error)}</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            backendが起動してるか・URLが合ってるか確認してね
          </div>
        </div>
      )}

      {!loading && !error && rooms.length === 0 && (
        <div style={{ opacity: 0.8 }}>Roomがまだ無いみたい</div>
      )}

      {!loading && !error && rooms.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => props.onSelectRoom(r.id)}
              style={{
                textAlign: "left",
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.18)",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 900 }}>{r.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{r.id}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

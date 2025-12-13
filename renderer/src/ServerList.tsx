import type { Room } from "./api";

type Props = {
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string) => void;
  onRequestCreateRoom?: () => void;
  onRequestJoinRoom?: () => void;
  homeId?: string;
};

export function ServerList({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onRequestCreateRoom,
  onRequestJoinRoom,
  homeId,
}: Props) {
  return (
    <div style={{
      width: 72,
      minWidth: 72,
      flexShrink: 0,
      background: "#202225",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "12px 0",
      height: "100dvh",
      minHeight: "100vh",
      overflowY: "auto"
    }}>
      {homeId && (
        <>
          <button
            onClick={() => onSelectRoom(homeId)}
            style={{
              width: 48,
              height: 48,
              borderRadius: selectedRoomId === homeId ? 16 : 24,
              background: selectedRoomId === homeId ? "#7289da" : "#36393f",
              border: selectedRoomId === homeId ? "2px solid #ffffff" : "none",
              color: "#ffffff",
              fontWeight: "bold",
              fontSize: 18,
              cursor: "pointer",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-radius 0.2s, background 0.1s ease",
            }}
            onMouseEnter={(e) => {
              if (selectedRoomId !== homeId) e.currentTarget.style.background = "#40444b";
            }}
            onMouseLeave={(e) => {
              if (selectedRoomId !== homeId) e.currentTarget.style.background = "#36393f";
            }}
            title="ホーム（フレンド/DM）"
            aria-label="ホーム（フレンド/DM）"
          >
            YR
          </button>
          <div style={{ width: 32, height: 2, background: "#36393f", margin: "6px 0 12px" }} />
        </>
      )}

      {rooms.map((room) => {
        const active = room.id === selectedRoomId;
        return (
          <button
            key={room.id}
            onClick={() => onSelectRoom(room.id)}
            style={{
              width: 48,
              height: 48,
              borderRadius: active ? 16 : 24,
              background: active ? "#7289da" : "#36393f",
              border: active ? "2px solid #ffffff" : "none",
              color: "#ffffff",
              fontWeight: "bold",
              fontSize: 18,
              cursor: "pointer",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-radius 0.2s, background 0.1s ease"
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "#40444b";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "#36393f";
            }}
            title={room.name}
          >
            {room.name[0].toUpperCase()}
          </button>
        );
      })}

      {onRequestCreateRoom && (
        <button
          onClick={onRequestCreateRoom}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            background: "#36393f",
            border: "none",
            color: "#dcddde",
            fontWeight: 900,
            fontSize: 22,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            marginTop: 8,
          }}
          title="Roomを作成"
        >
          +
        </button>
      )}

      {onRequestJoinRoom && (
        <button
          onClick={onRequestJoinRoom}
          style={{
            width: 48,
            height: 36,
            borderRadius: 10,
            background: "transparent",
            border: "1px solid #40444b",
            color: "#8e9297",
            fontWeight: 900,
            fontSize: 14,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            marginTop: 10,
          }}
          title="招待コードで参加"
          aria-label="招待コードで参加"
        >
          INV
        </button>
      )}

    </div>
  );
}

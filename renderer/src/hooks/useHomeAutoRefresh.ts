import { useEffect } from "react";

export function useHomeAutoRefresh(args: {
  authed: boolean;
  selectedRoomId: string | null;
  homeId: string;
  loadHome: () => Promise<void> | void;
  subscribeHome: (cb: () => void) => () => void;
}) {
  const { authed, selectedRoomId, homeId, loadHome, subscribeHome } = args;

  useEffect(() => {
    if (!authed) return;
    if (selectedRoomId !== homeId) return;
    void loadHome();
  }, [authed, selectedRoomId, homeId, loadHome]);

  useEffect(() => {
    if (!authed) return;
    if (selectedRoomId !== homeId) return;
    const unsub = subscribeHome(() => void loadHome());
    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, [authed, selectedRoomId, homeId, loadHome, subscribeHome]);
}


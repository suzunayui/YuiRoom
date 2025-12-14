import { useEffect } from "react";
import { useLatestRef } from "./useLatestRef";

export function useHomeAutoRefresh(args: {
  authed: boolean;
  selectedRoomId: string | null;
  homeId: string;
  loadHome: () => Promise<void> | void;
  subscribeHome: (cb: () => void) => () => void;
}) {
  const { authed, selectedRoomId, homeId, loadHome, subscribeHome } = args;
  const loadHomeRef = useLatestRef(loadHome);
  const subscribeHomeRef = useLatestRef(subscribeHome);

  useEffect(() => {
    if (!authed) return;
    if (selectedRoomId !== homeId) return;
    void loadHomeRef.current();
  }, [authed, selectedRoomId, homeId, loadHomeRef]);

  useEffect(() => {
    if (!authed) return;
    if (selectedRoomId !== homeId) return;
    const unsub = subscribeHomeRef.current(() => void loadHomeRef.current());
    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, [authed, selectedRoomId, homeId, loadHomeRef, subscribeHomeRef]);
}

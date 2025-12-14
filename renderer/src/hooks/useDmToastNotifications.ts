import { useEffect, useRef } from "react";

type NotificationItem =
  | {
      id: string;
      kind: "mention";
      title: string;
      body: string;
      at: number;
      channelId: string;
      messageId: string;
    }
  | {
      id: string;
      kind: "dm";
      title: string;
      body: string;
      at: number;
      threadId: string;
      messageId: string;
      peer: { userId: string; displayName: string; hasAvatar: boolean };
    };

export function useDmToastNotifications(args: {
  authed: boolean;
  currentUserId: string | null;
  apiListDmThreads: () => Promise<Array<{ threadId: string; userId: string; displayName: string; hasAvatar: boolean }>>;
  subscribeDmMessage: (threadId: string, cb: (msg: any) => void) => () => void;
  subscribeHome: (cb: () => void) => () => void;
  homeId: string;
  selectedRoomIdRef: React.RefObject<string | null>;
  selectedDmThreadIdRef: React.RefObject<string | null>;
  setToast: (msg: string | null) => void;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
}) {
  const {
    authed,
    currentUserId,
    apiListDmThreads,
    subscribeDmMessage,
    subscribeHome,
    homeId,
    selectedRoomIdRef,
    selectedDmThreadIdRef,
    setToast,
    setNotifications,
  } = args;

  const dmToastUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const lastToastRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  useEffect(() => {
    if (!authed || !currentUserId) return;

    let cancelled = false;

    function maybeToast(key: string, msg: string) {
      const now = Date.now();
      if (lastToastRef.current.key === key && now - lastToastRef.current.at < 1500) return;
      lastToastRef.current = { key, at: now };
      setToast(msg);
    }

    function pushNotification(n: NotificationItem) {
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        const next = [n, ...prev];
        return next.slice(0, 20);
      });
    }

    async function refreshDmToastSubscriptions() {
      try {
        const threads = await apiListDmThreads();
        if (cancelled) return;

        const nextIds = new Set(threads.map((t) => t.threadId));

        for (const [id, unsub] of dmToastUnsubsRef.current.entries()) {
          if (nextIds.has(id)) continue;
          try {
            unsub();
          } catch {
            // ignore
          }
          dmToastUnsubsRef.current.delete(id);
        }

        for (const t of threads) {
          const threadId = t.threadId;
          if (dmToastUnsubsRef.current.has(threadId)) continue;
          const unsub = subscribeDmMessage(threadId, (msg: any) => {
            const authorId = String(msg?.author_id ?? "");
            if (authorId === currentUserId) return;
            if (selectedRoomIdRef.current === homeId && selectedDmThreadIdRef.current === threadId) return;
            const author = String(msg?.author ?? t.displayName ?? "DM");
            const text = String(msg?.content ?? "").trim();
            const snippet = text.length > 60 ? `${text.slice(0, 60)}…` : text;
            const msgId = String(msg?.id ?? "");
            maybeToast(`dm:${threadId}:${msgId}`, `DM — ${author}: ${snippet}`);
            if (msgId) {
              pushNotification({
                id: `dm:${threadId}:${msgId}`,
                kind: "dm",
                title: `DM — ${t.displayName}`,
                body: `${author}: ${snippet || "(本文なし)"}`,
                at: Date.now(),
                threadId,
                messageId: msgId,
                peer: { userId: t.userId, displayName: t.displayName, hasAvatar: !!t.hasAvatar },
              });
            }
          });
          dmToastUnsubsRef.current.set(threadId, unsub);
        }
      } catch {
        // ignore
      }
    }

    void refreshDmToastSubscriptions();
    const unsubHome = subscribeHome(() => {
      void refreshDmToastSubscriptions();
    });

    return () => {
      cancelled = true;
      try {
        unsubHome();
      } catch {
        // ignore
      }
      for (const unsub of dmToastUnsubsRef.current.values()) {
        try {
          unsub();
        } catch {
          // ignore
        }
      }
      dmToastUnsubsRef.current.clear();
    };
  }, [
    authed,
    currentUserId,
    apiListDmThreads,
    subscribeDmMessage,
    subscribeHome,
    homeId,
    selectedRoomIdRef,
    selectedDmThreadIdRef,
    setToast,
    setNotifications,
  ]);
}


import { useEffect, useRef, useState } from "react";
import { getLastSync, pushSync } from "@/lib/sync";
import { useFolders, useSettings } from "@/lib/store";
import { useContinueWatching } from "@/lib/progress";

export type SyncState = "idle" | "syncing" | "synced" | "error";

/**
 * Keeps the signed-in user's library backed up automatically.
 * Any watchlist / progress / settings change schedules a debounced push.
 */
export function useAutoSync(userId: string | null | undefined) {
  const [folders] = useFolders();
  const [settings] = useSettings();
  const { items } = useContinueWatching();
  const [state, setState] = useState<SyncState>("idle");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const first = useRef(true);
  const timer = useRef<number | null>(null);

  useEffect(() => setLastSync(getLastSync()), []);

  const signature = JSON.stringify([
    folders.map((f) => [f.id, f.mediaIds.length]),
    items.length,
    settings.autoSync,
  ]);

  useEffect(() => {
    if (!userId || settings.autoSync === false) return;
    // Skip the very first render so opening the page doesn't overwrite anything.
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState("syncing");
      pushSync(userId)
        .then(() => {
          setState("synced");
          setLastSync(getLastSync());
        })
        .catch(() => setState("error"));
    }, 1200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [userId, signature, settings.autoSync]);

  return { state, lastSync };
}

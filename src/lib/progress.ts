// Watch-progress store with optional cloud sync.
import { useEffect, useState } from "react";
import { syncWatchProgress, getWatchHistory, deleteWatchHistoryItem, getStoredAccountNumber } from "./account-sync";

const LOCAL_KEY = "sleepy.progress.v1";

export interface LocalProgressEntry {
  mediaId: number;
  mediaType: string;
  season: number | null;
  episode: number | null;
  positionSeconds: number;
  durationSeconds: number;
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  completed: boolean;
  updatedAt: number;
}

function readLocal(): LocalProgressEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocalProgressEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: LocalProgressEntry[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 100))); } catch {}
  window.dispatchEvent(new Event("sleepy:progress-changed"));
}

function keyOf(e: { mediaId: number; season: number | null; episode: number | null }) {
  return `${e.mediaId}:${e.season ?? "-"}:${e.episode ?? "-"}`;
}

function isEpisodeEntry(e: { season: number | null; episode: number | null }) {
  return e.season != null || e.episode != null;
}

function continueKeyOf(e: { mediaId: number; mediaType?: string; season: number | null; episode: number | null }) {
  const type = e.mediaType || (isEpisodeEntry(e) ? "tv" : "movie");
  return isEpisodeEntry(e) ? `${type}:${e.mediaId}:show` : `${type}:${keyOf(e)}`;
}

export function saveProgressLocal(entry: LocalProgressEntry) {
  const list = readLocal().filter((x) => continueKeyOf(x) !== continueKeyOf(entry));
  list.unshift(entry);
  writeLocal(list);

  // Sync to cloud if account exists
  if (getStoredAccountNumber()) {
    syncWatchProgress(
      entry.mediaId,
      entry.mediaType as "movie" | "tv",
      entry.title,
      entry.poster ?? undefined,
      entry.positionSeconds,
      entry.durationSeconds,
      entry.season ?? undefined,
      entry.episode ?? undefined
    ).catch(() => {}); // Ignore errors silently
  }
}

export function getLocalProgress(): LocalProgressEntry[] {
  const latest = new Map<string, LocalProgressEntry>();
  for (const entry of readLocal()) {
    const existing = latest.get(continueKeyOf(entry));
    if (!existing || existing.updatedAt < entry.updatedAt) latest.set(continueKeyOf(entry), entry);
  }
  return Array.from(latest.values())
    .filter((e) => !e.completed && e.positionSeconds > 10 && (e.durationSeconds === 0 || e.positionSeconds < e.durationSeconds - 60))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLocalProgressFor(mediaId: number, season: number | null, episode: number | null): LocalProgressEntry | null {
  return readLocal().find((e) => keyOf(e) === keyOf({ mediaId, season, episode })) ?? null;
}

export function removeLocalProgress(mediaId: number, season: number | null, episode: number | null) {
  const removingEpisode = season != null || episode != null;
  writeLocal(readLocal().filter((e) => (removingEpisode ? e.mediaId !== mediaId : keyOf(e) !== keyOf({ mediaId, season, episode }))));
}

// Kept as no-ops so existing callers compile unchanged. Fully frontend now.
export async function syncProgressUp(_entry: LocalProgressEntry) { /* no-op */ }
export async function removeProgress(mediaId: number, season: number | null, episode: number | null) {
  removeLocalProgress(mediaId, season, episode);

  // Also attempt to delete from cloud if account exists
  if (getStoredAccountNumber()) {
    try {
      // Find the cloud entry to delete
      const cloudHistory = await getWatchHistory();
      const match = cloudHistory.find(
        (h) => String(h.media_id) === String(mediaId) && h.season === season && h.episode === episode
      );
      if (match) {
        await deleteWatchHistoryItem(match.id);
      }
    } catch {}
  }
}

export interface ContinueItem {
  mediaId: number;
  mediaType: string;
  season: number | null;
  episode: number | null;
  positionSeconds: number;
  durationSeconds: number;
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  updatedAt: number;
}

export function useContinueWatching(): { items: ContinueItem[]; loading: boolean; refresh: () => void } {
  const [items, setItems] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const compute = async () => {
    const local: ContinueItem[] = getLocalProgress().map((e) => ({
      mediaId: e.mediaId,
      mediaType: e.mediaType,
      season: e.season,
      episode: e.episode,
      positionSeconds: e.positionSeconds,
      durationSeconds: e.durationSeconds,
      title: e.title,
      poster: e.poster,
      backdrop: e.backdrop,
      updatedAt: e.updatedAt,
    }));

    // Also fetch from cloud if logged in
    if (getStoredAccountNumber()) {
      try {
        const cloudHistory = await getWatchHistory();
        // Merge cloud with local, preferring more recent entries
        const merged = new Map<string, ContinueItem>();
        for (const item of local) {
          merged.set(continueKeyOf(item), item);
        }
        for (const cloud of cloudHistory) {
          const existing = merged.get(continueKeyOf({ mediaId: Number(cloud.media_id), mediaType: cloud.media_type, season: cloud.season, episode: cloud.episode }));
          if (!existing || cloud.updated_at > String(existing.updatedAt)) {
            merged.set(continueKeyOf({ mediaId: Number(cloud.media_id), mediaType: cloud.media_type, season: cloud.season, episode: cloud.episode }), {
              mediaId: Number(cloud.media_id),
              mediaType: cloud.media_type,
              season: cloud.season,
              episode: cloud.episode,
              positionSeconds: cloud.position_seconds,
              durationSeconds: cloud.duration_seconds,
              title: cloud.title,
              poster: cloud.poster,
              backdrop: undefined,
              updatedAt: new Date(cloud.updated_at).getTime(),
            });
          }
        }
        setItems(Array.from(merged.values())
          .filter((e) => e.positionSeconds > 10 && (e.durationSeconds === 0 || e.positionSeconds < e.durationSeconds - 60))
          .sort((a, b) => b.updatedAt - a.updatedAt));
      } catch {
        setItems(local);
      }
    } else {
      setItems(local);
    }
    setLoading(false);
  };

  useEffect(() => {
    compute();
    const onChange = () => compute();
    window.addEventListener("sleepy:progress-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sleepy:progress-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { items, loading, refresh: compute };
}

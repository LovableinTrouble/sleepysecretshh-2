// Local-only watch-progress store.
import { useEffect, useState } from "react";

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
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    /* no-op */
  }
  window.dispatchEvent(new Event("sleepy:progress-changed"));
}

function keyOf(e: { mediaId: number; season: number | null; episode: number | null }) {
  return `${e.mediaId}:${e.season ?? "-"}:${e.episode ?? "-"}`;
}

function isEpisodeEntry(e: { season: number | null; episode: number | null }) {
  return e.season != null || e.episode != null;
}

function continueKeyOf(e: {
  mediaId: number;
  mediaType?: string;
  season: number | null;
  episode: number | null;
}) {
  const type = e.mediaType || (isEpisodeEntry(e) ? "tv" : "movie");
  return isEpisodeEntry(e) ? `${type}:${e.mediaId}:show` : `${type}:${keyOf(e)}`;
}

export function saveProgressLocal(entry: LocalProgressEntry) {
  const list = readLocal().filter((x) => continueKeyOf(x) !== continueKeyOf(entry));
  list.unshift(entry);
  writeLocal(list);
}

export function getLocalProgress(): LocalProgressEntry[] {
  const latest = new Map<string, LocalProgressEntry>();
  for (const entry of readLocal()) {
    const existing = latest.get(continueKeyOf(entry));
    if (!existing || existing.updatedAt < entry.updatedAt) latest.set(continueKeyOf(entry), entry);
  }
  return Array.from(latest.values())
    .filter((e) => {
      if (e.completed) return false;
      // Entries with no known duration (e.g. NHDAPI, which has no postMessage)
      // are always shown — we only know they were watched, not the position.
      if (e.durationSeconds === 0) return e.positionSeconds >= 0;
      return e.positionSeconds > 10 && e.positionSeconds < e.durationSeconds - 60;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLocalProgressFor(
  mediaId: number,
  season: number | null,
  episode: number | null,
): LocalProgressEntry | null {
  return readLocal().find((e) => keyOf(e) === keyOf({ mediaId, season, episode })) ?? null;
}

export function removeLocalProgress(
  mediaId: number,
  season: number | null,
  episode: number | null,
) {
  const removingEpisode = season != null || episode != null;
  writeLocal(
    readLocal().filter((e) =>
      removingEpisode ? e.mediaId !== mediaId : keyOf(e) !== keyOf({ mediaId, season, episode }),
    ),
  );
}

export async function syncProgressUp(_entry: LocalProgressEntry) {
  /* no-op */
}
export async function removeProgress(
  mediaId: number,
  season: number | null,
  episode: number | null,
) {
  removeLocalProgress(mediaId, season, episode);
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

export function useContinueWatching(): {
  items: ContinueItem[];
  loading: boolean;
  refresh: () => void;
} {
  const [items, setItems] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const compute = () => {
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
    setItems(local);
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

import type { Media } from "./catalog";

/**
 * Source registry — NHDAPI (nhdapi.com) is the only source.
 * Pure iframe embed: no SDK, no postMessage, no backend, no keys.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed";
  tier: "primary";
  build: (m: Media, season?: number, episode?: number, progressSeconds?: number) => string;
}

export type SourceKey = "videasy";

// Sleepy accent (hex without #).
const ACCENT = "6366f1";

function buildVideasy(
  m: Media,
  season?: number,
  episode?: number,
  progressSeconds?: number,
): string {
  const id = String(m.id);
  const isAnime = m.type === "anime";
  const isShow = !isAnime && m.type !== "movie" && season != null && episode != null;
  let base: string;
  if (isAnime) {
    base = episode != null
      ? `https://player.videasy.net/anime/${id}/${episode}`
      : `https://player.videasy.net/anime/${id}`;
  } else if (isShow) {
    base = `https://player.videasy.net/tv/${id}/${season}/${episode}`;
  } else {
    base = `https://player.videasy.net/movie/${id}`;
  }

  const p = new URLSearchParams();
  p.set("color", ACCENT);
  p.set("overlay", "true");
  if (isShow || isAnime) {
    p.set("nextEpisode", "true");
    p.set("episodeSelector", "true");
    p.set("autoplayNextEpisode", "true");
  }
  if (progressSeconds && progressSeconds > 5) {
    p.set("progress", String(Math.floor(progressSeconds)));
  }
  return `${base}?${p.toString()}`;
}

const VIDEASY: Source = {
  id: "videasy",
  name: "Videasy",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode, progressSeconds) =>
    buildVideasy(m, season, episode, progressSeconds),
};

export const SOURCES: Source[] = [VIDEASY];

export function getOrderedSources(): Source[] {
  return [VIDEASY];
}

export function sourceForKey(_key: SourceKey): Source {
  return VIDEASY;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  videasy: "Videasy",
};

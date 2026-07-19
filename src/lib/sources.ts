import type { Media } from "./catalog";

/**
 * Source registry — Videasy (player.videasy.net) is the only source.
 * Pure iframe embed with a postMessage progress stream.
 * Docs: https://www.videasy.net/
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
const BASE = "https://player.videasy.net";

function buildVideasy(
  m: Media,
  season?: number,
  episode?: number,
  progressSeconds?: number,
): string {
  const id = String(m.id);
  const isShow = m.type !== "movie" && season != null && episode != null;
  const base = isShow ? `${BASE}/tv/${id}/${season}/${episode}` : `${BASE}/movie/${id}`;

  // All features enabled.
  const p = new URLSearchParams();
  p.set("color", ACCENT);
  p.set("autoplay", "true");
  p.set("nextEpisode", "true");
  p.set("episodeSelector", "true");
  p.set("autoplayNextEpisode", "true");
  p.set("progress", "true");
  if (progressSeconds && progressSeconds > 0) {
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

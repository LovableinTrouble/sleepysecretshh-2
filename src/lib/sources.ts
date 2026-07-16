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

export type SourceKey = "vidsuper";

// Sleepy accent (hex without #).
const ACCENT = "6366f1";

function buildVidsuper(
  m: Media,
  season?: number,
  episode?: number,
  progressSeconds?: number,
): string {
  const id = String(m.id);
  const isShow = m.type !== "movie" && season != null && episode != null;
  const base = isShow
    ? `https://vidsuper.net/tv/${id}/${season}/${episode}`
    : `https://vidsuper.net/movie/${id}`;

  const p = new URLSearchParams();
  p.set("autoplay", "true");
  p.set("color", ACCENT);
  p.set("overlay", "true");
  p.set("skip_intro", "true");
  if (isShow) {
    p.set("nextEpisode", "true");
    p.set("episodeSelector", "true");
    p.set("autoplayNextEpisode", "true");
  }
  if (progressSeconds && progressSeconds > 5) {
    p.set("progress", String(Math.floor(progressSeconds)));
  }
  return `${base}?${p.toString()}`;
}

const VIDSUPER: Source = {
  id: "vidsuper",
  name: "Vidsuper",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode, progressSeconds) =>
    buildVidsuper(m, season, episode, progressSeconds),
};

export const SOURCES: Source[] = [VIDSUPER];

export function getOrderedSources(): Source[] {
  return [VIDSUPER];
}

export function sourceForKey(_key: SourceKey): Source {
  return VIDSUPER;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  vidsuper: "Vidsuper",
};

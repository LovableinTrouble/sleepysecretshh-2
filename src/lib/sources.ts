import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — Vidsuper (vidsuper.net) as primary embed.
 * FebBox is the direct-stream primary when the user has configured a UI
 * cookie.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "febbox-direct" | "embed";
  tier: "primary" | "embed";
  legacy?: boolean;
  noSandbox?: boolean;
  build: (m: Media, season?: number, episode?: number) => string;
}

export type SourceKey = "delta" | "gamma" | "toro";

const FEBBOX: Source = {
  id: "febbox",
  name: "FebBox",
  badge: "Direct · up to 4K",
  kind: "febbox-direct",
  tier: "primary",
  build: () => "",
};

// Vidsuper — TMDB-only embed via vidsuper.net
// URL format: https://vidsuper.net/movie/{tmdb_id}
//           or https://vidsuper.net/tv/{tmdb_id}/{season}/{episode}
// Params: color, progress, nextEpisode, episodeSelector,
// autoplayNextEpisode, overlay, skip_intro
const VIDSUPER: Source = {
  id: "vidsuper",
  name: "Vidsuper",
  badge: "Embed · 4K",
  kind: "embed",
  tier: "embed",
  noSandbox: false,
  build: (m, s, e) => {
    const params = "episodeSelector=true&overlay=true&skip_intro=true";
    if (m.type === "movie") {
      return `https://vidsuper.net/movie/${m.id}?${params}`;
    }
    return `https://vidsuper.net/tv/${m.id}/${s ?? 1}/${e ?? 1}?${params}`;
  },
};

const STREAMRIP: Source = {
  id: "streamrip",
  name: "StreamRIP",
  badge: "Embed",
  kind: "embed",
  tier: "embed",
  noSandbox: false,
  build: (m, s, e) => {
    if (m.type === "movie") return `https://streamrip.fun/play?type=movie&id=${m.id}`;
    return `https://streamrip.fun/play?type=tv&id=${m.id}&s=${s ?? 1}&ep=${e ?? 1}`;
  },
};

const CINEMAOS: Source = {
  id: "cinemaos",
  name: "CinemaOS",
  badge: "Embed",
  kind: "embed",
  tier: "embed",
  noSandbox: false,
  build: (m, s, e) => {
    if (m.type === "movie") return `https://cinemaos.tech/player/${m.id}`;
    return `https://cinemaos.tech/player/${m.id}/${s ?? 1}/${e ?? 1}`;
  },
};

const TOUSTREAM: Source = {
  id: "toustream",
  name: "TouStream",
  badge: "Embed",
  kind: "embed",
  tier: "embed",
  noSandbox: true,
  build: (m, s, e) => {
    if (m.type === "movie") return `https://toustream.xyz/tou/movies/${m.id}`;
    return `https://toustream.xyz/tou/tv/${m.id}/${s ?? 1}/${e ?? 1}`;
  },
};

export const DEFAULT_EMBED_SOURCES: Source[] = [VIDSUPER, STREAMRIP, CINEMAOS, TOUSTREAM];
export const LEGACY_EMBED_SOURCES: Source[] = [];
export const SOURCES: Source[] = [FEBBOX, VIDSUPER, STREAMRIP, CINEMAOS, TOUSTREAM];
export const EMBED_SOURCES: Source[] = [VIDSUPER, STREAMRIP, CINEMAOS, TOUSTREAM];

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, ...EMBED_SOURCES] : [...EMBED_SOURCES, FEBBOX];
}

export function getBestSource(settings?: Pick<Settings, "integrations">): Source {
  return hasFebboxCookie(settings) ? FEBBOX : VIDSUPER;
}

export function sourcesForKey(key: SourceKey): Source[] {
  if (key === "delta" || key === "gamma") return [FEBBOX];
  return EMBED_SOURCES;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  delta: "FebBox",
  gamma: "FebBox",
  toro: "Embed",
};

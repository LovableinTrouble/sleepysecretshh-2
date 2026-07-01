import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — ZXCStream (v.zxcstream.xyz) as primary embed provider.
 * FebBox is the direct-stream primary when the user has configured a UI cookie.
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

// ZXCStream — primary embed via v.zxcstream.xyz
// URL format: https://v.zxcstream.xyz/player/movie/{tmdb_id}
//           or https://v.zxcstream.xyz/player/tv/{tmdb_id}/{season}/{episode}
// Clean player with subtitle, quality selector, and minimal ads.
// Sandbox enabled to block any popup scripts.
const ZXCSTREAM: Source = {
  id: "zxcstream",
  name: "ZXCStream",
  badge: "Embed · HD",
  kind: "embed",
  tier: "embed",
  noSandbox: false,
  build: (m, s, e) => {
    if (m.type === "movie") {
      return `https://v.zxcstream.xyz/player/movie/${m.id}?autoplay=true&color=ff3b30&back=false`;
    }
    return `https://v.zxcstream.xyz/player/tv/${m.id}/${s ?? 1}/${e ?? 1}?autoplay=true&color=ff3b30&back=false`;
  },
};

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

// All available embed sources - ZXCStream is first (default)
export const ALL_EMBED_SOURCES: Source[] = [ZXCSTREAM, VIDSUPER, STREAMRIP, CINEMAOS, TOUSTREAM];

// Map of source ID to Source object for quick lookup
const SOURCE_MAP: Record<string, Source> = {
  zxcstream: ZXCSTREAM,
  vidsuper: VIDSUPER,
  streamrip: STREAMRIP,
  cinemaos: CINEMAOS,
  toustream: TOUSTREAM,
};

export const DEFAULT_EMBED_SOURCES: Source[] = [ZXCSTREAM];
export const LEGACY_EMBED_SOURCES: Source[] = [];
export const SOURCES: Source[] = [FEBBOX, ...ALL_EMBED_SOURCES];
export const EMBED_SOURCES: Source[] = ALL_EMBED_SOURCES;

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

/**
 * Get the active embed source based on user settings.
 * Falls back to ZXCStream if not found or invalid.
 */
export function getActiveSource(settings?: Pick<Settings, "embedProvider">): Source {
  const preferredId = settings?.embedProvider;
  if (preferredId && SOURCE_MAP[preferredId]) {
    return SOURCE_MAP[preferredId];
  }
  return ZXCSTREAM; // Default
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, ...ALL_EMBED_SOURCES] : [...ALL_EMBED_SOURCES, FEBBOX];
}

export function getBestSource(settings?: Pick<Settings, "integrations" | "embedProvider">): Source {
  if (hasFebboxCookie(settings)) return FEBBOX;
  return getActiveSource(settings);
}

export function sourcesForKey(key: SourceKey): Source[] {
  if (key === "delta" || key === "gamma") return [FEBBOX];
  return ALL_EMBED_SOURCES;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  delta: "FebBox",
  gamma: "FebBox",
  toro: "Embed",
};

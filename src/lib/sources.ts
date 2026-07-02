import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — VoidX (v.zxcstream.xyz under the hood) is the single embed
 * backup provider. FebBox is the direct-stream primary when the user has
 * configured a UI cookie.
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

// VoidX — the single embed backup, powered by v.zxcstream.xyz.
// URL format: https://v.zxcstream.xyz/player/movie/{tmdb_id}
//           or https://v.zxcstream.xyz/player/tv/{tmdb_id}/{season}/{episode}
// Clean player with subtitle, quality selector, and minimal ads. It exposes a
// postMessage progress API (VIDEO_PLAY / VIDEO_PROGRESS / VIDEO_ENDED / …) that
// StreamPlayer listens to for real Continue Watching tracking.
// Sandbox enabled to block any popup scripts.
const VOIDX: Source = {
  id: "vidsrc",
  name: "VoidX",
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

// Single embed backup — VoidX.
export const ALL_EMBED_SOURCES: Source[] = [VOIDX];

// Map of source ID to Source object for quick lookup
const SOURCE_MAP: Record<string, Source> = {
  vidsrc: VOIDX,
};

export const DEFAULT_EMBED_SOURCES: Source[] = [VOIDX];
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
  return VOIDX; // Default
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

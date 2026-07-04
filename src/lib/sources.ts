import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — FebBox is the primary direct source (up to 4K, requires
 * a ui= cookie). VoidX (v.zxcstream.xyz under the hood) is the single embed
 * fallback when direct playback isn't available.
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

// VoidX — single embed backup (v.zxcstream.xyz under the hood).
// Exposes a postMessage progress API we hook into for Continue Watching.
const VIDSRC: Source = {
  id: "vidsrc",
  name: "VoidX",
  badge: "Embed · HD",
  kind: "embed",
  tier: "embed",
  noSandbox: false,
  build: (m, s, e) => {
    if (m.type === "movie") {
      return `https://v.zxcstream.xyz/player/movie/${m.id}?autoplay=true&color=fffff&back=false`;
    }
    return `https://v.zxcstream.xyz/player/tv/${m.id}/${s ?? 1}/${e ?? 1}?autoplay=true&color=fffff&back=false`;
  },
};

// Only one embed source now.
export const ALL_EMBED_SOURCES: Source[] = [VIDSRC];
export const DEFAULT_EMBED_SOURCES: Source[] = [VIDSRC];
export const LEGACY_EMBED_SOURCES: Source[] = [];
export const SOURCES: Source[] = [FEBBOX, VIDSRC];
export const EMBED_SOURCES: Source[] = [VIDSRC];

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

/** Only VoidX is available today; kept as a function for future expansion. */
export function getActiveSource(_settings?: Pick<Settings, "embedProvider">): Source {
  return VIDSRC;
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, VIDSRC] : [VIDSRC, FEBBOX];
}

export function getBestSource(settings?: Pick<Settings, "integrations" | "embedProvider">): Source {
  return hasFebboxCookie(settings) ? FEBBOX : VIDSRC;
}

export function sourcesForKey(key: SourceKey): Source[] {
  if (key === "delta" || key === "gamma") return [FEBBOX];
  return [VIDSRC];
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  delta: "FebBox",
  gamma: "FebBox",
  toro: "Embed",
};

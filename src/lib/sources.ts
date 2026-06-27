import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — VoidX only.
 *
 * The only embed provider is VoidX. FebBox is the
 * direct-stream primary when the user has configured a UI cookie.
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
  id: "febbox", name: "FebBox", badge: "Direct · up to 4K",
  kind: "febbox-direct", tier: "primary", build: () => "",
};

const VOIDX_HOST = atob("di56eGNzdHJlYW0ueHl6");

// VoidX — the only embed provider. Modern free embed with built-in
// player. Adblock-sandboxed so pop-up / redirect networks are neutered
// while the player JS still runs.
const ZXCSTREAM: Source = {
  id: "vidsrc", name: "VoidX", badge: "Embed · ad-blocked",
  kind: "embed", tier: "embed", noSandbox: false,
  build: (m, s, e) => m.type === "movie"
    ? `https://${VOIDX_HOST}/player/movie/${m.id}?autoplay=true&color=ff3b30&back=true`
    : `https://${VOIDX_HOST}/player/tv/${m.id}/${s ?? 1}/${e ?? 1}?autoplay=true&color=ff3b30&back=true`,
};

export const DEFAULT_EMBED_SOURCES: Source[] = [ZXCSTREAM];
export const LEGACY_EMBED_SOURCES: Source[] = [];
export const SOURCES: Source[] = [FEBBOX, ZXCSTREAM];
export const EMBED_SOURCES: Source[] = [ZXCSTREAM];

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, ZXCSTREAM] : [ZXCSTREAM, FEBBOX];
}
export function getBestSource(settings?: Pick<Settings, "integrations">): Source {
  return hasFebboxCookie(settings) ? FEBBOX : ZXCSTREAM;
}

export function sourcesForKey(key: SourceKey): Source[] {
  if (key === "delta" || key === "gamma") return [FEBBOX];
  return [ZXCSTREAM];
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  delta: "FebBox",
  gamma: "FebBox",
  toro: "VoidX",
};

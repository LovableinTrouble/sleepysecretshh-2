import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — VidAPI (vaplayer.ru) embed.
 *
 * VidAPI provides embed players for movies and TV shows via vaplayer.ru.
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
  id: "febbox", name: "FebBox", badge: "Direct · up to 4K",
  kind: "febbox-direct", tier: "primary", build: () => "",
};

// VidAPI — modern embed provider via vaplayer.ru
// Supports IMDB (tt prefix) or TMDB (numeric) IDs
// URL format: https://vaplayer.ru/embed/movie/{id} or /embed/tv/{id}/{season}/{episode}
const VIDAPI: Source = {
  id: "vidapi", name: "VidAPI", badge: "Embed · ad-blocked",
  kind: "embed", tier: "embed", noSandbox: false,
  build: (m, s, e) => {
    const baseParams = "skin=prime&color=9146ff";
    if (m.type === "movie") {
      return `https://vaplayer.ru/embed/movie/${m.id}?${baseParams}`;
    }
    return `https://vaplayer.ru/embed/tv/${m.id}/${s ?? 1}/${e ?? 1}?${baseParams}`;
  },
};

export const DEFAULT_EMBED_SOURCES: Source[] = [VIDAPI];
export const LEGACY_EMBED_SOURCES: Source[] = [];
export const SOURCES: Source[] = [FEBBOX, VIDAPI];
export const EMBED_SOURCES: Source[] = [VIDAPI];

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.feabbixCookie?.trim());
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, VIDAPI] : [VIDAPI, FEBBOX];
}
export function getBestSource(settings?: Pick<Settings, "integrations">): Source {
  return hasFebboxCookie(settings) ? FEBBOX : VIDAPI;
}

export function sourcesForKey(key: SourceKey): Source[] {
  if (key === "delta" || key === "gamma") return [FEBBOX];
  return [VIDAPI];
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  delta: "FebBox",
  gamma: "FebBox",
  toro: "VidAPI",
};

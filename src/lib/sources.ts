import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — FebBox is the primary direct source (up to 4K, requires
 * a ui= cookie/token). Prionix is a third-party iframe embed fallback, used
 * when FebBox isn't configured or has no working stream for a title.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "febbox-direct" | "embed";
  tier: "primary" | "backup";
  legacy?: boolean;
  build: (m: Media, season?: number, episode?: number) => string;
}

export type SourceKey = "gamma" | "prionix";

const FEBBOX: Source = {
  id: "febbox",
  name: "FebBox",
  badge: "Direct · up to 4K",
  kind: "febbox-direct",
  tier: "primary",
  build: () => "",
};

// Prionix — third-party iframe embed (backed by zxcstream.xyz), used as a
// fallback when FebBox isn't enabled or doesn't have a stream. Query params
// per api.zxcstream.xyz docs: domainAd (splash), color (accent hex, no '#'),
// autoplay.
const PRIONIX: Source = {
  id: "prionix",
  name: "Prionix",
  badge: "Embed · Backup",
  kind: "embed",
  tier: "backup",
  build: (m, season, episode) => {
    const accent = "6366f1";
    const isShow = m.type !== "movie" && season != null && episode != null;
    const base = isShow
      ? `https://zxcstream.xyz/player/tv/${m.id}/${season}/${episode}`
      : `https://zxcstream.xyz/player/movie/${m.id}`;
    const params = new URLSearchParams({
      domainAd: typeof window !== "undefined" ? window.location.hostname : "",
      color: accent,
      autoplay: "true",
    });
    return `${base}?${params.toString()}`;
  },
};

export const SOURCES: Source[] = [FEBBOX, PRIONIX];

function hasFebboxToken(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

// FebBox is only attempted when a token (the FebBox ui= cookie) is configured
// — anonymous FebBox calls almost always fail and just delay playback, so
// without a token we go straight to Prionix.
export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxToken(settings) ? [FEBBOX, PRIONIX] : [PRIONIX];
}

export function sourceForKey(key: SourceKey): Source {
  return key === "gamma" ? FEBBOX : PRIONIX;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  gamma: "FebBox",
  prionix: "Prionix",
};

import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — FebBox is the primary direct source (up to 4K, requires
 * a ui= cookie). Zxcstream is a third-party iframe embed fallback used when
 * FebBox has no working stream for a title.
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

export type SourceKey = "gamma" | "zxcstream";

const FEBBOX: Source = {
  id: "febbox",
  name: "FebBox",
  badge: "Direct · up to 4K",
  kind: "febbox-direct",
  tier: "primary",
  build: () => "",
};

// Zxcstream — third-party iframe embed, used as a fallback when FebBox
// doesn't work. Query params per api.zxcstream.xyz docs: domainAd (splash),
// color (accent hex, no '#'), autoplay.
const ZXCSTREAM: Source = {
  id: "zxcstream",
  name: "Zxcstream",
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

export const SOURCES: Source[] = [FEBBOX, ZXCSTREAM];

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return [FEBBOX, ZXCSTREAM];
}

export function sourceForKey(key: SourceKey): Source {
  return key === "gamma" ? FEBBOX : ZXCSTREAM;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  gamma: "FebBox",
  zxcstream: "Zxcstream",
};

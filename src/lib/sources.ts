import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — FebBox is the primary direct source (up to 4K, requires
 * a ui= cookie). Xpass (play.xpass.top / Pobreflix) is the direct HLS
 * backup, resolved server-side and streamed through our own proxy so playback
 * uses our native player UI. Zxcstream is a third-party iframe embed fallback
 * used when neither direct source has a working stream for a title.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "febbox-direct" | "xpass-direct" | "embed";
  tier: "primary" | "backup";
  legacy?: boolean;
  build: (m: Media, season?: number, episode?: number) => string;
}

export type SourceKey = "gamma" | "xpass" | "zxcstream";

const FEBBOX: Source = {
  id: "febbox",
  name: "FebBox",
  badge: "Direct · up to 4K",
  kind: "febbox-direct",
  tier: "primary",
  build: () => "",
};

// Xpass — direct HLS backup, resolved server-side via `resolveXpassStream`.
const XPASS: Source = {
  id: "xpass",
  name: "Xpass",
  badge: "Direct · HLS",
  kind: "xpass-direct",
  tier: "backup",
  build: () => "",
};

// Zxcstream — third-party iframe embed, used as a last-resort fallback when
// neither direct source works. Query params per api.zxcstream.xyz docs:
// domainAd (splash), color (accent hex, no '#'), autoplay.
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

export const SOURCES: Source[] = [FEBBOX, XPASS, ZXCSTREAM];

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, XPASS, ZXCSTREAM] : [XPASS, FEBBOX, ZXCSTREAM];
}

export function sourceForKey(key: SourceKey): Source {
  if (key === "gamma") return FEBBOX;
  if (key === "zxcstream") return ZXCSTREAM;
  return XPASS;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  gamma: "FebBox",
  xpass: "Xpass",
  zxcstream: "Zxcstream",
};

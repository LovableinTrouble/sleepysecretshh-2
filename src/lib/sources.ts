import type { Media } from "./catalog";

/**
 * Source registry — Prionix is the only source (third-party iframe embed
 * backed by zxcstream.xyz).
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed";
  tier: "primary";
  build: (m: Media, season?: number, episode?: number) => string;
}

export type SourceKey = "prionix";

const PRIONIX: Source = {
  id: "prionix",
  name: "Prionix",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode) => {
    const accent = "6366f1";
    const isShow = m.type !== "movie" && season != null && episode != null;
    const base = isShow
      ? `https://vidsuper.net/tv/${m.id}/${season}/${episode}`
      : `https://vidsuper.net/movie/${m.id}`;
    const params = new URLSearchParams({
      color: accent,
      autoplay: "true",
      nextEpisode: "true",
      autoplayNextEpisode: "true",
      episodeSelector: "true",
      overlay: "true",
      skip_intro: "true",
    });
    return `${base}?${params.toString()}`;
  },
};

export const SOURCES: Source[] = [PRIONIX];

export function getOrderedSources(): Source[] {
  return [PRIONIX];
}

export function sourceForKey(_key: SourceKey): Source {
  return PRIONIX;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  prionix: "Prionix",
};

import type { Media } from "./catalog";
import { getSettings } from "./store";

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
  name: "CineSrc",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode) => {
    const isShow = m.type !== "movie" && season != null && episode != null;
    const base = isShow
      ? `https://cinesrc.st/embed/tv/${m.id}?s=${season}&e=${episode}`
      : `https://cinesrc.st/embed/movie/${m.id}`;
    // Sleepy accent (indigo) — pass as hex with %23 replaced by URLSearchParams.
    const params = new URLSearchParams({
      color: "#6366f1",
      autoplay: "true",
      autonext: "true",
      autoskip: "true",
      controls: "true",
      prioritize: "true",
    });
    try {
      const tok = getSettings().integrations.febboxToken?.trim();
      if (tok) params.set("febbox", tok);
    } catch {}
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}${params.toString()}`;
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

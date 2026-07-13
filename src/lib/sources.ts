import type { Media } from "./catalog";
import { getSettings } from "./store";

export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed";
  tier: "primary" | "alt";
  build: (m: Media, season?: number, episode?: number) => string;
}

export type SourceKey = "prionix";

const PRIONIX: Source = {
  id: "prionix",
  name: "Cinezo",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode) => {
    const isShow = m.type !== "movie" && season != null && episode != null;
    const base = isShow
      ? `https://player.cinezo.live/embed/tv/${m.id}/${season}/${episode}`
      : `https://player.cinezo.live/embed/movie/${m.id}`;
    const params = new URLSearchParams({
      autoplay: "true",
      poster: "true",
      chromecast: "true",
      servericon: "true",
      setting: "true",
      pip: "true",
      primarycolor: "6366f1",
      secondarycolor: "0a0a12",
      iconcolor: "ffffff",
    });
    try {
      const tok = getSettings().integrations.febboxToken?.trim();
      if (tok) params.set("febbox", tok);
    } catch {
      /* no-op */
    }
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
  prionix: "Cinezo",
};

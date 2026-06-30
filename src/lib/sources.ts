import type { Media } from "./catalog";
import type { Settings } from "./store";

/**
 * Source registry — Vidsuper (vidsuper.net) as primary embed, with VidCore
 * (vidcore.net) and VAPlayer (vaplayer.ru) as additional/backup embeds.
 * FebBox is the direct-stream primary when the user has configured a UI
 * cookie.
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

// VidCore — IMDB/TMDB embed via vidcore.net
// URL format: https://vidcore.net/movie/{id}
//          or https://vidcore.net/tv/{id}/{season}/{episode}
// Optional params: title, poster, autoPlay, startAt, theme, server,
// hideServer, fullscreenButton, chromecast, sub, nextButton, autoNext
const VIDAPI: Source = {
  id: "vidapi",
  name: "VidCore",
  badge: "Embed · ad-blocked",
  kind: "embed",
  tier: "embed",
  noSandbox: true,
  build: (m, s, e) => {
    const params = "autoPlay=true";
    if (m.type === "movie") {
      return `https://vidcore.net/movie/${m.id}?${params}`;
    }
    return `https://vidcore.net/tv/${m.id}/${s ?? 1}/${e ?? 1}?${params}`;
  },
};

// VAPlayer — embed provider via vaplayer.ru (backup embed alongside
// VidCore/Vidsuper). Supports IMDB (tt prefix) or TMDB (numeric) IDs.
// URL format: https://vaplayer.ru/embed/movie/{id} or /embed/tv/{id}/{season}/{episode}
const VAPLAYER: Source = {
  id: "vaplayer",
  name: "VAPlayer",
  badge: "Embed · backup",
  kind: "embed",
  tier: "embed",
  noSandbox: false,
  build: (m, s, e) => {
    const baseParams = "skin=prime&color=9146ff";
    if (m.type === "movie") {
      return `https://vaplayer.ru/embed/movie/${m.id}?${baseParams}`;
    }
    return `https://vaplayer.ru/embed/tv/${m.id}/${s ?? 1}/${e ?? 1}?${baseParams}`;
  },
};

// Vidsuper — TMDB-only embed via vidsuper.net
// URL format: https://vidsuper.net/movie/{tmdb_id}
//          or https://vidsuper.net/tv/{tmdb_id}/{season}/{episode}
// Params: color, progress, nextEpisode, episodeSelector,
// autoplayNextEpisode, overlay, skip_intro
const VIDSUPER: Source = {
  id: "vidsuper",
  name: "Vidsuper",
  badge: "Embed · 4K",
  kind: "embed",
  tier: "embed",
  noSandbox: true,
  build: (m, s, e) => {
    const params = "episodeSelector=true&overlay=true&skip_intro=true";
    if (m.type === "movie") {
      return `https://vidsuper.net/movie/${m.id}?${params}`;
    }
    return `https://vidsuper.net/tv/${m.id}/${s ?? 1}/${e ?? 1}?${params}`;
  },
};

export const DEFAULT_EMBED_SOURCES: Source[] = [VIDSUPER, VIDAPI, VAPLAYER];
export const LEGACY_EMBED_SOURCES: Source[] = [];
export const SOURCES: Source[] = [FEBBOX, VIDSUPER, VIDAPI, VAPLAYER];
export const EMBED_SOURCES: Source[] = [VIDSUPER, VIDAPI, VAPLAYER];

function hasFebboxCookie(settings?: Pick<Settings, "integrations">): boolean {
  return Boolean(settings?.integrations?.febboxCookie?.trim());
}

export function getOrderedSources(settings?: Pick<Settings, "integrations">): Source[] {
  return hasFebboxCookie(settings) ? [FEBBOX, VIDSUPER, VIDAPI, VAPLAYER] : [VIDSUPER, VIDAPI, VAPLAYER, FEBBOX];
}
export function getBestSource(settings?: Pick<Settings, "integrations">): Source {
  return hasFebboxCookie(settings) ? FEBBOX : VIDSUPER;
}

export function sourcesForKey(key: SourceKey): Source[] {
  if (key === "delta" || key === "gamma") return [FEBBOX];
  return [VIDSUPER, VIDAPI, VAPLAYER];
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  delta: "FebBox",
  gamma: "FebBox",
  toro: "Vidsuper",
};

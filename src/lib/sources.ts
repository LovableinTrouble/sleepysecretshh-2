import type { Media } from "./catalog";

/**
 * Source registry — VidSuper (vidsuper.net) is the only source.
 * It is a pure iframe embed: no SDK, no backend, no keys.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed";
  tier: "primary";
  build: (m: Media, season?: number, episode?: number, progressSeconds?: number) => string;
}

export type SourceKey = "vidsuper";

// Sleepy accent.
const VIDSUPER_COLOR = "6366f1";

function buildVidSuper(
  m: Media,
  season?: number,
  episode?: number,
  progressSeconds?: number,
): string {
  const id = String(m.id);
  const isShow = m.type !== "movie" && season != null && episode != null;
  const base = isShow
    ? `https://vidsuper.net/tv/${id}/${season}/${episode}`
    : `https://vidsuper.net/movie/${id}`;

  const params = new URLSearchParams({
    color: VIDSUPER_COLOR,
    autoplay: "true",
    overlay: "true",
  });
  if (isShow) {
    params.set("nextEpisode", "true");
    params.set("episodeSelector", "true");
    params.set("autoplayNextEpisode", "true");
    params.set("skip_intro", "true");
  }
  if (progressSeconds && progressSeconds > 5) {
    params.set("progress", String(Math.floor(progressSeconds)));
  }
  return `${base}?${params.toString()}`;
}

const VIDSUPER: Source = {
  id: "vidsuper",
  name: "VidSuper",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode, progressSeconds) =>
    buildVidSuper(m, season, episode, progressSeconds),
};

export const SOURCES: Source[] = [VIDSUPER];

export function getOrderedSources(): Source[] {
  return [VIDSUPER];
}

export function sourceForKey(_key: SourceKey): Source {
  return VIDSUPER;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  vidsuper: "VidSuper",
};

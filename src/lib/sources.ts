import type { Media } from "./catalog";

/**
 * Source registry — ZXC[STREAM] (v4.zxcstream.xyz) is the only source.
 * Pure iframe embed with a postMessage API for play/pause/progress/ended.
 *
 * Docs: https://zxcstream.xyz/player/movie/
 * Events: VIDEO_PLAY, VIDEO_PAUSE, VIDEO_PROGRESS (every 60s after 60s),
 *         VIDEO_NINETY_PERCENT, VIDEO_ENDED
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed";
  tier: "primary";
  build: (m: Media, season?: number, episode?: number, progressSeconds?: number) => string;
}

export type SourceKey = "zxc";

// Sleepy accent (hex without #).
const ACCENT = "6366f1";
const BASE = "https://v4.zxcstream.xyz";

function buildZxc(m: Media, season?: number, episode?: number, _progressSeconds?: number): string {
  const id = String(m.id);
  const isShow = m.type !== "movie" && season != null && episode != null;
  const base = isShow ? `${BASE}/player/tv/${id}/${season}/${episode}` : `${BASE}/player/movie/${id}`;

  const p = new URLSearchParams();
  p.set("color", ACCENT);
  p.set("autoplay", "true");
  // No `back` param — we render our own back button on site.
  return `${base}?${p.toString()}`;
}

const ZXC: Source = {
  id: "zxc",
  name: "ZXCStream",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode, progressSeconds) => buildZxc(m, season, episode, progressSeconds),
};

export const SOURCES: Source[] = [ZXC];

export function getOrderedSources(): Source[] {
  return [ZXC];
}

export function sourceForKey(_key: SourceKey): Source {
  return ZXC;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  zxc: "ZXCStream",
};

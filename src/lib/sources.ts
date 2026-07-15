import type { Media } from "./catalog";

/**
 * Source registry — NHDAPI (nhdapi.com) is the only source.
 * Pure iframe embed: no SDK, no postMessage, no backend, no keys.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed";
  tier: "primary";
  build: (m: Media, season?: number, episode?: number, progressSeconds?: number) => string;
}

export type SourceKey = "nhdapi";

// Sleepy accent.
const PRIMARY = "6366f1";
const SECONDARY = "818cf8";
const ICON = "ffffff";

function buildNhdapi(
  m: Media,
  season?: number,
  episode?: number,
  progressSeconds?: number,
): string {
  const id = m.imdbId || String(m.id);
  const isShow = m.type !== "movie" && season != null && episode != null;
  const base = isShow
    ? `https://nhdapi.com/embed/tv/${id}/${season}/${episode}`
    : `https://nhdapi.com/embed/movie/${id}`;

  const p = new URLSearchParams();
  // Playback behaviour
  p.set("autoplay", "true");
  p.set("audio", "true");
  if (isShow) {
    p.set("autonext", "true");
    p.set("nextbutton", "true");
    p.set("episodelist", "true");
  }
  if (progressSeconds && progressSeconds > 5) {
    p.set("progress", String(Math.floor(progressSeconds)));
  }
  // Appearance — all UI controls visible (except download + PiP)
  p.set("title", "true");
  p.set("setting", "true");
  p.set("chromecast", "true");
  p.set("pip", "false");
  p.set("watchparty", "true");
  // Theme
  p.set("primarycolor", PRIMARY);
  p.set("secondarycolor", SECONDARY);
  p.set("iconcolor", ICON);
  p.set("glasscolor", "000000");
  p.set("glassopacity", "65");
  p.set("glassblur", "20");
  p.set("font", "Inter");
  p.set("fontcolor", "FFFFFF");
  return `${base}?${p.toString()}`;
}

const NHDAPI: Source = {
  id: "nhdapi",
  name: "NHDAPI",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode, progressSeconds) =>
    buildNhdapi(m, season, episode, progressSeconds),
};

export const SOURCES: Source[] = [NHDAPI];

export function getOrderedSources(): Source[] {
  return [NHDAPI];
}

export function sourceForKey(_key: SourceKey): Source {
  return NHDAPI;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  nhdapi: "NHDAPI",
};

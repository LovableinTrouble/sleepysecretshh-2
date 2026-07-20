import type { Media } from "./catalog";

export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed";
  tier: "primary" | "alt";
  /** febbox is forwarded when provided and non-empty */
  build: (m: Media, season?: number, episode?: number, febbox?: string) => string;
}

export type SourceKey = "prionix";

/** Build a Cinezo URL (no FebBox). */
function buildCinezo(m: Media, season?: number, episode?: number): string {
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
    episodelist: "true",
    primarycolor: "6366f1",
    secondarycolor: "0a0a12",
    iconcolor: "ffffff",
  });
  return `${base}?${params.toString()}`;
}

/**
 * Build a CineSrc URL when FebBox is active.
 * Stripped to essentials only — no branding params that identify the embed.
 */
function buildCineSrc(m: Media, season?: number, episode?: number, febbox?: string): string {
  const isShow = m.type !== "movie" && season != null && episode != null;
  const base = isShow
    ? `https://cinesrc.st/embed/tv/${m.id}`
    : `https://cinesrc.st/embed/movie/${m.id}`;
  const params = new URLSearchParams();
  if (isShow) {
    params.set("s", String(season));
    params.set("e", String(episode));
  }
  params.set("autoplay", "true");
  params.set("color", "%236366f1");
  params.set("autonext", "true");
  params.set("autoskip", "false");
  params.set("controls", "true");
  params.set("back", "close");
  if (febbox) params.set("febbox", febbox);
  return `${base}?${params.toString()}`;
}

const PRIONIX: Source = {
  id: "prionix",
  name: "Cinezo",
  badge: "Embed",
  kind: "embed",
  tier: "primary",
  build: (m, season, episode, febbox) => {
    return febbox
      ? buildCineSrc(m, season, episode, febbox)
      : buildCinezo(m, season, episode);
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

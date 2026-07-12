import type { Media } from "./catalog";
import { getSettings } from "./store";

/**
 * Source registry — CineSrc is the default embed source (third-party iframe
 * embed backed by zxcstream.xyz). WebTor is an alternative that streams
 * torrents directly in-browser via the webtor.io embed SDK.
 */
export interface Source {
  id: string;
  name: string;
  badge?: string;
  kind: "embed" | "webtor";
  tier: "primary" | "alt";
  build: (m: Media, season?: number, episode?: number) => string;
}

export type SourceKey = "prionix" | "webtor";

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
    } catch {
      /* no-op */
    }
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}${params.toString()}`;
  },
};

/**
 * WebTor source — builds a magnet-search URL that the StreamPlayer uses
 * to find a matching torrent and stream it via the webtor.io SDK.
 * The build() returns a search query string (not a direct embed URL)
 * that the WebTorStreamPlayer component uses to find magnet links.
 */
const WEBTOR: Source = {
  id: "webtor",
  name: "WebTor",
  badge: "Beta",
  kind: "webtor",
  tier: "alt",
  build: (m, season, episode) => {
    const isShow = m.type !== "movie" && season != null && episode != null;
    if (isShow) {
      const s = String(season).padStart(2, "0");
      const e = String(episode).padStart(2, "0");
      return `${m.title} S${s}E${e}`;
    }
    return m.year ? `${m.title} ${m.year}` : m.title;
  },
};

export const SOURCES: Source[] = [PRIONIX, WEBTOR];

export function getOrderedSources(): Source[] {
  return [PRIONIX, WEBTOR];
}

export function sourceForKey(key: SourceKey): Source {
  if (key === "webtor") return WEBTOR;
  return PRIONIX;
}

export const SOURCE_TIER_LABEL: Record<SourceKey, string> = {
  prionix: "Prionix",
  webtor: "WebTor",
};

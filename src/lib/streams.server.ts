/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StreamQuality {
  url: string;
  label: string;
  quality: string;
  format: "hls" | "mp4" | "mkv" | "unknown";
  headers?: Record<string, string>;
  size?: string;
  resolution?: number;
}
export interface StreamSubtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}
export interface DirectSource {
  kind: "direct";
  id: string;
  name: string;
  badge: string;
  qualities: StreamQuality[];
  subtitles: StreamSubtitle[];
}
export interface EmbedSource {
  kind: "embed";
  id: string;
  name: string;
  badge: string;
  url: string;
}
export type ResolvedSource = DirectSource | EmbedSource;
export interface ResolveInput {
  tmdbId: string;
  title: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}
export interface ResolveResult {
  sources: ResolvedSource[];
  primary?: string;
}

function mkEmbed(id: string, name: string, badge: string, url: string): EmbedSource {
  return { kind: "embed", id, name, badge, url };
}

function buildEmbeds(i: ResolveInput): EmbedSource[] {
  const isShow = i.type !== "movie";
  const season = i.season ?? 1;
  const episode = i.episode ?? 1;
  const path = isShow
    ? `tv/${i.tmdbId}/${season}/${episode}`
    : `movie/${i.tmdbId}`;
  // Cinezo embed with the Sleepy customization (gold primary, near-black secondary).
  const params = new URLSearchParams({
    autoplay: "true",
    poster: "true",
    chromecast: "true",
    servericon: "true",
    setting: "true",
    pip: "true",
    font: "Roboto",
    fontcolor: "6f63ff",
    fontsize: "20",
    opacity: "0.5",
    primarycolor: "e8b86d",
    secondarycolor: "0a0a12",
    iconcolor: "ffffff",
  });
  const sources: EmbedSource[] = [];
  sources.push(mkEmbed("cinezo", "Cinezo", "Embed",
    `https://player.cinezo.live/embed/${path}?${params.toString()}`));
  return sources;
}

export function buildEmbedsOnly(input: ResolveInput): ResolveResult {
  const sources = buildEmbeds(input);
  return { sources, primary: sources[0]?.id };
}

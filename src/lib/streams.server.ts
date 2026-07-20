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
  const tv = (base: string) => `${base}/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  const sources: EmbedSource[] = [];
  sources.push(mkEmbed("quasar2", "Videasy", "Embed",
    isShow ? `https://player.videasy.net/tv/${tv("")}?color=6366f1&autoPlay=true` : `https://player.videasy.net/movie/${i.tmdbId}?color=6366f1&autoPlay=true`));
  return sources;
}

export function buildEmbedsOnly(input: ResolveInput): ResolveResult {
  const sources = buildEmbeds(input);
  return { sources, primary: sources[0]?.id };
}

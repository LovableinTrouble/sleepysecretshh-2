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
    ? `1/tv/${i.tmdbId}/${season}/${episode}`
    : `1/movie/${i.tmdbId}`;
  // Viduki API 1 (multi-server). Vivid amber accent — more visible than the
  // muted gold while staying in the Sleepy warm palette.
  const params = new URLSearchParams({ color: "f59e0b" });
  return [
    mkEmbed(
      "viduki",
      "Viduki",
      "Embed",
      `https://www.viduki.net/${path}?${params.toString()}`,
    ),
  ];
}

export function buildEmbedsOnly(input: ResolveInput): ResolveResult {
  const sources = buildEmbeds(input);
  return { sources, primary: sources[0]?.id };
}

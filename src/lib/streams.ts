// Videasy-only mode. No server-side scraping — we build the embed URL
// directly on the client with all features enabled.

export interface EmbedSource {
  kind: "embed";
  id: string;
  name: string;
  badge: string;
  url: string;
}
export interface DirectSource {
  kind: "direct";
  id: string;
  name: string;
  badge: string;
  qualities: never[];
  subtitles: never[];
}
export type ResolvedSource = EmbedSource | DirectSource;
export interface ResolveResult {
  sources: ResolvedSource[];
  primary: string | null;
}

export interface StreamQuality {
  url: string;
  label: string;
  quality: string;
  format: "hls" | "mp4" | "mkv" | "unknown";
}
export interface StreamSubtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}

interface ResolveInput {
  tmdbId: string | number;
  title: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

function buildVideasyUrl(input: ResolveInput): string {
  const id = String(input.tmdbId);
  const isShow = input.type === "show" && input.season != null && input.episode != null;
  const base = isShow
    ? `https://player.videasy.net/tv/${id}/${input.season}/${input.episode}`
    : `https://player.videasy.net/movie/${id}`;
  const params = new URLSearchParams({
    color: "6366f1",
    autoplay: "true",
    nextEpisode: "true",
    episodeSelector: "true",
    autoplayNextEpisode: "true",
    progress: "true",
  });
  return `${base}?${params.toString()}`;
}

export async function resolveStreams(args: { data: ResolveInput }): Promise<ResolveResult> {
  const url = buildVideasyUrl(args.data);
  return {
    sources: [{ id: "videasy", kind: "embed", name: "Videasy", badge: "HD", url }],
    primary: "videasy",
  };
}
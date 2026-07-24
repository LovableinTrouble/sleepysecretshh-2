/* eslint-disable @typescript-eslint/no-explicit-any */
// P-Stream provider pipeline. Runs client-side; all provider fetches are
// routed through /api/public/pstream-proxy (simpleProxy-compatible).
import {
  makeProviders,
  makeStandardFetcher,
  makeSimpleProxyFetcher,
  targets,
  type RunOutput,
  type ScrapeMedia,
} from "@p-stream/providers";

function proxyUrl(): string {
  if (typeof window === "undefined") return "/api/public/pstream-proxy";
  return `${window.location.origin}/api/public/pstream-proxy`;
}

function getProviders() {
  return makeProviders({
    fetcher: makeStandardFetcher(fetch),
    proxiedFetcher: makeSimpleProxyFetcher(proxyUrl(), fetch),
    target: targets.BROWSER,
  });
}

export interface ScrapeInput {
  tmdbId: string;
  title: string;
  releaseYear?: number;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

function toScrapeMedia(i: ScrapeInput): ScrapeMedia {
  const year = i.releaseYear && Number.isFinite(i.releaseYear) ? i.releaseYear : 2020;
  if (i.type === "movie") {
    return { type: "movie", title: i.title, releaseYear: year, tmdbId: i.tmdbId };
  }
  return {
    type: "show",
    title: i.title,
    releaseYear: year,
    tmdbId: i.tmdbId,
    episode: { number: i.episode ?? 1, tmdbId: String(i.episode ?? 1) },
    season: { number: i.season ?? 1, tmdbId: String(i.season ?? 1) },
  };
}

export interface PStreamStream {
  url: string;
  type: "hls" | "mp4";
  qualities?: Record<string, { type: "mp4"; url: string }>;
  captions: Array<{ id: string; url: string; language: string; type: "srt" | "vtt" }>;
  headers?: Record<string, string>;
  sourceId: string;
  embedId?: string;
}

function pickStream(out: RunOutput): PStreamStream | null {
  const stream: any = out.stream;
  if (!stream) return null;
  if (stream.type === "hls") {
    return {
      url: stream.playlist,
      type: "hls",
      captions: stream.captions ?? [],
      headers: stream.headers,
      sourceId: out.sourceId,
      embedId: out.embedId,
    };
  }
  if (stream.type === "file") {
    const q = stream.qualities || {};
    const order = ["4k", "1080", "720", "480", "360", "unknown"];
    for (const k of order) {
      if (q[k]?.url) {
        return {
          url: q[k].url,
          type: "mp4",
          qualities: q,
          captions: stream.captions ?? [],
          headers: stream.headers,
          sourceId: out.sourceId,
          embedId: out.embedId,
        };
      }
    }
  }
  return null;
}

export interface ScrapeEvent {
  type: "init" | "start" | "update" | "discoverEmbeds";
  detail?: string;
}

export async function scrapePStream(
  input: ScrapeInput,
  onEvent?: (e: ScrapeEvent) => void,
): Promise<PStreamStream | null> {
  const providers = getProviders();
  const media = toScrapeMedia(input);
  try {
    const output = await providers.runAll({
      media,
      events: {
        init: (e) => onEvent?.({ type: "init", detail: `${e.sourceIds.length} sources` }),
        start: (id) => onEvent?.({ type: "start", detail: id }),
        update: (e) => onEvent?.({ type: "update", detail: `${e.id}:${e.status}` }),
        discoverEmbeds: (e) =>
          onEvent?.({ type: "discoverEmbeds", detail: `${e.embeds.length} embeds` }),
      },
    });
    if (!output) return null;
    return pickStream(output);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[pstream] scrape failed", e);
    return null;
  }
}
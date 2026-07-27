/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { listProviders, PROVIDERS } from "./stream-providers";
import type { ScrapedStream } from "./stream-providers";

export type { ScrapedStream };

// /api/providers — returns the list of available streaming providers
export const getProviders = createServerFn({ method: "GET" }).handler(async () => {
  return { providers: listProviders() };
});

const StreamSchema = z.object({
  type: z.enum(["movie", "tv", "anime"]),
  id: z.union([z.string(), z.number()]).transform(String),
  season: z.number().optional(),
  episode: z.number().optional(),
  provider: z.string().optional(),
});

// /api/stream — scrapes streams from a specific provider (or all if none given)
export const getStreams = createServerFn({ method: "POST" })
  .inputValidator((data) => StreamSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; streams: ScrapedStream[] }> => {
    const mediaType: "movie" | "tv" = data.type === "movie" ? "movie" : "tv";
    const provider = data.provider;

    const { resolveProviderById } = await import("./streams.server");
    const toStreams = (streams: Awaited<ReturnType<typeof resolveProviderById>>["qualities"]): ScrapedStream[] =>
      streams.map((stream) => ({
        url: stream.url,
        quality: stream.quality,
        provider: stream.sourceName ?? stream.label,
        type: stream.format,
      }));

    if (provider) {
      const picked = PROVIDERS.find((p) => p.id === provider || p.name.toLowerCase() === provider.toLowerCase()) ?? PROVIDERS[0];
      const result = await resolveProviderById(picked.id, {
        tmdbId: data.id,
        title: data.id,
        type: mediaType === "movie" ? "movie" : "show",
        season: data.season,
        episode: data.episode,
      });
      const streams = toStreams(result.qualities);
      return { ok: streams.length > 0, streams };
    }

    // No provider specified — try all in order, return first that has streams
    for (const p of PROVIDERS) {
      const result = await resolveProviderById(p.id, {
        tmdbId: data.id,
        title: data.id,
        type: mediaType === "movie" ? "movie" : "show",
        season: data.season,
        episode: data.episode,
      });
      const streams = toStreams(result.qualities);
      if (streams.length > 0) return { ok: true, streams };
    }
    return { ok: false, streams: [] };
  });

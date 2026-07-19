/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { listProviders, scrapeProvider } from "./stream-providers";
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

    if (provider) {
      const streams = await scrapeProvider(
        provider,
        data.id,
        mediaType,
        data.season,
        data.episode,
      );
      return { ok: streams.length > 0, streams };
    }

    // No provider specified — try all in order, return first that has streams
    const { PROVIDERS } = await import("./stream-providers");
    for (const p of PROVIDERS) {
      const streams = await scrapeProvider(p.name, data.id, mediaType, data.season, data.episode);
      if (streams.length > 0) return { ok: true, streams };
    }
    return { ok: false, streams: [] };
  });

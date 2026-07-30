import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ResolveResult, ProviderId, StreamQuality, StreamSubtitle } from "./streams.server";

export type { ResolveResult, ResolvedSource, DirectSource, EmbedSource, StreamQuality, StreamSubtitle, ProviderId } from "./streams.server";

export const resolveStreams = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      tmdbId: z.union([z.string(), z.number()]).transform(String),
      title: z.string().min(1),
      type: z.enum(["movie", "show"]),
      season: z.number().optional(),
      episode: z.number().optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<ResolveResult> => {
    const { resolveDirect } = await import("./streams.server");
    return resolveDirect(data);
  });

export const resolveProvider = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      provider: z.enum(["febbox", "nimbus", "orion", "vega", "atlas"]),
      tmdbId: z.union([z.string(), z.number()]).transform(String),
      title: z.string().min(1),
      type: z.enum(["movie", "show"]),
      season: z.number().optional(),
      episode: z.number().optional(),
      fast: z.boolean().optional(),
      febboxCookie: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> => {
    const { resolveProviderById } = await import("./streams.server");
    const { provider, fast, febboxCookie, ...rest } = data;
    return resolveProviderById(provider, rest, { fast, febboxCookie });
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ResolveResult } from "./streams.server";

export type { ResolveResult, ResolvedSource, DirectSource, EmbedSource, StreamQuality, StreamSubtitle } from "./streams.server";

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

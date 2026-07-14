import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ResolveResult } from "./streams.server";

export type { ResolveResult, ResolvedSource, DirectSource, EmbedSource, StreamQuality, StreamSubtitle } from "./streams.server";

const InputSchema = z.object({
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
});

export const resolveStreams = createServerFn({ method: "POST" })
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<ResolveResult> => {
    const { resolveAllSources } = await import("./streams.server");
    return resolveAllSources(data);
  });
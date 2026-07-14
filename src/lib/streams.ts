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
    try {
      const { resolveAllSources } = await import("./streams.server");
      const result = await resolveAllSources(data);
      if (result.sources.length > 0) return result;
    } catch (e) {
      console.error("[resolveStreams] scraper error:", e);
    }
    // Fallback: static embeds that don't need any API calls
    try {
      const { buildEmbedsOnly } = await import("./streams.server");
      return buildEmbedsOnly(data);
    } catch {
      // Last-resort: return a single vidsrc embed
      const id = data.tmdbId;
      const isShow = data.type === "show";
      const url = isShow
        ? `https://player.autoembed.cc/embed/tv/${id}/${data.season ?? 1}/${data.episode ?? 1}`
        : `https://player.autoembed.cc/embed/movie/${id}`;
      return {
        sources: [{ id: "fallback", kind: "embed", name: "AutoEmbed", badge: "embed", url }],
        primary: "fallback",
      };
    }
  });
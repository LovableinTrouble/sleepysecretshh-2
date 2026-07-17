/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface ScraperStream {
  id: string;
  sourceId: string;
  sourceName: string;
  type: "hls" | "file";
  url: string;
  quality?: string;
  headers?: Record<string, string>;
}

export interface ScraperResult {
  ok: boolean;
  streams: ScraperStream[];
  error?: string;
}

const Schema = z.object({
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  releaseYear: z.number().optional(),
  type: z.enum(["movie", "tv", "anime"]),
  season: z.number().optional(),
  episode: z.number().optional(),
});

// Cache module import + providers instance across requests.
let providersInstance: any = null;
async function getProviders() {
  if (providersInstance) return providersInstance;
  const { makeProviders, makeStandardFetcher, targets } = await import("@movie-web/providers");
  providersInstance = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    target: targets.NATIVE,
  });
  return providersInstance;
}

export const scrapeStreams = createServerFn({ method: "POST" })
  .inputValidator((data) => Schema.parse(data))
  .handler(async ({ data }): Promise<ScraperResult> => {
    try {
      const providers = await getProviders();
      const media: any = {
        type: data.type === "movie" ? "movie" : "show",
        title: data.title,
        releaseYear: data.releaseYear,
        tmdbId: data.tmdbId,
      };
      if (data.type !== "movie" && data.season != null && data.episode != null) {
        media.season = data.season;
        media.episode = data.episode;
      }

      // Timeout so a slow scrape doesn't hang the UI — first good stream wins.
      const output = await Promise.race([
        providers.runAll({ media }),
        new Promise<null>((r) => setTimeout(() => r(null), 45000)),
      ]);
      if (!output || !output.stream) {
        return { ok: false, streams: [], error: "No streams found." };
      }

      const streams: ScraperStream[] = [];
      const s = output.stream;
      if (s.type === "hls" && s.playlist) {
        streams.push({
          id: `${output.sourceId}-hls`,
          sourceId: output.sourceId,
          sourceName: output.embedId ? `${output.sourceId}/${output.embedId}` : output.sourceId,
          type: "hls",
          url: s.playlist,
          headers: s.headers || undefined,
        });
      } else if (s.type === "file" && s.qualities) {
        const qualities = s.qualities as Record<string, any>;
        for (const [q, file] of Object.entries(qualities)) {
          if (file?.url) {
            streams.push({
              id: `${output.sourceId}-${q}`,
              sourceId: output.sourceId,
              sourceName: output.embedId ? `${output.sourceId}/${output.embedId}` : output.sourceId,
              type: "file",
              url: file.url,
              quality: q,
              headers: s.headers || undefined,
            });
          }
        }
      }

      return { ok: streams.length > 0, streams };
    } catch (err) {
      return { ok: false, streams: [], error: (err as Error).message || "Scrape failed." };
    }
  });

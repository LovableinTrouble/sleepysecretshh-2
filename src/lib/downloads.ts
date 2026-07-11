/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface DownloadItem {
  id: string;
  url: string;
  source: string;
  quality: string;
  type: "mp4" | "hls" | "mkv" | "torrent" | "file";
  size?: string;
  fileName?: string;
  headers?: Record<string, string>;
}

export interface DownloadsResult {
  ok: boolean;
  downloads: DownloadItem[];
  subtitles: { url: string; label: string; language: string; type: "srt" | "vtt" }[];
  error?: string;
}

const DownloadsSchema = z.object({
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  year: z.string().optional(),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
});

export const resolveDownloaderSources = createServerFn({ method: "POST" })
  .inputValidator((data) => DownloadsSchema.parse(data))
  .handler(async ({ data }): Promise<DownloadsResult> => {
    const { resolveDownloadProviders } = await import("./downloads.server");
    return resolveDownloadProviders(data);
  });

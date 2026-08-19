import type { DownloadsResult } from "./downloads";

interface Input {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  return {
    ok: true,
    downloads: [],
    subtitles: [],
    error: "Coming soon!",
  };
}

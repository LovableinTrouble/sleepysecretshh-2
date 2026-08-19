/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

// Your Cloudflare Worker URL
const WORKER_URL = "https://workers.dev";

interface Input {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

function safeFileName(title: string, quality: string, ext: string): string {
  const safe = title
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
  return `${safe}_${quality}.${ext}`;
}

function extFromUrl(url: string): "mp4" | "hls" | "mkv" | "file" {
  const u = url.toLowerCase();
  if (u.includes(".mkv")) return "mkv";
  if (u.includes(".mp4")) return "mp4";
  return "file";
}

function qualityLabel(q: any): string {
  const n = Number(q);
  if (Number.isFinite(n) && n > 0) {
    if (n >= 2160) return "4K";
    return `${n}p`;
  }
  return String(q || "HD");
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  try {
    // 1. Map out the correct path routing parameter strings
    const path =
      input.type === "show"
        ? `/tv/${input.tmdbId}?season=${input.season ?? 1}&episode=${input.episode ?? 1}`
        : `/movie/${input.tmdbId}`;

    // 2. Fetch directly from your Worker without using a disruptive local Node timeout handle
    const res = await fetch(`${WORKER_URL}${path}`, {
      method: "GET",
    });

    if (!res.ok) {
      throw new Error(`Worker metadata request failed with status: ${res.status}`);
    }

    const json: any = await res.json();
    const links: any[] = Array.isArray(json?.downloads) ? json.downloads : [];

    const downloads: DownloadItem[] = links
      .filter((l: any) => l?.url)
      .map((l: any, i: number) => {
        const q = qualityLabel(l.quality);
        const ext = extFromUrl(String(l.url));
        const originalUrl = String(l.url);

        const providerName = String(l.source || l.server || "").toLowerCase();

        // 3. TARGETED INTERCEPTION: Selectively proxy Bollyflix links while preserving UHD links
        const finalUrl = providerName.includes("bolly")
          ? `${WORKER_URL}?proxy=${encodeURIComponent(originalUrl)}`
          : originalUrl;

        return {
          id: `streamrip-${i}-${originalUrl.slice(0, 40)}`,
          url: finalUrl,
          source: String(l.source || l.server || "Direct"),
          quality: q,
          type: ext,
          size: l.size ? String(l.size) : undefined,
          fileName: safeFileName(input.title, q, ext === "file" ? "mp4" : ext),
        };
      });

    return { ok: true, downloads, subtitles: [] };
  } catch (e) {
    // This logs cleanly to your terminal window where npm run dev is running
    console.error("TANSTACK SERVER HANDLER EXCEPTION:", e);

    return {
      ok: false,
      downloads: [],
      subtitles: [],
      error: (e as Error)?.message || "Failed to process downloads",
    };
  }
}

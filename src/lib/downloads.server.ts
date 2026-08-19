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
  return "file"; // Match your downloads.ts type definitions safely
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
    // 1. Properly format the subpath parameters
    const path =
      input.type === "show"
        ? `/tv/${input.tmdbId}?season=${input.season ?? 1}&episode=${input.episode ?? 1}`
        : `/movie/${input.tmdbId}`;

    // 2. Fetch directly from your Worker without external macro-task interruptions
    const res = await fetch(`${WORKER_URL}${path}`, {
      method: "GET",
    });

    if (!res.ok) {
      // Return a plain literal object instead of throwing or using json() wrappers
      return {
        ok: false,
        downloads: [],
        subtitles: [],
        error: `Worker API returned HTTP error status: ${res.status}`,
      };
    }

    const workerJson: any = await res.json();
    const links: any[] = Array.isArray(workerJson?.downloads) ? workerJson.downloads : [];

    const downloads: DownloadItem[] = links
      .filter((l: any) => l?.url)
      .map((l: any, i: number) => {
        const q = qualityLabel(l.quality);
        const ext = extFromUrl(String(l.url));
        const originalUrl = String(l.url);

        const providerName = String(l.source || l.server || "").toLowerCase();

        // 3. Selective worker extraction for Bollyflix nodes
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

    // 4. Return a clean object literal. TanStack Start parses this safely across the client boundary.
    return { ok: true, downloads, subtitles: [] };
  } catch (e) {
    console.error("--- SERVER TRACE CAUGHT ---", e);

    // Fallback object literal preventing the Nitro HTML dump crash loop
    return {
      ok: false,
      downloads: [],
      subtitles: [],
      error: (e as Error)?.message || "Internal server transit failure",
    };
  }
}

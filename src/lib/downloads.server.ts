/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

// Points to your worker so it handles metadata bypass and targeted routing
const BASE = "https://workers.dev";

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
    const path =
      input.type === "show"
        ? `/tv/${input.tmdbId}?season=${input.season ?? 1}&episode=${input.episode ?? 1}`
        : `/movie/${input.tmdbId}`;

    // Fix: Standard timeout implementation robust across Node/Nitro server runtimes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // 1. Fetch metadata JSON through the Cloudflare Worker to avoid HTML blocks
    const res = await fetch(`${BASE}${path}`, {
      method: "GET",
      signal: controller.signal,
    });

    // Clear timeout loop upon resolution
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Worker metadata failure status: ${res.status}`);
    }

    const json: any = await res.json();
    const links: any[] = Array.isArray(json?.downloads) ? json.downloads : [];

    const downloads: DownloadItem[] = links
      .filter((l: any) => l?.url)
      .map((l: any, i: number) => {
        const q = qualityLabel(l.quality);
        const ext = extFromUrl(String(l.url));
        const originalUrl = String(l.url);

        // Identify provider from server or source payload variables
        const providerName = String(l.source || l.server || "").toLowerCase();

        // 2. TARGETED ROUTING: Only append proxy parameter to flagged provider paths
        const finalUrl = providerName.includes("bolly")
          ? `${BASE}?proxy=${encodeURIComponent(originalUrl)}`
          : originalUrl;

        return {
          id: `streamrip-${i}-${originalUrl.slice(0, 40)}`,
          url: finalUrl,
          source: String(l.source || l.server || "Direct"),
          quality: q,
          type: ext, // Matches "mp4" | "hls" | "mkv" | "file" template definitions
          size: l.size ? String(l.size) : undefined,
          fileName: safeFileName(input.title, q, ext === "file" ? "mp4" : ext),
        };
      });

    return { ok: true, downloads, subtitles: [] };
  } catch (e) {
    // Crucial: Log error trace inside your local Node/Vite server terminal so you see it
    console.error("CRITICAL EXCEPTION RUNNING RESOLVE_DOWNLOAD_PROVIDERS:", e);

    return {
      ok: false, // Changed to false to signify proper failure status
      downloads: [],
      subtitles: [],
      error: (e as Error)?.message || "Failed to process downloads",
    };
  }
}

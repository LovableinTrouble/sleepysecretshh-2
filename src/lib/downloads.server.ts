/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

// Directly fetch metadata from the stable API endpoint
const BASE = "https://streamrip.fun";

// Your targeted safety proxy worker URL
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

function extFromUrl(url: string): "mp4" | "mkv" | "file" {
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

    const res = await fetch(`${BASE}${path}`, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`streamrip API failed: ${res.status}`);
    const json: any = await res.json();

    // Map through the downloads array found in your payload
    const links: any[] = Array.isArray(json?.downloads) ? json.downloads : [];
    const downloads: DownloadItem[] = links
      .filter((l: any) => l?.url)
      .map((l: any, i: number) => {
        const q = qualityLabel(l.quality);
        const ext = extFromUrl(String(l.url));

        const originalUrl = String(l.url);

        // Read provider name from either 'source' or 'server' fields based on your JSON structure
        const providerName = String(l.source || l.server || "").toLowerCase();

        // Target array containing providers triggering upstream 403 blocks
        const blockedProviders = ["bolly", "moviesdrive", "hdhub"];

        // Check if providerName contains any of our blocked keywords
        const needsProxy = blockedProviders.some((provider) => providerName.includes(provider));

        // CONDITIONAL INTERCEPTION: Wrap URL in proxy string only if provider is flagged
        const finalUrl = needsProxy ? `${WORKER_URL}?proxy=${encodeURIComponent(originalUrl)}` : originalUrl;

        return {
          id: `streamrip-${i}-${originalUrl.slice(0, 40)}`,
          url: finalUrl,
          source: l.source || l.server || "Direct",
          quality: q,
          type: ext,
          size: l.size ? String(l.size) : undefined,
          fileName: safeFileName(input.title, q, ext === "file" ? "mp4" : ext),
        };
      });

    return { ok: true, downloads, subtitles: [] };
  } catch (e) {
    return {
      ok: true,
      downloads: [],
      subtitles: [],
      error: (e as Error)?.message || "Failed to process downloads",
    };
  }
}

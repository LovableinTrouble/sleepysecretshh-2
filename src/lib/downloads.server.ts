/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

// Your Cloudflare Worker URL
const WORKER_URL = "https://round-bread-8638.slinkingalt.workers.dev";

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
    // 1. Build the path safely without embedding literal raw ? characters mid-string
    const cleanPath = input.type === "show" ? `/tv/${input.tmdbId}` : `/movie/${input.tmdbId}`;

    // 2. Leverage URLSearchParams to pass queries safely through the Nitro/Vinxi boundary
    const query = new URLSearchParams();
    if (input.type === "show") {
      query.set("season", String(input.season ?? 1));
      query.set("episode", String(input.episode ?? 1));
    }

    const queryString = query.toString();
    const finalRequestUrl = `${WORKER_URL}${cleanPath}${queryString ? "?" + queryString : ""}`;

    // 3. Make the backend fetch request to your functional worker
    const res = await fetch(finalRequestUrl, {
      method: "GET",
    });

    // Check if the worker sent back HTML or failed
    const contentType = res.headers.get("content-type");
    if (!res.ok || (contentType && contentType.includes("text/html"))) {
      const errorText = await res.text();
      console.error("Worker failed or returned HTML instead of JSON:", errorText.slice(0, 300));
      throw new Error(`Proxy target returned invalid status/format: ${res.status}`);
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

        // 4. INTERCEPTION FILTER: Target Bollyflix nodes while leaving UHD links direct
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
    // This logs cleanly directly into your terminal window where 'npm run dev' is running
    console.error("--- FIXED TANSTACK SERVER HANDLER EXCEPTION ---");
    console.error(e);
    console.error("------------------------------------------------");

    // CRITICAL: We return a clean JSON object instead of re-throwing the error
    // This prevents TanStack Start from hijacking the thread and generating an HTML error page!
    return {
      ok: false,
      downloads: [],
      subtitles: [],
      error: (e as Error)?.message || "Failed to process downloads",
    };
  }
}

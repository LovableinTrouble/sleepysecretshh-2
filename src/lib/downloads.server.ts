/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from "@tanstack/start"; // CRITICAL: Import TanStack's native json response helper
import type { DownloadItem, DownloadsResult } from "./downloads";

const WORKER_URL = "https://round-bread-8638.slinkingalt.workers.dev/";

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

// Fixed: Enforce fallback values to guarantee compliance with the frontend union type definition
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

export async function resolveDownloadProviders(input: Input): Promise<any> {
  try {
    const path =
      input.type === "show"
        ? `/tv/${input.tmdbId}?season=${input.season ?? 1}&episode=${input.episode ?? 1}`
        : `/movie/${input.tmdbId}`;

    // Query your verified worker
    const res = await fetch(`${WORKER_URL}${path}`, {
      method: "GET",
    });

    if (!res.ok) {
      // Wrap the failure directly in a native response payload to prevent Nitro from rendering HTML
      return json({
        ok: false,
        downloads: [],
        subtitles: [],
        error: `Worker API returned HTTP Error status: ${res.status}`,
      });
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

        // Selective worker extraction for Bollyflix nodes
        const finalUrl = providerName.includes("bolly")
          ? `${WORKER_URL}?proxy=${encodeURIComponent(originalUrl)}`
          : originalUrl;

        return {
          id: `streamrip-${i}-${originalUrl.slice(0, 40)}`,
          url: finalUrl,
          source: String(l.source || l.server || "Direct"),
          quality: q,
          type: ext, // Fully compliant with "mp4" | "hls" | "mkv" | "file"
          size: l.size ? String(l.size) : undefined,
          fileName: safeFileName(input.title, q, ext === "file" ? "mp4" : ext),
        };
      });

    // CRITICAL: Deliver the successful payload safely through the RPC serialization bridge
    return json({ ok: true, downloads, subtitles: [] });
  } catch (e) {
    console.error("--- SERVER TRACE CAUGHT ---", e);

    // CRITICAL: We return a clean json structure instead of throwing.
    // This blocks TanStack Start from crashing the execution lane and dumping HTML error templates.
    return json({
      ok: false,
      downloads: [],
      subtitles: [],
      error: (e as Error)?.message || "Internal server transit failure",
    });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

const BASE = "https://downloads.shegu.xyz";

interface Input {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

function safeFileName(title: string, quality: string, ext: string): string {
  const safe = title.replace(/[^a-zA-Z0-9]+/g, " ").trim().replace(/\s+/g, "_");
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
        ? `/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
        : `/movie/${input.tmdbId}`;
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`shegu ${res.status}`);
    const json: any = await res.json();
    const links: any[] = Array.isArray(json?.links) ? json.links : [];

    const downloads: DownloadItem[] = links
      .filter((l: any) => l?.url)
      .map((l: any, i: number) => {
        const q = qualityLabel(l.quality);
        const ext = extFromUrl(String(l.url));
        return {
          id: `shegu-${i}-${String(l.url).slice(0, 40)}`,
          url: String(l.url),
          source: String(l.source || l.provider || "Direct"),
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
      error: (e as Error)?.message || "Failed to fetch downloads",
    };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

const BASE = "https://trendimovies.com";
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://trendimovies.com/",
};

interface Input {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

interface RawLink {
  url: string;
  quality: string;
  size: string | null;
  type: "mkv";
  active: boolean;
}

async function fetchPage(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`trendimovies ${res.status}`);
  return res.text();
}

function unwrap(v: any): any {
  if (Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1)) return v[1];
  return v;
}

function extractLinks(propsJson: string): RawLink[] {
  try {
    const parsed = JSON.parse(propsJson);
    const rawLinks = parsed?.links?.[1];
    if (!Array.isArray(rawLinks)) return [];
    return rawLinks
      .map((item: any) => item?.[1])
      .filter((l: any) => l && typeof l === "object")
      .map((l: any) => ({
        url: unwrap(l.url),
        quality: unwrap(l.quality) || "HD",
        size: unwrap(l.file_size) || null,
        type: "mkv" as const,
        active: unwrap(l.is_active) !== false,
      }))
      .filter((l: RawLink) => l.url && l.active);
  } catch {
    return [];
  }
}

function parseLinks(html: string): RawLink[] {
  // Find any props="..." block that contains a links array with quality entries.
  const re = /props="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    if (raw.includes("&quot;links&quot;") && raw.includes("&quot;quality&quot;") && raw.includes("&quot;url&quot;")) {
      return extractLinks(raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
    }
  }
  return [];
}

function safeFileName(title: string, quality: string): string {
  const safe = title.replace(/[^a-zA-Z0-9]+/g, " ").trim().replace(/\s+/g, "_");
  return `${safe}_${quality}.mkv`;
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  try {
    const path =
      input.type === "show"
        ? `/tv/${input.tmdbId}?season=${input.season ?? 1}&episode=${input.episode ?? 1}`
        : `/movie/${input.tmdbId}`;
    const html = await fetchPage(path);
    const links = parseLinks(html);
    const downloads: DownloadItem[] = links.map((l, i) => ({
      id: `trendi-${i}-${l.url.slice(0, 40)}`,
      url: l.url,
      source: "TrendiMovies",
      quality: l.quality,
      type: "mkv",
      size: l.size || undefined,
      fileName: safeFileName(input.title, l.quality),
    }));
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

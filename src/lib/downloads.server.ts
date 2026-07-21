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

// trendimovies serializes values as [flag, value] tuples.
function unwrap(v: any): any {
  if (Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1)) return v[1];
  return v;
}

function decodeProps(raw: string): string {
  return raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function findPropsBlock(html: string, predicate: (decoded: string) => boolean): any | null {
  const re = /props="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const decoded = decodeProps(m[1]);
    if (predicate(decoded)) {
      try {
        return JSON.parse(decoded);
      } catch {
        /* skip malformed */
      }
    }
  }
  return null;
}

function extractLinks(rawLinks: any): RawLink[] {
  if (!Array.isArray(rawLinks)) return [];
  return rawLinks
    .map((item: any) => unwrap(item?.[1] ?? item))
    .filter((l: any) => l && typeof l === "object")
    .map((l: any) => ({
      url: unwrap(l.url),
      quality: unwrap(l.quality) || "HD",
      size: unwrap(l.file_size) || null,
      type: "mkv" as const,
      active: unwrap(l.is_active) !== false,
    }))
    .filter((l: RawLink) => l.url && l.active);
}

function toDownloads(links: RawLink[], title: string, prefix: string): DownloadItem[] {
  return links.map((l, i) => ({
    id: `${prefix}-${i}-${l.url.slice(0, 40)}`,
    url: l.url,
    source: "TrendiMovies",
    quality: l.quality,
    type: "mkv",
    size: l.size || undefined,
    fileName: safeFileName(title, l.quality),
  }));
}

function parseMovieLinks(html: string): RawLink[] {
  // Movies embed a "links" array directly in the props.
  const parsed = findPropsBlock(html, (d) => d.includes('"links"') && d.includes('"quality"') && d.includes('"url"'));
  if (!parsed?.links) return [];
  return extractLinks(parsed.links);
}

function parseTvLinks(html: string, season: number, episode: number): RawLink[] {
  // TV pages embed episodesBySeason + downloadsByEpisode (keyed by episode id).
  const parsed = findPropsBlock(html, (d) => d.includes('"episodesBySeason"') && d.includes('"downloadsByEpisode"'));
  if (!parsed) return [];

  const bySeason = parsed.episodesBySeason;
  if (!bySeason || typeof bySeason !== "object") return [];
  const seasonKey = String(season);
  const eps = unwrap(bySeason[seasonKey]);
  if (!Array.isArray(eps)) return [];

  // Find the episode object whose episode_number matches.
  const ep = eps
    .map((e: any) => unwrap(e?.[1] ?? e))
    .find((e: any) => Number(unwrap(e.episode_number)) === episode);
  if (!ep) return [];

  const episodeId = unwrap(ep.id);
  if (episodeId == null) return [];

  const dlByEp = parsed.downloadsByEpisode;
  if (!dlByEp || typeof dlByEp !== "object") return [];
  const rawLinks = unwrap(dlByEp[String(episodeId)]);
  return extractLinks(rawLinks);
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
    const links =
      input.type === "show"
        ? parseTvLinks(html, input.season ?? 1, input.episode ?? 1)
        : parseMovieLinks(html);
    const downloads = toDownloads(
      links,
      input.title,
      input.type === "show" ? `trendi-s${input.season ?? 1}e${input.episode ?? 1}` : "trendi",
    );
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

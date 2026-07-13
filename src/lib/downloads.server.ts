/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

interface Input {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

function inferType(url: string, format?: string): DownloadItem["type"] {
  const fmt = (format || "").toUpperCase();
  if (fmt === "MP4") return "mp4";
  if (fmt === "MKV") return "mkv";
  if (fmt === "MOV") return "mp4";
  const lower = url.toLowerCase();
  if (lower.includes(".mp4")) return "mp4";
  if (lower.includes(".mkv")) return "mkv";
  if (lower.includes(".mov")) return "mp4";
  if (lower.includes(".m3u8")) return "hls";
  return "file";
}

function fileNameFrom(title: string, quality: string, type: DownloadItem["type"]): string {
  const ext = type === "mkv" ? "mkv" : type === "hls" ? "m3u8" : "mp4";
  const safe = title.replace(/[^a-zA-Z0-9]+/g, " ").trim().replace(/\s+/g, "_");
  return `${safe}_${quality}.${ext}`;
}

function toItem(
  url: string,
  source: string,
  title: string,
  quality: string,
  size?: string,
  format?: string,
): DownloadItem | null {
  if (!url) return null;
  const type = inferType(url, format);
  return {
    id: `${source}-${url.slice(0, 60)}`,
    url,
    source,
    quality: quality || "Auto",
    type,
    size: size || undefined,
    fileName: fileNameFrom(title, quality, type),
  };
}

/* ============================================================
 * Vyla provider — uses VYLA_API_KEY env var, falls back to
 * the public key "public_api_key" which has access to the
 * /api/downloads/* endpoints (standard tier required for
 * downloads, public key may return 403 — in that case we
 * return null gracefully).
 * API docs: https://github.com/vyla-entertainment/docs
 * ============================================================ */

async function providerVyla(input: Input): Promise<DownloadItem[] | null> {
  let key: string | undefined;
  try {
    key = process.env.VYLA_API_KEY?.trim();
  } catch {
    /* no-op */
  }
  if (!key) key = "public_api_key";

  const path =
    input.type === "show"
      ? `/api/downloads/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `/api/downloads/movie/${input.tmdbId}`;

  try {
    const res = await fetch(`https://api.vyla.cc${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": UA,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = Array.isArray(data?.downloads) ? data.downloads : [];
    const downloads = raw
      .map((d: any) =>
        toItem(
          String(d?.url || ""),
          "Vyla",
          input.title,
          String(d?.quality || "Auto"),
          d?.size ? String(d.size) : undefined,
          d?.format ? String(d.format) : undefined,
        ),
      )
      .filter(Boolean) as DownloadItem[];
    return downloads.length ? downloads : null;
  } catch {
    return null;
  }
}

/* ============================================================
 * AutoEmbed provider — fetches direct stream/download sources
 * from autoembed.cc API. Returns mp4/m3u8 URLs when available.
 * ============================================================ */

async function providerAutoEmbed(input: Input): Promise<DownloadItem[] | null> {
  const bases = ["https://tom.autoembed.cc", "https://autoembed.cc"];
  const path =
    input.type === "show"
      ? `/api/getVideoSource?type=tv&id=${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `/api/getVideoSource?type=movie&id=${input.tmdbId}`;

  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const sources: any[] = Array.isArray(data?.videoSource)
        ? data.videoSource
        : Array.isArray(data?.sources)
          ? data.sources
          : data?.url
            ? [{ url: data.url, quality: data.quality }]
            : [];
      const downloads = sources
        .map((s: any) =>
          toItem(
            String(s?.url || ""),
            "AutoEmbed",
            input.title,
            String(s?.quality || s?.label || "Auto"),
            s?.size ? String(s.size) : undefined,
            s?.format ? String(s.format) : undefined,
          ),
        )
        .filter(Boolean) as DownloadItem[];
      if (downloads.length) return downloads;
    } catch {
      /* try next base */
    }
  }
  return null;
}

/* ============================================================
 * RgShows provider — fetches direct download links from
 * api.rgshows.me by TMDB ID.
 * ============================================================ */

async function providerRgShows(input: Input): Promise<DownloadItem[] | null> {
  const url =
    input.type === "show"
      ? `https://api.rgshows.me/main/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `https://api.rgshows.me/main/movie/${input.tmdbId}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = Array.isArray(data?.downloads) ? data.downloads : Array.isArray(data) ? data : [];
    const downloads = raw
      .map((d: any) =>
        toItem(
          String(d?.url || ""),
          "RgShows",
          input.title,
          String(d?.quality || "Auto"),
          d?.size ? String(d.size) : undefined,
          d?.format ? String(d.format) : undefined,
        ),
      )
      .filter(Boolean) as DownloadItem[];
    return downloads.length ? downloads : null;
  } catch {
    return null;
  }
}

/* ============================================================
 * Aggregator — runs all providers in parallel, dedupes by URL.
 * ============================================================ */

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  const providers = [providerVyla, providerAutoEmbed, providerRgShows];
  const results = await Promise.allSettled(providers.map((p) => p(input)));

  const seen = new Set<string>();
  const downloads: DownloadItem[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    for (const item of result.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      downloads.push(item);
    }
  }

  return {
    ok: true,
    downloads,
    subtitles: [],
  };
}

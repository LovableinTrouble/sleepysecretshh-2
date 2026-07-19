/* eslint-disable @typescript-eslint/no-explicit-any */
// Stream providers — scrapes HLS/MP4 stream URLs from multiple free streaming
// APIs using TMDB IDs. All stream URLs are routed through the /api/public/iptv-proxy
// endpoint which adds permissive CORS headers and forwards the correct
// Referer/Origin so the browser can actually play them.

export interface ScrapedStream {
  source: string;
  label: string;
  url: string;
  quality: string;
  type: "hls" | "mp4";
  headers?: Record<string, string>;
}

export interface ProviderInfo {
  name: string;
  nickname: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const TMDB_KEY = "aa8db17cefbe569dc21a8809090b7b93";

function inferType(url: string): "hls" | "mp4" {
  const lower = url.toLowerCase();
  // Check both the path and any query param values for media extensions
  // (some URLs use vid1.php?url=...m3u8 which returns either HLS or MP4)
  if (/\.m3u8/i.test(lower)) return "hls";
  if (/\.mp4|\.webm|\.mkv/i.test(lower)) return "mp4";
  // vid1.php?url=/vid/... paths typically return MP4 data
  if (/\/vid\//i.test(lower)) return "mp4";
  return "mp4";
}

function qualityGuess(text: string): string {
  if (/2160|4k/i.test(text)) return "4K";
  if (/1080/i.test(text)) return "1080p";
  if (/720/i.test(text)) return "720p";
  if (/480/i.test(text)) return "480p";
  if (/360/i.test(text)) return "360p";
  return "Auto";
}

// Route a stream URL through the iptv-proxy with optional custom referer.
// This solves the two main playback problems:
//  1. CORS — the proxy adds Access-Control-Allow-Origin: *
//  2. Referer/Origin checks — the proxy forwards the correct headers
// For HLS playlists, the proxy also rewrites all internal URIs to flow
// through itself, so segments and keys work transparently.
function proxiedUrl(rawUrl: string, referer?: string): string {
  const params = new URLSearchParams();
  params.set("url", rawUrl);
  if (referer) params.set("ref", referer);
  return `/api/public/iptv-proxy?${params.toString()}`;
}

// --- TMDB lookup helper ---
async function tmdbLookup(tmdbId: string, type: "movie" | "tv") {
  const res = await fetch(
    `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    title: (data.title || data.name || "") as string,
    year: ((data.release_date || data.first_air_date || "") as string).split("-")[0],
    imdbId: (data.external_ids?.imdb_id || "") as string,
  };
}

// ============================================================
// Provider: Vidlink — encrypts TMDB ID, fetches HLS playlist from API
// The playlist URL is a direct m3u8 that works through the proxy.
// ============================================================
async function vidlink(
  tmdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<ScrapedStream[]> {
  try {
    const encRes = await fetch(
      `https://enc-dec.app/api/enc-vidlink?text=${encodeURIComponent(tmdbId)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!encRes.ok) return [];
    const encData = await encRes.json();
    const encoded = encData?.result;
    if (!encoded) return [];

    const apiUrl =
      type === "tv"
        ? `https://vidlink.pro/api/b/tv/${encoded}/${season ?? 1}/${episode ?? 1}?multiLang=0`
        : `https://vidlink.pro/api/b/movie/${encoded}?multiLang=0`;

    const apiRes = await fetch(apiUrl, {
      headers: { "User-Agent": UA, Referer: "https://vidlink.pro" },
      signal: AbortSignal.timeout(8000),
    });
    if (!apiRes.ok) return [];
    const data = await apiRes.json();

    const streams: ScrapedStream[] = [];
    // HLS playlist — the only reliably playable format from Vidlink
    const playlist = data?.stream?.playlist;
    if (playlist && typeof playlist === "string") {
      streams.push({
        source: "Vidlink",
        label: "Vidlink HLS",
        url: proxiedUrl(String(playlist), "https://vidlink.pro"),
        quality: "Auto",
        type: "hls",
      });
    }
    return streams;
  } catch {
    return [];
  }
}

// ============================================================
// Provider: NoTorrent — Stremio addon, returns HLS/MP4 via IMDb ID
// The Voxzer HLS streams and hostingersite MP4s are directly playable.
// Worker URLs and 111477.xyz are filtered out (premium redirects / CF 403).
// ============================================================
async function notorrent(
  tmdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<ScrapedStream[]> {
  try {
    const info = await tmdbLookup(tmdbId, type);
    if (!info?.imdbId) return [];

    const apiUrl =
      type === "tv" && season != null
        ? `https://addon-osvh.onrender.com/stream/series/${info.imdbId}:${season}:${episode ?? 1}.json`
        : `https://addon-osvh.onrender.com/stream/movie/${info.imdbId}.json`;

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = Array.isArray(data?.streams) ? data.streams : [];

    const streams: ScrapedStream[] = [];
    for (const item of raw) {
      if (item.externalUrl || !item.url) continue;
      const url = String(item.url);
      // Skip non-media URLs
      if (url.includes("github.com") || url.includes("googleusercontent")) continue;
      // Skip premium-redirect workers
      if (/notorrent2\.workers\.dev/i.test(url)) continue;
      // Skip Cloudflare-protected proxy URLs
      if (/111477\.xyz/i.test(url)) continue;
      // Only keep direct media URLs (m3u8, mp4, or /vid/ paths)
      const isMedia = /\.(m3u8|mp4|mkv|webm)(\?|$)/i.test(url) || /\/vid\//i.test(url);
      if (!isMedia) continue;

      streams.push({
        source: "NoTorrent",
        label: `NoTorrent ${item.name || "Stream"}`,
        url: proxiedUrl(url),
        quality: qualityGuess(String(item.name || item.title || "")),
        type: inferType(url),
      });
    }
    return streams;
  } catch {
    return [];
  }
}

// ============================================================
// Provider: VidSrc.cc — returns direct m3u8 from embed page
// ============================================================
async function vidsrc(
  tmdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<ScrapedStream[]> {
  try {
    const path =
      type === "tv"
        ? `https://vidsrc.cc/v2/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`
        : `https://vidsrc.cc/v2/movie/${tmdbId}`;
    const res = await fetch(path, {
      headers: { "User-Agent": UA, Referer: "https://vidsrc.cc/" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const m3u8Match = html.match(/https?:\/\/[^"'\s>]+\.m3u8[^"'\s>]*/i);
    if (!m3u8Match) return [];
    return [
      {
        source: "VidSrc",
        label: "VidSrc HLS",
        url: proxiedUrl(m3u8Match[0], "https://vidsrc.cc/"),
        quality: "Auto",
        type: "hls",
      },
    ];
  } catch {
    return [];
  }
}

// ============================================================
// Provider registry
// ============================================================
export const PROVIDERS: { name: string; nickname: string; fetch: typeof vidlink }[] = [
  { name: "notorrent", nickname: "NoTorrent", fetch: notorrent },
  { name: "vidlink", nickname: "Vidlink", fetch: vidlink },
  { name: "vidsrc", nickname: "VidSrc", fetch: vidsrc },
];

export function listProviders(): ProviderInfo[] {
  return PROVIDERS.map((p) => ({ name: p.name, nickname: p.nickname }));
}

export async function scrapeProvider(
  providerName: string,
  tmdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<ScrapedStream[]> {
  const provider = PROVIDERS.find((p) => p.name === providerName);
  if (!provider) return [];
  try {
    return await provider.fetch(tmdbId, type, season, episode);
  } catch {
    return [];
  }
}

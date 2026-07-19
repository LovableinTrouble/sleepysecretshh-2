/* eslint-disable @typescript-eslint/no-explicit-any */
// Stream providers — scrapes HLS/MP4 stream URLs from multiple free streaming
// APIs using TMDB IDs. Each provider returns an array of stream objects with
// direct playable URLs. Based on the Inside4ndroid/TMDB-Embed-API provider logic.

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
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".m3u8")) return "hls";
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
// Provider: Vidlink — encrypts TMDB ID, fetches playlist from API
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
    // Direct qualities (mp4)
    const qualities = data?.stream?.qualities;
    if (qualities && typeof qualities === "object") {
      for (const [q, info] of Object.entries(qualities)) {
        const url = (info as any)?.url;
        if (url) {
          streams.push({
            source: "Vidlink",
            label: `Vidlink ${q}`,
            url: String(url),
            quality: q,
            type: inferType(String(url)),
            headers: { Referer: "https://vidlink.pro" },
          });
        }
      }
    }
    // Playlist (HLS)
    const playlist = data?.stream?.playlist;
    if (playlist) {
      streams.push({
        source: "Vidlink",
        label: "Vidlink HLS",
        url: String(playlist),
        quality: "Auto",
        type: "hls",
        headers: { Referer: "https://vidlink.pro" },
      });
    }
    return streams;
  } catch {
    return [];
  }
}

// ============================================================
// Provider: NoTorrent — Stremio addon, returns HLS streams via IMDb ID
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
      if (url.includes("github.com") || url.includes("googleusercontent")) continue;
      streams.push({
        source: "NoTorrent",
        label: `NoTorrent ${item.name || "Stream"}`,
        url,
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
// Provider: Vixsrc — direct HLS from vixsrc.to
// ============================================================
async function vixsrc(
  tmdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<ScrapedStream[]> {
  try {
    const path =
      type === "tv"
        ? `https://vixsrc.to/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`
        : `https://vixsrc.to/movie/${tmdbId}`;
    const res = await fetch(path, {
      headers: { "User-Agent": UA, Referer: "https://vixsrc.to/" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // Extract m3u8 URL from the page
    const m3u8Match = html.match(/https?:\/\/[^"'\s>]+\.m3u8[^"'\s>]*/i);
    if (!m3u8Match) return [];
    return [
      {
        source: "Vixsrc",
        label: "Vixsrc HLS",
        url: m3u8Match[0],
        quality: "Auto",
        type: "hls",
        headers: { Referer: "https://vixsrc.to/" },
      },
    ];
  } catch {
    return [];
  }
}

// ============================================================
// Provider: Videasy — resolves title via TMDB, fetches from videasy API
// ============================================================
async function videasy(
  tmdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<ScrapedStream[]> {
  try {
    const info = await tmdbLookup(tmdbId, type);
    if (!info?.title) return [];

    const servers = [
      { name: "Neon", url: "https://api.videasy.net/myflixerzupcloud/sources-with-title" },
      { name: "Cypher", url: "https://api.videasy.net/moviebox/sources-with-title" },
      { name: "Reyna", url: "https://api.videasy.net/primewire/sources-with-title" },
    ];

    const streams: ScrapedStream[] = [];
    const typeParam = type === "tv" ? "series" : "movie";
    const titleEnc = encodeURIComponent(info.title).replace(/%20/g, "+");

    for (const server of servers) {
      try {
        const params = new URLSearchParams({
          type: typeParam,
          title: titleEnc,
          year: info.year || "",
        });
        if (type === "tv") {
          params.set("season", String(season ?? 1));
          params.set("episode", String(episode ?? 1));
        }
        const res = await fetch(`${server.url}?${params}`, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json",
            Origin: "https://player.videasy.net",
            Referer: "https://player.videasy.net/",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.sources && Array.isArray(data.sources)) {
          for (const s of data.sources) {
            if (s?.url) {
              streams.push({
                source: `Videasy ${server.name}`,
                label: `Videasy ${server.name} ${s.quality || ""}`.trim(),
                url: String(s.url),
                quality: s.quality || qualityGuess(String(s.url)),
                type: inferType(String(s.url)),
              });
            }
          }
        }
        if (streams.length > 0) break;
      } catch {}
    }
    return streams;
  } catch {
    return [];
  }
}

// ============================================================
// Provider: Vidfast — direct HLS from vidfast.vc
// ============================================================
async function vidfast(
  tmdbId: string,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
): Promise<ScrapedStream[]> {
  try {
    const path =
      type === "tv"
        ? `https://vidfast.vc/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`
        : `https://vidfast.vc/movie/${tmdbId}`;
    const res = await fetch(path, {
      headers: { "User-Agent": UA, Referer: "https://vidfast.vc/" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const m3u8Match = html.match(/https?:\/\/[^"'\s>]+\.m3u8[^"'\s>]*/i);
    if (!m3u8Match) return [];
    return [
      {
        source: "Vidfast",
        label: "Vidfast HLS",
        url: m3u8Match[0],
        quality: "Auto",
        type: "hls",
        headers: { Referer: "https://vidfast.vc/" },
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
  { name: "vidlink", nickname: "Vidlink", fetch: vidlink },
  { name: "notorrent", nickname: "NoTorrent", fetch: notorrent },
  { name: "vixsrc", nickname: "Vixsrc", fetch: vixsrc },
  { name: "videasy", nickname: "Videasy", fetch: videasy },
  { name: "vidfast", nickname: "Vidfast", fetch: vidfast },
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

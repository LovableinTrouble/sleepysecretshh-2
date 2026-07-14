/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stream aggregator using Vyla's scraper logic.
 * Each source returns { url, allUrls, headers, subtitles }.
 * Sources run in parallel; first valid HLS wins for the primary source.
 */
import CryptoJS from "crypto-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StreamQuality {
  url: string;
  label: string;
  quality: string;
  format: "hls" | "mp4" | "mkv" | "unknown";
  headers?: Record<string, string>;
  size?: string;
  resolution?: number;
}
export interface StreamSubtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}
export interface DirectSource {
  kind: "direct";
  id: string;
  name: string;
  badge: string;
  qualities: StreamQuality[];
  subtitles: StreamSubtitle[];
}
export interface EmbedSource {
  kind: "embed";
  id: string;
  name: string;
  badge: string;
  url: string;
}
export type ResolvedSource = DirectSource | EmbedSource;
export interface ResolveInput {
  tmdbId: string;
  title: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}
export interface ResolveResult {
  sources: ResolvedSource[];
  primary?: string;
}

// ─── Shared helpers (ported from Vyla) ────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchJson(url: string, options?: any): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function fetchText(url: string, options?: any): Promise<string> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ─── TMDB info cache ──────────────────────────────────────────────────────────

const TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const tmdbInfoCache = new Map<string, { val: any; ts: number; ttl: number }>();

function cacheGet(cache: Map<string, { val: any; ts: number; ttl: number }>, key: string) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= entry.ttl) { cache.delete(key); return undefined; }
  return entry.val;
}
function cacheSet(cache: Map<string, { val: any; ts: number; ttl: number }>, key: string, val: any, ttl: number) {
  cache.set(key, { val, ts: Date.now(), ttl });
}

async function getTmdbInfo(tmdbId: string, mediaType: string, season?: number) {
  const key = `${tmdbId}-${mediaType}-${season || ""}`;
  const cached = cacheGet(tmdbInfoCache, key);
  if (cached !== undefined) return cached;
  try {
    const [mainRes, seasonRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`, { signal: AbortSignal.timeout(5000) }),
      season && mediaType === "tv" ? fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_KEY}`, { signal: AbortSignal.timeout(5000) }) : Promise.resolve(null),
    ]);
    let mainData: any = null, seasonData: any = null;
    if (mainRes.ok) mainData = await mainRes.json();
    if (seasonRes && seasonRes.ok) seasonData = await seasonRes.json();
    const genres = mainData?.genres || [];
    const isAnime = genres.some((g: any) => g.id === 16) && ((mainData?.origin_country || []).includes("JP") || mainData?.original_language === "ja");
    const titles: string[] = [];
    if (seasonData?.name) titles.push(seasonData.name);
    const t = mainData?.title || mainData?.name || "";
    const ot = mainData?.original_title || mainData?.original_name || "";
    if (t) titles.push(t);
    if (ot && ot !== t) titles.push(ot);
    const dateStr = seasonData?.air_date || mainData?.release_date || mainData?.first_air_date || "";
    const result = {
      isAnime, titles: [...new Set(titles.filter(Boolean))],
      year: dateStr ? parseInt(dateStr.slice(0, 4), 10) : null,
      imdbId: mainData?.imdb_id || mainData?.external_ids?.imdb_id || null,
    };
    cacheSet(tmdbInfoCache, key, result, 600000);
    return result;
  } catch { return { isAnime: false, titles: [] as string[], year: null, imdbId: null }; }
}

function inferFormat(url: string, type?: string): StreamQuality["format"] {
  const t = (type || "").toLowerCase();
  if (t === "hls" || t === "m3u8") return "hls";
  if (t === "mp4") return "mp4";
  if (t === "dash" || t === "mkv") return "unknown";
  const l = url.toLowerCase();
  if (l.includes(".m3u8")) return "hls";
  if (l.includes(".mp4")) return "mp4";
  if (l.includes(".mkv")) return "mkv";
  if (l.includes(".mpd")) return "unknown";
  return "unknown";
}

function parseResolution(label: string): number {
  const m = String(label).match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── Source: VidSrc (vsembed.ru) ──────────────────────────────────────────────

async function srcVidsrc(id: string, s?: number, e?: number): Promise<StreamQuality[]> {
  const BASE_URL = "https://vsembed.ru";
  const HEADERS = { "User-Agent": UA, Referer: `${BASE_URL}/` };
  const PLAYER_DOMAINS: Record<string, string> = {
    "{v1}": "neonhorizonworkshops.com", "{v2}": "wanderlynest.com",
    "{v3}": "orchidpixelgardens.com", "{v4}": "cloudnestra.com",
  };
  const PROXY_HEADERS = { "User-Agent": UA, Referer: "https://cloudnestra.com/", Origin: "https://cloudnestra.com", Accept: "*/*" };

  function extractM3u8(html: string): string[] | null {
    const idx = html.indexOf("file:");
    if (idx === -1) return null;
    const start = html.indexOf('"', idx) + 1;
    const end = html.indexOf('"', start);
    const fileField = html.slice(start, end);
    const urls: string[] = [];
    for (const template of fileField.split(/\s+or\s+/i)) {
      let url = template;
      for (const [p, d] of Object.entries(PLAYER_DOMAINS)) url = url.replace(p, d);
      if (!url.includes("{") && !url.includes("}")) urls.push(url);
    }
    return urls.length ? urls : null;
  }

  try {
    const html1 = await fetchText(
      s ? `${BASE_URL}/embed/tv?tmdb=${id}&season=${s}&episode=${e}` : `${BASE_URL}/embed/movie?tmdb=${id}`,
      { headers: HEADERS, signal: AbortSignal.timeout(7000) },
    );
    let rcpUrl = html1.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
    if (!rcpUrl) return [];
    if (rcpUrl.startsWith("//")) rcpUrl = "https:" + rcpUrl;
    const html2 = await fetchText(rcpUrl, { headers: { Referer: `${BASE_URL}/` }, signal: AbortSignal.timeout(7000) });
    const prorcpMatch = html2.match(/src:\s*['"]([^'"]*\/prorcp\/[^'"]+)['"]/i)?.[1];
    const playerUrl = prorcpMatch
      ? (prorcpMatch.startsWith("http") ? prorcpMatch : rcpUrl.slice(0, rcpUrl.indexOf("/", rcpUrl.indexOf("//") + 2)) + prorcpMatch)
      : rcpUrl.replace("/rcp/", "/prorcp/");
    const html3 = await fetchText(playerUrl, { headers: { Referer: rcpUrl }, signal: AbortSignal.timeout(7000) });
    let urls = extractM3u8(html3);
    if (!urls) {
      const apiSrc = html3.match(/src=["']([^"']*\/e\/[^"']+)["']/i)?.[1]
        ?? html3.match(/src=["']([^"']*\/embed[^"']+)["']/i)?.[1]
        ?? html3.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
      if (!apiSrc) return [];
      const html4 = await fetchText(new URL(apiSrc, playerUrl).href, { headers: { Referer: playerUrl }, signal: AbortSignal.timeout(7000) });
      urls = extractM3u8(html4);
    }
    return urls?.map((u) => ({ url: u, label: "Auto", quality: "Auto", format: "hls" as const, headers: PROXY_HEADERS })) ?? [];
  } catch { return []; }
}

// ─── Source: VidLink ──────────────────────────────────────────────────────────

async function srcVidlink(id: string, s?: number, e?: number): Promise<StreamQuality[]> {
  const BASE = "https://vidlink.pro";
  const HEADERS = { "User-Agent": UA, Origin: BASE, Referer: `${BASE}/` };
  try {
    const encData = await fetchJson(`https://enc-dec.app/api/enc-vidlink?text=${id}`, { signal: AbortSignal.timeout(6000) });
    if (encData?.status !== 200 || !encData?.result) return [];
    const data = await fetchJson(
      s ? `${BASE}/api/b/tv/${encData.result}/${s}/${e || 1}` : `${BASE}/api/b/movie/${encData.result}`,
      { headers: HEADERS, signal: AbortSignal.timeout(10000) },
    );
    const stream = data?.stream;
    if (!stream) return [];
    if (stream.type === "file" && stream.qualities) {
      for (const q of ["1080", "720", "480", "360"]) {
        if (stream.qualities[q]?.url) return [{ url: stream.qualities[q].url, label: `${q}p`, quality: q, format: "mp4" as const }];
      }
      const first = stream.qualities[Object.keys(stream.qualities)[0]];
      return first?.url ? [{ url: first.url, label: "Auto", quality: "Auto", format: "mp4" as const }] : [];
    }
    if (stream.playlist) return [{ url: stream.playlist, label: "Auto", quality: "Auto", format: "hls" as const }];
    return [];
  } catch { return []; }
}

// ─── Source: VidFast ──────────────────────────────────────────────────────────

async function srcVidfast(id: string, s?: number, e?: number): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const API_BASE = "https://enc-dec.app/api";
  const DOMAIN = "https://vidfast.vc";
  const HEADERS = { "User-Agent": UA, Referer: `${DOMAIN}/`, "X-Requested-With": "XMLHttpRequest" };
  try {
    const embedUrl = s != null && e != null ? `${DOMAIN}/tv/${id}/${s}/${e}/` : `${DOMAIN}/movie/${id}/`;
    const html = await fetchText(embedUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
    const match = html.match(/\\"en\\":\\"(.*?)\\"/) || html.match(/"en":"(.*?)"/);
    if (!match?.[1]) return { qualities: [], subtitles: [] };
    const encData = await fetchJson(`${API_BASE}/enc-vidfast?text=${encodeURIComponent(match[1])}`, { signal: AbortSignal.timeout(6000) });
    if (encData.status !== 200 || !encData.result) return { qualities: [], subtitles: [] };
    const { servers: serversUrl, stream: streamUrl, token } = encData.result;
    const reqHeaders = { ...HEADERS, "X-CSRF-Token": token };
    const serversEncrypted = await fetchText(serversUrl, { method: "POST", headers: reqHeaders, signal: AbortSignal.timeout(8000) });
    const decServersData = await fetchJson(`${API_BASE}/dec-vidfast`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: serversEncrypted }), signal: AbortSignal.timeout(8000) });
    if (decServersData.status !== 200 || !decServersData.result) return { qualities: [], subtitles: [] };
    const results = await Promise.allSettled(
      decServersData.result.map(async (srv: any) => {
        const streamEncrypted = await fetchText(`${streamUrl}/${srv.data}`, { method: "POST", headers: reqHeaders, signal: AbortSignal.timeout(8000) });
        const decStreamData = await fetchJson(`${API_BASE}/dec-vidfast`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: streamEncrypted }), signal: AbortSignal.timeout(8000) });
        if (decStreamData.status !== 200 || !decStreamData.result?.url) throw new Error();
        const subs: StreamSubtitle[] = (decStreamData.result.captions || []).map((c: any) => ({
          url: c.file, language: c.label || "en", label: String(c.label || "EN").toUpperCase(), type: "vtt" as const,
        }));
        return { url: decStreamData.result.url, label: `VidFast ${srv.name || ""}`.trim(), quality: "Auto", format: inferFormat(decStreamData.result.url), subtitles: subs };
      }),
    );
    const qualities: StreamQuality[] = [];
    const subtitles: StreamSubtitle[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") { qualities.push(r.value); if (r.value.subtitles) subtitles.push(...r.value.subtitles); }
    }
    return { qualities, subtitles };
  } catch { return { qualities: [], subtitles: [] }; }
}

// ─── Source: VidEasy (Wings/Cineby API with enc-dec bridge) ───────────────────

async function srcVideasy(id: string, s?: number, e?: number): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const WINGS_BASE = "https://api.wingsdatabase.com";
  const HEADERS = { Accept: "*/*", Origin: "https://player.videasy.to", Referer: "https://player.videasy.to/", "User-Agent": UA };
  const SERVERS = [
    { id: "jett", name: "Jett" }, { id: "cdn", name: "Yoru" }, { id: "tejo", name: "Tejo" },
    { id: "neon2", name: "Neon" }, { id: "ym", name: "Sage" }, { id: "m4uhd", name: "Breach" },
    { id: "hdmovie", name: "Vyse" }, { id: "lamovie", name: "Omen" },
  ];
  try {
    const isTv = s != null && e != null;
    const info = await getTmdbInfo(id, isTv ? "tv" : "movie", s);
    if (!info?.titles?.length) return { qualities: [], subtitles: [] };
    const seedData = await fetchJson(`${WINGS_BASE}/seed?mediaId=${id}`, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
    const seed = seedData?.seed;
    if (!seed) return { qualities: [], subtitles: [] };
    const encTitle = encodeURIComponent(encodeURIComponent(info.titles[0]));

    const settled = await Promise.allSettled(SERVERS.map(async (srv) => {
      if (srv.id === "cdn" && isTv) throw new Error();
      let url = `${WINGS_BASE}/${srv.id}/sources-with-title?title=${encTitle}&mediaType=${isTv ? "tv" : "movie"}&year=${info.year || ""}&tmdbId=${id}&imdbId=${info.imdbId || "tt0000000"}&enc=2&seed=${seed}`;
      if (isTv) url += `&episodeId=${e}&seasonId=${s}`;
      const encText = await fetchText(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      const decJson = await fetchJson("https://enc-dec.app/api/dec-videasy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: encText, id: String(id), seed }), signal: AbortSignal.timeout(10000),
      });
      if (decJson.status !== 200 || !decJson.result) throw new Error();
      let sourcesArray: any[] = [];
      let subsArray: StreamSubtitle[] = [];
      if (Array.isArray(decJson.result)) sourcesArray = decJson.result;
      else if (decJson.result.sources) {
        sourcesArray = decJson.result.sources;
        if (decJson.result.subtitles) subsArray = decJson.result.subtitles.map((sub: any) => ({
          url: sub.url || sub.file, language: sub.language || sub.lang || sub.label || "en",
          label: String(sub.label || sub.language || "EN").toUpperCase(), type: "vtt" as const,
        })).filter((sub: any) => sub.url);
      } else sourcesArray = [decJson.result];
      return sourcesArray.map((res: any) => {
        const streamUrl = res.url || res.file || res.link || res.playlist || res.stream;
        return streamUrl ? { url: streamUrl, label: `VidEasy ${srv.name}`, quality: res.quality || "Auto", format: inferFormat(streamUrl), subtitles: subsArray } : null;
      }).filter(Boolean);
    }));

    const qualities: StreamQuality[] = [];
    const subtitles: StreamSubtitle[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) {
        for (const q of r.value) { qualities.push(q); if (q.subtitles) subtitles.push(...q.subtitles); }
      }
    }
    return { qualities, subtitles };
  } catch { return { qualities: [], subtitles: [] }; }
}

// ─── Source: VidCore ──────────────────────────────────────────────────────────

async function srcVidcore(id: string, s?: number, e?: number): Promise<StreamQuality[]> {
  const API_BASE = "https://enc-dec.app/api";
  const HEADERS = { "User-Agent": UA, Referer: "https://vidcore.net/", "X-Requested-With": "XMLHttpRequest" };
  try {
    const html = await fetchText(s != null ? `https://vidcore.net/tv/${id}/${s}/${e}/` : `https://vidcore.net/movie/${id}/`, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
    const match = html.match(/\\"en\\":\\"(.*?)\\"/) || html.match(/"en":"(.*?)"/);
    if (!match?.[1]) return [];
    const encData = await fetchJson(`${API_BASE}/enc-vidcore?text=${encodeURIComponent(match[1])}`, { signal: AbortSignal.timeout(6000) });
    if (!encData?.result) return [];
    const { servers: serversUrl, stream: streamUrl, token } = encData.result;
    const reqHeaders = { ...HEADERS, "X-CSRF-Token": token };
    const serversEncrypted = await fetchText(serversUrl, { method: "POST", headers: reqHeaders, signal: AbortSignal.timeout(8000) });
    const decData = await fetchJson(`${API_BASE}/dec-vidcore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: serversEncrypted }), signal: AbortSignal.timeout(8000) });
    if (!decData?.result) return [];
    const results = await Promise.allSettled(decData.result.map(async (srv: any) => {
      const streamEncrypted = await fetchText(`${streamUrl}/${srv.data}`, { method: "POST", headers: reqHeaders, signal: AbortSignal.timeout(8000) });
      const decStreamData = await fetchJson(`${API_BASE}/dec-vidcore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: streamEncrypted }), signal: AbortSignal.timeout(8000) });
      const url = decStreamData?.result?.url;
      if (!url) throw new Error();
      return { url, label: `VidCore ${srv.name || ""}`.trim(), quality: "Auto", format: inferFormat(url) };
    }));
    const qualities: StreamQuality[] = [];
    for (const r of results) if (r.status === "fulfilled") qualities.push(r.value);
    return qualities;
  } catch { return []; }
}

// ─── Source: LookMovie ────────────────────────────────────────────────────────

async function srcLookmovie(id: string, s?: number, e?: number): Promise<StreamQuality[]> {
  const LM_DOMAINS = ["https://www.lookmovie2.to", "https://lookmovie2.to", "https://lookmovie.foundation"];
  const HEADERS_BASE = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" };
  try {
    const isTV = s != null && e != null;
    const typeStr = isTV ? "shows" : "movies";
    const tmdbData = await fetchJson(`${"https://api.themoviedb.org/3"}/${isTV ? "tv" : "movie"}/${id}?api_key=${TMDB_KEY}`, { signal: AbortSignal.timeout(3000) });
    const title = tmdbData?.title || tmdbData?.name;
    const year = (tmdbData?.first_air_date || tmdbData?.release_date || "").slice(0, 4);
    if (!title) return [];
    let match: any = null, base = "";
    for (const b of LM_DOMAINS) {
      try {
        const data = await fetchJson(`${b}/api/v1/${typeStr}/do-search/?q=${encodeURIComponent(title)}`, { headers: { ...HEADERS_BASE, Accept: "application/json", Referer: `${b}/`, "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(4000) });
        const results = data?.result;
        if (results?.length) {
          match = results.find((r: any) => String(r.year) === String(year)) ?? results.find((r: any) => r.title?.toLowerCase() === title.toLowerCase()) ?? results[0];
          if (match) { base = b; break; }
        }
      } catch {}
    }
    if (!match?.slug) return [];
    const html = await fetchText(`${base}/${typeStr}/play/${match.slug}`, { headers: { ...HEADERS_BASE, Accept: "text/html", Referer: `${base}/` }, signal: AbortSignal.timeout(8000) });
    const storageMatch = html.match(/window\[['"](?:movie|show)_storage['"]\]\s*=\s*\{([^}]+)\}/s);
    if (!storageMatch) return [];
    const hashMatch = storageMatch[1].match(/hash\s*:\s*['"]([^'"]+)['"]/);
    const expiresMatch = storageMatch[1].match(/expires\s*:\s*(\d+)/);
    if (!hashMatch || !expiresMatch) return [];
    const streamId = isTV
      ? (html.match(new RegExp(`data-season=["']${s}["'][^>]*?data-episode=["']${e}["'][^>]*?data-id=["'](\\d+)["']`, "i"))?.[1])
      : (match.id_movie || html.match(/['"]?id_movie['"]?\s*[:=]\s*['"]?(\d+)['"]?/i)?.[1]);
    if (!streamId) return [];
    const data = await fetchJson(`${base}/api/v1/security/${isTV ? "episode" : "movie"}-access?id_${isTV ? "episode" : "movie"}=${streamId}&hash=${hashMatch[1]}&expires=${expiresMatch[1]}`, { headers: { ...HEADERS_BASE, Accept: "application/json", Referer: `${base}/`, "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(8000) });
    const streams = data?.streams ?? data?.result?.streams ?? data?.data?.streams ?? data;
    const allUrls = Object.entries(streams || {}).filter(([, v]) => typeof v === "string" && (v as string).includes(".m3u8")).map(([quality, url]) => ({ url: url as string, label: quality, quality, format: "hls" as const }));
    return allUrls;
  } catch { return []; }
}

// ─── Source: KissKH ───────────────────────────────────────────────────────────

async function srcKisskh(id: string, s?: number, e?: number): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const ENC_API = "https://enc-dec.app/api";
  const BASE = "https://kisskh.do";
  const HEADERS = { "User-Agent": UA, Accept: "application/json" };
  function cleanTitle(t: string) { return t ? t.toLowerCase().replace(/\(\d{4}\)/g, "").replace(/[^a-z0-9]/g, "") : ""; }
  try {
    const info = await getTmdbInfo(id, s ? "tv" : "movie", s);
    if (!info) return { qualities: [], subtitles: [] };
    let drama: any = null, bestScore = -1;
    for (const title of (info.titles.length > 1 ? [...info.titles].reverse() : info.titles)) {
      const results = await fetchJson(`${BASE}/api/DramaList/Search?q=${encodeURIComponent(title)}`, { headers: HEADERS, signal: AbortSignal.timeout(6000) }).catch(() => []);
      const targetClean = cleanTitle(title);
      for (const item of results || []) {
        const parts = (item.title || "").split(/\s*-\s*/).map(cleanTitle);
        let score = 0;
        if (parts.some((p: string) => p === targetClean)) score += 5;
        else if (parts.some((p: string) => p.includes(targetClean) || targetClean.includes(p))) score += 3;
        else continue;
        if (score > bestScore) { bestScore = score; drama = item; }
      }
      if (drama && bestScore >= 5) break;
    }
    if (!drama) return { qualities: [], subtitles: [] };
    const detail = await fetchJson(`${BASE}/api/DramaList/Drama/${drama.id}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    const episodeId = detail?.episodes?.find((ep: any) => Math.floor(ep.number) === Number(e || 1))?.id;
    if (!episodeId) return { qualities: [], subtitles: [] };
    const vidKeyData = await fetchJson(`${ENC_API}/enc-kisskh?text=${episodeId}&type=vid`, { signal: AbortSignal.timeout(6000) });
    const vidKey = vidKeyData?.status === 200 ? vidKeyData.result : null;
    if (!vidKey) return { qualities: [], subtitles: [] };
    const videoData = await fetchJson(`${BASE}/api/DramaList/Episode/${episodeId}.png?err=false&ts=&time=&kkey=${vidKey}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!videoData?.Video) return { qualities: [], subtitles: [] };
    const subtitles: StreamSubtitle[] = [];
    const subKeyData = await fetchJson(`${ENC_API}/enc-kisskh?text=${episodeId}&type=sub`, { signal: AbortSignal.timeout(6000) });
    if (subKeyData?.status === 200 && subKeyData.result) {
      try {
        const subList = await fetchJson(`${BASE}/api/Sub/${episodeId}?kkey=${subKeyData.result}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        if (Array.isArray(subList)) subtitles.push(...subList.map((sub: any) => ({
          url: sub.src, language: sub.land || "en", label: String(sub.label || sub.land || "EN").toUpperCase(), type: "vtt" as const,
        })));
      } catch {}
    }
    return { qualities: [{ url: videoData.Video, label: "KissKH", quality: "Auto", format: inferFormat(videoData.Video) }], subtitles };
  } catch { return { qualities: [], subtitles: [] }; }
}

// ─── Source: VidBolt (Flaxmovies + VidRock) ───────────────────────────────────

async function srcVidbolt(id: string, s?: number, e?: number): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const BASE_URL = "https://vidbolt.xyz";
  const HEADERS = { "User-Agent": UA, Referer: `${BASE_URL}/`, Origin: BASE_URL, Accept: "*/*" };

  function extractStreamData(obj: any, results: any[] = []): any[] {
    if (!obj) return results;
    if (Array.isArray(obj)) { for (const item of obj) extractStreamData(item, results); }
    else if (typeof obj === "object") {
      const url = obj.url || obj.file || obj.link || obj.src;
      if (typeof url === "string" && url.startsWith("http") && (url.includes(".m3u8") || url.includes(".mp4") || url.includes(".mkv") || url.includes("proxy/file"))) {
        results.push({ url, quality: obj.quality || obj.label || obj.resolution || "Auto" });
      }
      for (const v of Object.values(obj)) { if (typeof v === "object" && v !== null) extractStreamData(v, results); }
    }
    return results;
  }

  try {
    const isTv = s != null && e != null;
    const info = await getTmdbInfo(id, isTv ? "tv" : "movie");
    if (!info?.imdbId) return { qualities: [], subtitles: [] };
    const title = encodeURIComponent(info.titles[0] || "");
    const year = info.year || "";
    const imdbId = info.imdbId.replace("tt", "");
    let path = `/scrape/Flaxmovies/${isTv ? "tv" : "movie"}/tt${imdbId}?tmdbId=${id}&title=${title}&year=${year}`;
    if (isTv) path += `&season=${s}&episode=${e}`;
    const data = await fetchJson(`${BASE_URL}/api/proxy?path=${encodeURIComponent(path)}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) }).catch(() => null);
    const streams = data ? extractStreamData(data) : [];
    const seen = new Set<string>();
    const qualities: StreamQuality[] = [];
    for (const stream of streams) {
      if (seen.has(stream.url)) continue;
      seen.add(stream.url);
      qualities.push({ url: stream.url, label: `VidBolt ${stream.quality}`, quality: stream.quality, format: inferFormat(stream.url) });
    }
    return { qualities, subtitles: [] };
  } catch { return { qualities: [], subtitles: [] }; }
}

// ─── Source: OpStream ─────────────────────────────────────────────────────────

async function srcOpstream(id: string, s?: number, e?: number): Promise<StreamQuality[]> {
  const BASE_URL = "https://opstream.fun";
  const HEADERS = { "User-Agent": UA, Accept: "application/x-ndjson; charset=utf-8", Referer: `${BASE_URL}/`, Origin: BASE_URL };
  try {
    const isTv = s != null && e != null;
    const info = await getTmdbInfo(id, isTv ? "tv" : "movie");
    if (!info?.titles?.length || !info.imdbId) return [];
    const params = new URLSearchParams({ type: isTv ? "tv" : "movie", tmdbId: id, title: info.titles[0], year: info.year || "", imdbId: info.imdbId, dash: "1", progress: "1" });
    if (isTv) { params.append("season", String(s)); params.append("episode", String(e)); }
    const res = await fetch(`${BASE_URL}/api/resolve?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const text = await res.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        if (json.t === "done" && json.data?.url) {
          let finalUrl = json.data.url;
          if (finalUrl.includes("?u=")) {
            const uParam = new URL(finalUrl, BASE_URL).searchParams.get("u");
            if (uParam) finalUrl = atob(uParam);
          } else if (!finalUrl.startsWith("http")) finalUrl = `${BASE_URL}${finalUrl}`;
          return [{ url: finalUrl, label: "OpStream", quality: "Auto", format: inferFormat(finalUrl, json.data.kind) }];
        }
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ─── Source: PurStream ────────────────────────────────────────────────────────

async function srcPurstream(id: string, s?: number, e?: number): Promise<StreamQuality[]> {
  const API_BASE = "https://api.purstream.club/api/v1";
  const DOMAIN = "https://purstream.club";
  const HEADERS = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: `${DOMAIN}/`, Origin: DOMAIN, "X-Requested-With": "XMLHttpRequest" };
  try {
    const isTv = s != null;
    const info = await getTmdbInfo(id, isTv ? "tv" : "movie");
    if (!info?.titles?.length) return [];
    const searchData = await fetchJson(`${API_BASE}/search-bar/search/${encodeURIComponent(info.titles[0])}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const items = searchData?.data?.items?.movies?.items || [];
    const type = isTv ? "tv" : "movie";
    const lowerTitle = info.titles[0].toLowerCase();
    let match = items.find((item: any) => item.type === type && item.title?.toLowerCase() === lowerTitle && (!info.year || item.release_date?.startsWith(String(info.year))));
    if (!match) match = items.find((item: any) => item.type === type);
    if (!match?.id) return [];
    const streamUrl = isTv ? `${API_BASE}/stream/${match.id}/episode?season=${s}&episode=${e}` : `${API_BASE}/stream/${match.id}`;
    const json = await fetchJson(streamUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const sources = json?.data?.items?.sources;
    if (json?.type !== "success" || !Array.isArray(sources) || !sources.length) return [];
    const chosen = sources.find((src: any) => src.stream_url);
    if (!chosen?.stream_url) return [];
    return [{ url: chosen.stream_url, label: `PurStream ${chosen.source_name || ""}`.trim(), quality: chosen.source_name || "Auto", format: inferFormat(chosen.stream_url, chosen.format) }];
  } catch { return []; }
}

// ─── Subtitle fetcher (sub.vdrk.site) ─────────────────────────────────────────

const SUBTITLE_BASES = ["https://sub.vdrk.site/v1", "https://sub.vdrk.site/v2"];

async function fetchSubtitles(id: string, s?: number, e?: number): Promise<StreamSubtitle[]> {
  const paths = s != null && e != null
    ? [{ base: SUBTITLE_BASES[0], path: `/tv/${id}/${s}/${e}` }, { base: SUBTITLE_BASES[1], path: `/tv/${id}/${s}/${e}` }]
    : [{ base: SUBTITLE_BASES[0], path: `/movie/${id}` }, { base: SUBTITLE_BASES[1], path: `/movie/${id}` }];

  try {
    const results = await Promise.all(paths.map(async ({ base, path }) => {
      try {
        const res = await fetch(`${base}${path}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return [];
        const data = await res.json();
        if (base.includes("/v2")) {
          return (Array.isArray(data) ? data : []).map((x: any) => ({
            url: x.file || x.url, language: String(x.label || "en").toLowerCase(), label: String(x.label || "EN").toUpperCase(), type: "vtt" as const,
          }));
        }
        return (Array.isArray(data) ? data : []).map((x: any) => ({
          url: x.file || x.url, language: String(x.label || "en").toLowerCase(), label: String(x.label || "EN").toUpperCase(), type: "vtt" as const,
        }));
      } catch { return []; }
    }));
    const all = results.flat();
    const seen = new Set<string>();
    return all.filter((s) => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });
  } catch { return []; }
}

// ─── Embed source builders ─────────────────────────────────────────────────────

function mkEmbed(id: string, name: string, badge: string, url: string): EmbedSource {
  return { kind: "embed", id, name, badge, url };
}

function buildEmbeds(i: ResolveInput): EmbedSource[] {
  const isShow = i.type !== "movie";
  const tv = (base: string) => `${base}/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  const sources: EmbedSource[] = [];

  sources.push(mkEmbed("nebula", "Nebula", "Cinezo",
    isShow ? `https://player.cinezo.live/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}` : `https://player.cinezo.live/embed/movie/${i.tmdbId}`));
  sources.push(mkEmbed("photon2", "Photon", "Vidlink",
    isShow ? `https://vidlink.pro/tv/${tv("")}?primaryColor=6366f1&autoplay=true&nextbutton=true` : `https://vidlink.pro/movie/${i.tmdbId}?primaryColor=6366f1&autoplay=true`));
  sources.push(mkEmbed("quasar2", "Quasar", "Videasy",
    isShow ? `https://player.videasy.net/tv/${tv("")}?color=6366f1&autoPlay=true` : `https://player.videasy.net/movie/${i.tmdbId}?color=6366f1&autoPlay=true`));
  sources.push(mkEmbed("zenith", "Zenith", "AutoEmbed",
    isShow ? `https://player.autoembed.cc/embed/tv/${tv("")}` : `https://player.autoembed.cc/embed/movie/${i.tmdbId}`));
  sources.push(mkEmbed("orion", "Orion", "2Embed",
    isShow ? `https://www.2embed.cc/embedtv/${i.tmdbId}&s=${i.season ?? 1}&e=${i.episode ?? 1}` : `https://www.2embed.cc/embed/${i.tmdbId}`));
  sources.push(mkEmbed("nova", "Nova", "VidSrc",
    isShow ? `https://vidsrc.to/embed/tv/${tv("")}` : `https://vidsrc.to/embed/movie/${i.tmdbId}`));
  sources.push(mkEmbed("solaris", "Solaris", "EmbedSu",
    isShow ? `https://embed.su/embed/tv/${tv("")}` : `https://embed.su/embed/movie/${i.tmdbId}`));
  sources.push(mkEmbed("prism", "Prism", "SuperEmbed",
    isShow ? `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1&s=${i.season ?? 1}&e=${i.episode ?? 1}` : `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1`));
  sources.push(mkEmbed("helix", "Helix", "VidBinge",
    isShow ? `https://vidbinge.dev/embed/tv/${tv("")}` : `https://vidbinge.dev/embed/movie/${i.tmdbId}`));
  sources.push(mkEmbed("apex", "Apex", "SmashyStream",
    isShow ? `https://player.smashy.stream/tv/${i.tmdbId}?s=${i.season ?? 1}&e=${i.episode ?? 1}` : `https://player.smashy.stream/movie/${i.tmdbId}`));

  return sources;
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveAllSources(input: ResolveInput): Promise<ResolveResult> {
  const id = input.tmdbId;
  const s = input.type === "show" ? input.season : undefined;
  const e = input.type === "show" ? input.episode : undefined;

  // Run all scrapers in parallel
  const [vidsrc, vidlink, vidfast, videasy, vidcore, lookmovie, kisskh, vidbolt, opstream, purstream, subs] = await Promise.allSettled([
    srcVidsrc(id, s, e),
    srcVidlink(id, s, e),
    srcVidfast(id, s, e),
    srcVideasy(id, s, e),
    srcVidcore(id, s, e),
    srcLookmovie(id, s, e),
    srcKisskh(id, s, e),
    srcVidbolt(id, s, e),
    srcOpstream(id, s, e),
    srcPurstream(id, s, e),
    fetchSubtitles(id, s, e),
  ]);

  const unwrap = <T,>(r: PromiseSettledResult<T>): T | null => r.status === "fulfilled" ? r.value : null;

  // Merge all direct sources into a single Alpha Stream with multiple qualities
  const allQualities: StreamQuality[] = [];
  const allSubtitles: StreamSubtitle[] = [];

  const sourcesToMerge: { name: string; result: StreamQuality[] | { qualities: StreamQuality[]; subtitles: StreamSubtitle[] } | null }[] = [
    { name: "VidSrc", result: unwrap(vidsrc) },
    { name: "VidLink", result: unwrap(vidlink) },
    { name: "VidFast", result: unwrap(vidfast) },
    { name: "VidEasy", result: unwrap(videasy) },
    { name: "VidCore", result: unwrap(vidcore) },
    { name: "LookMovie", result: unwrap(lookmovie) },
    { name: "KissKH", result: unwrap(kisskh) },
    { name: "VidBolt", result: unwrap(vidbolt) },
    { name: "OpStream", result: unwrap(opstream) },
    { name: "PurStream", result: unwrap(purstream) },
  ];

  for (const src of sourcesToMerge) {
    if (!src.result) continue;
    const qualities = Array.isArray(src.result) ? src.result : src.result.qualities;
    const subtitles = Array.isArray(src.result) ? [] : src.result.subtitles;
    for (const q of qualities) {
      if (!q.url || allQualities.some((existing) => existing.url === q.url)) continue;
      allQualities.push(q);
    }
    if (subtitles) allSubtitles.push(...subtitles);
  }

  // Add standalone subtitles
  const standaloneSubs = unwrap(subs);
  if (standaloneSubs) allSubtitles.push(...standaloneSubs);

  // Deduplicate subtitles
  const seenSubs = new Set<string>();
  const dedupedSubs = allSubtitles.filter((s) => { if (seenSubs.has(s.url)) return false; seenSubs.add(s.url); return true; });

  // Sort: HLS first, then by resolution
  allQualities.sort((a, b) => {
    if (a.format === "hls" && b.format !== "hls") return -1;
    if (a.format !== "hls" && b.format === "hls") return 1;
    return (b.resolution || 0) - (a.resolution || 0);
  });

  // Build final source list
  const sources: ResolvedSource[] = [];

  if (allQualities.length) {
    sources.push({
      kind: "direct",
      id: "alpha",
      name: "Alpha Stream",
      badge: `${allQualities.length} sources`,
      qualities: allQualities,
      subtitles: dedupedSubs,
    });
  }

  // Add embed sources as fallback
  sources.push(...buildEmbeds(input));

  return { sources, primary: sources[0]?.id };
}

// Remove unused import warning - CryptoJS kept for potential FebBox use
void CryptoJS;

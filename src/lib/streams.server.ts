/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Stream proxy helper ──────────────────────────────────────────────────────
// Browsers cannot set Referer/Origin headers via JS, and most upstream HLS CDNs
// reject requests without the correct referer (403). Route every stream URL
// through our /api/public/iptv-proxy which fetches with the right headers and
// rewrites nested playlist/segment URLs to flow back through the proxy.
function b64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // btoa is available in workerd/Node 18+.
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function proxyUrl(u: string): string {
  return `/api/public/iptv-proxy?u=${b64url(u)}`;
}
function subUrl(u: string): string {
  return `/api/public/subtitle?url=${encodeURIComponent(u)}`;
}

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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function withTimeout(ms: number): AbortSignal | undefined {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}

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

function inferFormat(url: string, type?: string): StreamQuality["format"] {
  const t = (type || "").toLowerCase();
  if (t === "hls" || t === "m3u8") return "hls";
  if (t === "mp4") return "mp4";
  const l = url.toLowerCase();
  if (l.includes(".m3u8")) return "hls";
  if (l.includes(".mp4")) return "mp4";
  if (l.includes(".mkv")) return "mkv";
  return "unknown";
}

// ─── TMDB info ─────────────────────────────────────────────────────────────────

const TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";

async function getTmdbInfo(tmdbId: string, mediaType: string, season?: number) {
  try {
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`;
    const data = await fetchJson(url, { signal: withTimeout(4000) });
    const genres = data?.genres || [];
    const isAnime = genres.some((g: any) => g.id === 16) && ((data?.origin_country || []).includes("JP") || data?.original_language === "ja");
    const titles: string[] = [];
    const t = data?.title || data?.name || "";
    const ot = data?.original_title || data?.original_name || "";
    if (t) titles.push(t);
    if (ot && ot !== t) titles.push(ot);
    const dateStr = data?.release_date || data?.first_air_date || "";
    return {
      isAnime, titles: [...new Set(titles.filter(Boolean))],
      year: dateStr ? parseInt(dateStr.slice(0, 4), 10) : null,
      imdbId: data?.imdb_id || data?.external_ids?.imdb_id || null,
    };
  } catch { return { isAnime: false, titles: [] as string[], year: null, imdbId: null }; }
}

// ─── Source: VidEasy (Wings/Cineby API with enc-dec bridge) ───────────────────
// Tested working: returns direct m3u8 URLs for both movies and TV shows

async function srcVideasy(id: string, s?: number, e?: number): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const WINGS_BASE = "https://api.wingsdatabase.com";
  const HEADERS = { Accept: "*/*", Origin: "https://player.videasy.net", Referer: "https://player.videasy.net/", "User-Agent": UA };
  const SERVERS = [
    { id: "neon2", name: "Neon" },
    { id: "cdn", name: "Yoru" },
  ];
  try {
    const isTv = s != null && e != null;
    const info = await getTmdbInfo(id, isTv ? "tv" : "movie", s);
    if (!info?.titles?.length) return { qualities: [], subtitles: [] };
    const seedData = await fetchJson(`${WINGS_BASE}/seed?mediaId=${id}`, { headers: HEADERS, signal: withTimeout(4000) });
    const seed = seedData?.seed;
    if (!seed) return { qualities: [], subtitles: [] };
    const encTitle = encodeURIComponent(encodeURIComponent(info.titles[0]));

    const settled = await Promise.allSettled(SERVERS.map(async (srv) => {
      if (srv.id === "cdn" && isTv) throw new Error("cdn not for tv");
      let url = `${WINGS_BASE}/${srv.id}/sources-with-title?title=${encTitle}&mediaType=${isTv ? "tv" : "movie"}&year=${info.year || ""}&tmdbId=${id}&imdbId=${info.imdbId || "tt0000000"}&enc=2&seed=${seed}`;
      if (isTv) url += `&episodeId=${e}&seasonId=${s}`;
      const encText = await fetchText(url, { headers: HEADERS, signal: withTimeout(5000) });
      const decJson = await fetchJson("https://enc-dec.app/api/dec-videasy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: encText, id: String(id), seed }), signal: withTimeout(5000),
      });
      if (decJson.status !== 200 || !decJson.result) throw new Error("decrypt failed");
      let sourcesArray: any[] = [];
      let subsArray: StreamSubtitle[] = [];
      const result = typeof decJson.result === "string" ? JSON.parse(decJson.result) : decJson.result;
      if (result.sources) {
        sourcesArray = result.sources;
        if (result.subtitles) subsArray = result.subtitles.map((sub: any) => ({
          url: subUrl(sub.url || sub.file), language: sub.language || sub.lang || "en",
          label: String(sub.label || sub.language || "EN").toUpperCase(), type: "vtt" as const,
        })).filter((sub: any) => !!sub.url);
      } else if (Array.isArray(result)) sourcesArray = result;
      else sourcesArray = [result];
      const items: (StreamQuality & { subtitles?: StreamSubtitle[] })[] = [];
      for (const res of sourcesArray) {
        const streamUrl = res.url || res.file || res.link || res.playlist || res.stream;
        if (!streamUrl) continue;
        items.push({
          url: proxyUrl(streamUrl),
          label: `VidEasy ${srv.name}`,
          quality: res.quality || "Auto",
          format: inferFormat(streamUrl, res.type),
          subtitles: subsArray,
        } as StreamQuality & { subtitles?: StreamSubtitle[] });
      }
      return items;
    }));

    const qualities: StreamQuality[] = [];
    const subtitles: StreamSubtitle[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) {
        for (const q of r.value) {
          qualities.push(q);
          const qSubs = (q as StreamQuality & { subtitles?: StreamSubtitle[] }).subtitles;
          if (qSubs) subtitles.push(...qSubs);
        }
      }
    }
    return { qualities, subtitles };
  } catch { return { qualities: [], subtitles: [] }; }
}

// ─── Source: LookMovie ────────────────────────────────────────────────────────
// Tested working for movies: returns direct m3u8 URLs with quality labels

async function srcLookmovie(id: string, s?: number, e?: number): Promise<StreamQuality[]> {
  const LM_DOMAINS = ["https://lookmovie2.to", "https://lookmovie.foundation"];
  const HEADERS_BASE = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" };
  try {
    const isTV = s != null && e != null;
    const typeStr = isTV ? "shows" : "movies";
    const tmdbData = await fetchJson(`https://api.themoviedb.org/3/${isTV ? "tv" : "movie"}/${id}?api_key=${TMDB_KEY}`, { signal: withTimeout(3000) });
    const title = tmdbData?.title || tmdbData?.name;
    const year = (tmdbData?.first_air_date || tmdbData?.release_date || "").slice(0, 4);
    if (!title) return [];
    let match: any = null, base = "";
    for (const b of LM_DOMAINS) {
      try {
        const data = await fetchJson(`${b}/api/v1/${typeStr}/do-search/?q=${encodeURIComponent(title)}`, { headers: { ...HEADERS_BASE, Accept: "application/json", Referer: `${b}/`, "X-Requested-With": "XMLHttpRequest" }, signal: withTimeout(4000) });
        const results = data?.result;
        if (results?.length) {
          match = results.find((r: any) => String(r.year) === String(year)) ?? results.find((r: any) => r.title?.toLowerCase() === title.toLowerCase()) ?? results[0];
          if (match) { base = b; break; }
        }
      } catch {}
    }
    if (!match?.slug) return [];
    const html = await fetchText(`${base}/${typeStr}/play/${match.slug}`, { headers: { ...HEADERS_BASE, Accept: "text/html", Referer: `${base}/` }, signal: withTimeout(5000) });
    const storageMatch = html.match(/window\[['"](?:movie|show)_storage['"]\]\s*=\s*\{([^}]+)\}/s);
    if (!storageMatch) return [];
    const hashMatch = storageMatch[1].match(/hash\s*:\s*['"]([^'"]+)['"]/);
    const expiresMatch = storageMatch[1].match(/expires\s*:\s*(\d+)/);
    if (!hashMatch || !expiresMatch) return [];
    let streamId: string | undefined;
    if (isTV) {
      const epMatch = html.match(new RegExp(`data-season=["']${s}["'][^>]*?data-episode=["']${e}["'][^>]*?data-id=["'](\\d+)["']`, "i"));
      streamId = epMatch?.[1];
      if (!streamId) {
        const allEps = [...html.matchAll(/data-id=["'](\d+)["'][^>]*?data-season=["'](\d+)["'][^>]*?data-episode=["'](\d+)["']/gi)];
        const found = allEps.find((m) => m[2] === String(s) && m[3] === String(e));
        streamId = found?.[1];
      }
    } else {
      streamId = match.id_movie || html.match(/['"]?id_movie['"]?\s*[:=]\s*['"]?(\d+)['"]?/i)?.[1];
    }
    if (!streamId) return [];
    const accessUrl = `${base}/api/v1/security/${isTV ? "episode" : "movie"}-access?id_${isTV ? "episode" : "movie"}=${streamId}&hash=${hashMatch[1]}&expires=${expiresMatch[1]}`;
    const data = await fetchJson(accessUrl, { headers: { ...HEADERS_BASE, Accept: "application/json", Referer: `${base}/`, "X-Requested-With": "XMLHttpRequest" }, signal: withTimeout(5000) });
    const streams = data?.streams ?? data?.result?.streams ?? data?.data?.streams ?? data;
    const allUrls = Object.entries(streams || {})
      .filter(([, v]) => typeof v === "string" && (v as string).includes(".m3u8"))
      .map(([quality, url]) => ({ url: proxyUrl(url as string), label: `LookMovie ${quality}`, quality, format: "hls" as const }));
    return allUrls;
  } catch { return []; }
}

// ─── Subtitles (sub.vdrk.site) ─────────────────────────────────────────────────

async function fetchSubtitles(id: string, s?: number, e?: number): Promise<StreamSubtitle[]> {
  const isTv = s != null && e != null;
  const paths = isTv
    ? [`https://sub.vdrk.site/v1/tv/${id}/${s}/${e}`, `https://sub.vdrk.site/v2/tv/${id}/${s}/${e}`]
    : [`https://sub.vdrk.site/v1/movie/${id}`, `https://sub.vdrk.site/v2/movie/${id}`];
  try {
    const results = await Promise.all(paths.map(async (url) => {
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA }, signal: withTimeout(4000) });
        if (!res.ok) return [];
        const data = await res.json();
        return (Array.isArray(data) ? data : [])
          .map((x: any) => ({ raw: x.file || x.url, label: String(x.label || "EN") }))
          .filter((x) => !!x.raw)
          .map((x) => ({
            url: subUrl(x.raw), language: x.label.toLowerCase(),
            label: x.label.toUpperCase(), type: "vtt" as const,
          }));
      } catch { return []; }
    }));
    const all = results.flat();
    const seen = new Set<string>();
    return all.filter((s) => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });
  } catch { return []; }
}

// ─── Embed sources ──────────────────────────────────────────────────────────────

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
  sources.push(mkEmbed("prism", "Prism", "SuperEmbed",
    isShow ? `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1&s=${i.season ?? 1}&e=${i.episode ?? 1}` : `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1`));
  sources.push(mkEmbed("helix", "Helix", "VidBinge",
    isShow ? `https://vidbinge.dev/embed/tv/${tv("")}` : `https://vidbinge.dev/embed/movie/${i.tmdbId}`));
  return sources;
}

export function buildEmbedsOnly(input: ResolveInput): ResolveResult {
  const sources = buildEmbeds(input);
  return { sources, primary: sources[0]?.id };
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveAllSources(input: ResolveInput): Promise<ResolveResult> {
  const id = input.tmdbId;
  const s = input.type === "show" ? input.season : undefined;
  const e = input.type === "show" ? input.episode : undefined;

  const embeds = buildEmbeds(input);

  try {
    const [videasyRes, lookmovieRes, subsRes] = await Promise.allSettled([
      srcVideasy(id, s, e),
      srcLookmovie(id, s, e),
      fetchSubtitles(id, s, e),
    ]);

    const allQualities: StreamQuality[] = [];
    const allSubtitles: StreamSubtitle[] = [];

    if (videasyRes.status === "fulfilled") {
      for (const q of videasyRes.value.qualities) {
        if (q.url && !allQualities.some((x) => x.url === q.url)) allQualities.push(q);
      }
      allSubtitles.push(...videasyRes.value.subtitles);
    }
    if (lookmovieRes.status === "fulfilled") {
      for (const q of lookmovieRes.value) {
        if (q.url && !allQualities.some((x) => x.url === q.url)) allQualities.push(q);
      }
    }
    if (subsRes.status === "fulfilled") allSubtitles.push(...subsRes.value);

    const seenSubs = new Set<string>();
    const dedupedSubs = allSubtitles.filter((sub) => { if (seenSubs.has(sub.url)) return false; seenSubs.add(sub.url); return true; });

    allQualities.sort((a, b) => {
      if (a.format === "hls" && b.format !== "hls") return -1;
      if (a.format !== "hls" && b.format === "hls") return 1;
      return (b.resolution || 0) - (a.resolution || 0);
    });

    const sources: ResolvedSource[] = [];
    if (allQualities.length) {
      sources.push({
        kind: "direct", id: "alpha", name: "Alpha Stream",
        badge: `${allQualities.length} sources`,
        qualities: allQualities, subtitles: dedupedSubs,
      });
    }
    sources.push(...embeds);

    return { sources, primary: sources[0]?.id };
  } catch (e) {
    console.error("[resolveAllSources] error:", e);
  }

  return { sources: embeds, primary: embeds[0]?.id };
}

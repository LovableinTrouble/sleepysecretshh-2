/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stream aggregator — resolves TMDB IDs to real HLS/MP4 URLs and
 * generates embed URLs for fallback sources.
 *
 * Direct HLS strategy:
 *   1. Showbox/FebBox pipeline (Showbox API + FebBox CDN) — works without a
 *      user cookie; the share page issues a guest PHPSESSID automatically.
 *      A user-provided FebBox ui-cookie unlocks premium-quality files.
 *   2. More direct providers can be added below.
 *
 * Embed strategy: 12 embed sources as fallback.
 */
import CryptoJS from "crypto-js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StreamQuality {
  url: string;
  label: string;
  quality: string;
  format: "hls" | "mp4" | "mkv" | "unknown";
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
  fileName?: string;
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
  febboxCookie?: string;
}
export interface ResolveResult {
  sources: ResolvedSource[];
  primary?: string;
}

// ─── Showbox / FebBox ─────────────────────────────────────────────────────────

const SB = {
  BASE: "https://mbpapi.shegu.net/api/api_client/index/",
  APP_KEY: "moviebox",
  IV: "wEiphTn!",
  KEY: "123d6cedf626dy54233aa1w6",
  DEFAULTS: {
    childmode: "0",
    app_version: "11.5",
    lang: "en",
    platform: "android",
    channel: "Website",
    appid: "27",
    version: "129",
    medium: "Website",
  },
};

const FB = "https://www.febbox.com";
const FB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const SHARE_HOSTS = [
  "https://www.showbox.media",
  "https://showbox.media",
  "https://www.boxmovie.media",
  "https://boxmovie.media",
  "https://showbox.run",
];

function rndHex(n: number) {
  const c = "0123456789abcdef";
  let r = "";
  for (let i = 0; i < n; i++) r += c[Math.floor(Math.random() * 16)];
  return r;
}
function toB64(v: string) {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(v)));
  const b = new TextEncoder().encode(v);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function encrypt(d: string) {
  return CryptoJS.TripleDES.encrypt(d, CryptoJS.enc.Utf8.parse(SB.KEY), {
    iv: CryptoJS.enc.Utf8.parse(SB.IV),
  }).toString();
}
function verify(enc: string) {
  return CryptoJS.MD5(
    CryptoJS.MD5(SB.APP_KEY).toString() + SB.KEY + enc,
  ).toString();
}

async function sbRequest(module: string, params: Record<string, any> = {}): Promise<any> {
  const payload = {
    ...SB.DEFAULTS,
    expired_date: Math.floor(Date.now() / 1000 + 60 * 60 * 12),
    module,
    ...params,
  };
  const enc = encrypt(JSON.stringify(payload));
  const body = JSON.stringify({
    app_key: CryptoJS.MD5(SB.APP_KEY).toString(),
    verify: verify(enc),
    encrypt_data: enc,
  });
  const form = new URLSearchParams({
    data: toB64(body),
    appid: SB.DEFAULTS.appid,
    platform: SB.DEFAULTS.platform,
    version: SB.DEFAULTS.version,
    medium: SB.DEFAULTS.medium,
  });
  const r = await fetch(SB.BASE, {
    method: "POST",
    headers: {
      Platform: SB.DEFAULTS.platform,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "okhttp/3.2.0",
    },
    body: `${form.toString()}&token${rndHex(32)}`,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`sbRequest ${module}: ${r.status}`);
  return r.json();
}

async function sbSearch(title: string, type: "movie" | "tv"): Promise<any[]> {
  try {
    const d = await sbRequest("Search5", { page: 1, type, keyword: title, pagelimit: 20 });
    return Array.isArray(d?.data) ? d.data : [];
  } catch {
    return [];
  }
}

async function getShareKey(id: number, type: 1 | 2): Promise<string | null> {
  for (const host of SHARE_HOSTS) {
    try {
      const r = await fetch(`${host}/index/share_link?id=${id}&type=${type}`, {
        headers: { "User-Agent": "okhttp/3.2.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const link = d?.data?.link as string | undefined;
      if (link) return link.split("/").pop() || null;
    } catch { /* try next */ }
  }
  return null;
}

function parseCookieHeader(ui?: string): string | undefined {
  const v = (ui || "").trim();
  if (!v) return undefined;
  if (v.toLowerCase().startsWith("cookie:")) return v.slice(7).trim();
  if (v.includes("=")) return v;
  return `ui=${v}`;
}

async function guestSession(shareKey: string, uiCookie?: string): Promise<string | undefined> {
  const base = parseCookieHeader(uiCookie);
  try {
    const r = await fetch(`${FB}/share/${shareKey}`, {
      headers: {
        "user-agent": FB_UA,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });
    const anyH = r.headers as any;
    const setCookies: string[] =
      typeof anyH.getSetCookie === "function"
        ? (anyH.getSetCookie() as string[])
        : (r.headers.get("set-cookie") ? [r.headers.get("set-cookie")!] : []);
    const sess = setCookies
      .map((v) => v.match(/PHPSESSID=([^;\s,]+)/i)?.[1])
      .find(Boolean);
    if (!sess) return base;
    return base ? `${base}; PHPSESSID=${sess}` : `PHPSESSID=${sess}`;
  } catch {
    return base;
  }
}

interface FBFile { fid: number; file_name: string; file_size: number; is_dir: 0 | 1 }

async function fbFileList(shareKey: string, parentId: number, cookie?: string): Promise<FBFile[]> {
  const headers: Record<string, string> = {
    "user-agent": FB_UA,
    "x-requested-with": "XMLHttpRequest",
    referer: `${FB}/share/${shareKey}`,
  };
  if (cookie) headers.cookie = cookie;
  try {
    const r = await fetch(
      `${FB}/file/file_share_list?share_key=${shareKey}&pwd=&parent_id=${parentId}&is_html=0`,
      { headers, signal: AbortSignal.timeout(12000) },
    );
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d?.data?.file_list) ? d.data.file_list : [];
  } catch {
    return [];
  }
}

function parseResolution(label: string): number {
  const m = String(label).match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function inferFormat(url: string): StreamQuality["format"] {
  const l = url.toLowerCase();
  if (l.includes(".m3u8")) return "hls";
  if (l.includes(".mp4")) return "mp4";
  if (l.includes(".mkv")) return "mkv";
  return "unknown";
}

function pickUrl(item: any): string {
  const cands = [
    item?.hls_url, item?.play_url, item?.stream_url,
    item?.url, item?.download_url, item?.file_url, item?.src,
  ];
  for (const c of cands) {
    const v = String(c || "").trim();
    if (v && /^https?:/i.test(v) && v.toLowerCase().includes(".m3u8")) return v;
  }
  for (const c of cands) {
    const v = String(c || "").trim();
    if (v && /^https?:/i.test(v)) return v;
  }
  return "";
}

async function fbLinks(
  shareKey: string,
  fid: number,
  cookie?: string,
): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const headers: Record<string, string> = {
    "user-agent": FB_UA,
    "x-requested-with": "XMLHttpRequest",
    referer: `${FB}/share/${shareKey}`,
  };
  if (cookie) headers.cookie = cookie;

  const qualities: StreamQuality[] = [];
  const subtitles: StreamSubtitle[] = [];
  const seen = new Set<string>();

  const fetchJ = async (url: string) => {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return null;
      const t = await r.text();
      try { return JSON.parse(t); } catch { return { html: t }; }
    } catch { return null; }
  };

  const collectSubs = (data: any) => {
    const fe = Array.isArray(data?.data) ? data.data[0] : (data?.data || {});
    const items = [
      ...(Array.isArray(fe?.subtitle_list) ? fe.subtitle_list : []),
      ...(Array.isArray(data?.subtitle_list) ? data.subtitle_list : []),
    ];
    const guessLang = (v: string) => {
      const l = v.toLowerCase();
      if (l.includes("spa") || l.includes("_es")) return "es";
      if (l.includes("fre") || l.includes("_fr")) return "fr";
      if (l.includes("ger") || l.includes("_de")) return "de";
      if (l.includes("por") || l.includes("_pt")) return "pt";
      if (l.includes("ita") || l.includes("_it")) return "it";
      if (l.includes("jpn") || l.includes("_ja")) return "ja";
      return "en";
    };
    for (const it of items) {
      const u = typeof it === "string" ? it : (it?.url || it?.src || "");
      if (!u) continue;
      const lang = it?.language || guessLang(u);
      subtitles.push({
        url: u,
        language: String(lang).toLowerCase(),
        label: String(it?.label || lang).toUpperCase(),
        type: u.toLowerCase().includes(".vtt") ? "vtt" : "srt",
      });
    }
  };

  const collectQualities = (data: any) => {
    const fe = Array.isArray(data?.data) ? data.data[0] : (data?.data || data || {});
    const rawList = fe.quality_list || fe.transcode_list || data.list || {};
    const items: any[] = Array.isArray(rawList) ? rawList : Object.values(rawList);
    for (const q of items) {
      const url = pickUrl(q) || String(fe?.download_url || "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const label = String(q?.quality || q?.label || "Auto");
      qualities.push({ url, label, quality: label, format: inferFormat(url), size: q?.file_size ? String(q.file_size) : undefined, resolution: parseResolution(label) });
    }
    if (fe?.download_url) {
      const u = String(fe.download_url).trim();
      if (u && !seen.has(u)) {
        seen.add(u);
        qualities.push({ url: u, label: "Original", quality: "ORG", format: inferFormat(u), size: fe.file_size ? String(fe.file_size) : undefined, resolution: 0 });
      }
    }
  };

  const [d1, d2, d3] = await Promise.all([
    fetchJ(`${FB}/file/file_download?fid=${fid}&share_key=${encodeURIComponent(shareKey)}&is_hls=1&is_html=0`),
    fetchJ(`${FB}/console/video_quality_list?fid=${fid}&share_id=${shareKey}&is_hls=1&is_html=0`),
    fetchJ(`${FB}/file/hls_playlist?fid=${fid}&share_key=${shareKey}`),
  ]);

  if (d1) { collectQualities(d1); collectSubs(d1); }
  if (d2) {
    if ((d2 as any).html) {
      const re = /class="file_quality"[^>]*data-url="([^"]*)"[^>]*data-quality="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec((d2 as any).html)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        qualities.push({ url: m[1], label: m[2], quality: m[2], format: inferFormat(m[1]), resolution: parseResolution(m[2]) });
      }
    } else {
      collectQualities(d2); collectSubs(d2);
    }
  }
  if (d3 && !(d3 as any).html) { collectQualities(d3); collectSubs(d3); }

  qualities.sort((a, b) => {
    if (a.format === "hls" && b.format !== "hls") return -1;
    if (a.format !== "hls" && b.format === "hls") return 1;
    return (b.resolution || 0) - (a.resolution || 0);
  });

  return { qualities, subtitles };
}

async function resolveShowboxFebbox(input: ResolveInput): Promise<DirectSource | null> {
  try {
    const type = input.type === "movie" ? "movie" : "tv";
    const results = await sbSearch(input.title, type);
    if (!results.length) return null;

    const norm = input.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const best =
      results.find((r: any) => {
        const t = (r.title || r.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return t === norm;
      }) || results[0];

    const shareKey = await getShareKey(Number(best.id), type === "movie" ? 1 : 2);
    if (!shareKey) return null;

    // Works WITHOUT a user cookie — shareSessionCookie creates a guest PHPSESSID
    const cookie = await guestSession(shareKey, input.febboxCookie);

    let files = await fbFileList(shareKey, 0, cookie);
    if (!files.length) return null;

    let target: FBFile | undefined;
    if (type === "movie") {
      target = files.filter((f) => !f.is_dir).sort((a, b) => b.file_size - a.file_size)[0];
    } else {
      const s = input.season ?? 1;
      const e = input.episode ?? 1;
      const seasonDir = files.find((f) => {
        if (!f.is_dir) return false;
        const n = f.file_name.toLowerCase();
        return (
          n.includes(`season ${s}`) ||
          n.includes(`s${String(s).padStart(2, "0")}`) ||
          n.includes(`season${s}`) ||
          n === `s${s}`
        );
      });
      if (seasonDir) files = await fbFileList(shareKey, seasonDir.fid, cookie);
      const pad = String(e).padStart(2, "0");
      target = files.find((f) => {
        if (f.is_dir) return false;
        const n = f.file_name.toLowerCase();
        return (
          n.includes(`e${pad}`) ||
          n.includes(`episode ${e}`) ||
          n.includes(`ep${pad}`) ||
          n.includes(`.e${pad}.`) ||
          n.includes(`x${pad}`)
        );
      });
      if (!target) {
        const vids = files.filter((f) => !f.is_dir).sort((a, b) => a.file_name.localeCompare(b.file_name));
        target = vids[e - 1] ?? vids[0];
      }
    }
    if (!target) return null;

    const { qualities, subtitles } = await fbLinks(shareKey, target.fid, cookie);
    if (!qualities.length) return null;

    const hasCookie = !!(input.febboxCookie?.trim());
    return {
      kind: "direct",
      id: "alpha",
      name: "Alpha Stream",
      badge: hasCookie ? "FebBox Premium" : "FebBox",
      qualities,
      subtitles,
      fileName: target.file_name,
    };
  } catch (err) {
    console.error("[resolveShowboxFebbox]", err);
    return null;
  }
}

// ─── TMDB → IMDB lookup (needed by some providers) ────────────────────────────

const TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const imdbCache = new Map<string, string>();

async function tmdbToImdb(tmdbId: string, type: "movie" | "show"): Promise<string | null> {
  const cacheKey = `${type}:${tmdbId}`;
  if (imdbCache.has(cacheKey)) return imdbCache.get(cacheKey)!;
  const path = type === "movie" ? "movie" : "tv";
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/${path}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const imdb = d?.imdb_id as string | undefined;
    if (imdb) { imdbCache.set(cacheKey, imdb); return imdb; }
    return null;
  } catch {
    return null;
  }
}

// ─── Embed source builders ─────────────────────────────────────────────────────

function mkEmbed(
  id: string, name: string, badge: string, url: string,
): EmbedSource {
  return { kind: "embed", id, name, badge, url };
}

function buildEmbeds(i: ResolveInput, imdbId: string | null): EmbedSource[] {
  const isShow = i.type !== "movie";
  const tv = (base: string) =>
    `${base}/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  const movie = (base: string) => `${base}/${i.tmdbId}`;

  const sources: EmbedSource[] = [];

  // ── Nebula (Cinezo) ──────────────────────────────────────────────────────────
  {
    const base = isShow
      ? `https://player.cinezo.live/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
      : `https://player.cinezo.live/embed/movie/${i.tmdbId}`;
    const p = new URLSearchParams({
      autoplay: "true", poster: "true", pip: "true",
      episodelist: "true", primarycolor: "6366f1", secondarycolor: "0a0a12",
      iconcolor: "ffffff", setting: "true",
    });
    sources.push(mkEmbed("nebula", "Nebula", "Cinezo", `${base}?${p}`));
  }

  // ── Pulse (VidSrc CC) ────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://vidsrc.cc/v2/embed/tv/${tv("")}?autoPlay=true`
      : `https://vidsrc.cc/v2/embed/movie/${i.tmdbId}?autoPlay=true`;
    sources.push(mkEmbed("pulse", "Pulse", "VidSrc CC", url));
  }

  // ── Vortex (Vidfast) ─────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://vidfast.pro/tv/${tv("")}?autoPlay=true&nextButton=true&autoNext=true&title=true&poster=true`
      : `https://vidfast.pro/movie/${i.tmdbId}?autoPlay=true&title=true&poster=true`;
    sources.push(mkEmbed("vortex", "Vortex", "Vidfast", url));
  }

  // ── Photon (Vidlink) ─────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://vidlink.pro/tv/${tv("")}?primaryColor=6366f1&autoplay=true&nextbutton=true`
      : `https://vidlink.pro/movie/${i.tmdbId}?primaryColor=6366f1&autoplay=true`;
    sources.push(mkEmbed("photon", "Photon", "Vidlink", url));
  }

  // ── Quasar (Videasy) ─────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://player.videasy.net/tv/${tv("")}?color=6366f1&autoPlay=true&nextEpisode=true&episodeSelector=true`
      : `https://player.videasy.net/movie/${i.tmdbId}?color=6366f1&autoPlay=true`;
    sources.push(mkEmbed("quasar", "Quasar", "Videasy", url));
  }

  // ── Zenith (AutoEmbed) ───────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://player.autoembed.cc/embed/tv/${tv("")}`
      : `https://player.autoembed.cc/embed/movie/${i.tmdbId}`;
    sources.push(mkEmbed("zenith", "Zenith", "AutoEmbed", url));
  }

  // ── Orion (2Embed) ───────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://www.2embed.cc/embedtv/${i.tmdbId}&s=${i.season ?? 1}&e=${i.episode ?? 1}`
      : `https://www.2embed.cc/embed/${i.tmdbId}`;
    sources.push(mkEmbed("orion", "Orion", "2Embed", url));
  }

  // ── Nova (VidSrc.to) ─────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://vidsrc.to/embed/tv/${tv("")}`
      : `https://vidsrc.to/embed/movie/${i.tmdbId}`;
    sources.push(mkEmbed("nova", "Nova", "VidSrc", url));
  }

  // ── Solaris (embed.su) ───────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://embed.su/embed/tv/${tv("")}`
      : `https://embed.su/embed/movie/${i.tmdbId}`;
    sources.push(mkEmbed("solaris", "Solaris", "EmbedSu", url));
  }

  // ── Prism (SuperEmbed / multiembed.mov) ──────────────────────────────────────
  {
    const url = isShow
      ? `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1&s=${i.season ?? 1}&e=${i.episode ?? 1}`
      : `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1`;
    sources.push(mkEmbed("prism", "Prism", "SuperEmbed", url));
  }

  // ── Helix (VidBinge) ─────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://vidbinge.dev/embed/tv/${tv("")}`
      : `https://vidbinge.dev/embed/movie/${i.tmdbId}`;
    sources.push(mkEmbed("helix", "Helix", "VidBinge", url));
  }

  // ── Aurora (MoviesAPI) ───────────────────────────────────────────────────────
  if (imdbId) {
    const url = isShow
      ? `https://moviesapi.club/tv/${imdbId}-${i.season ?? 1}-${i.episode ?? 1}`
      : `https://moviesapi.club/movie/${imdbId}`;
    sources.push(mkEmbed("aurora", "Aurora", "MoviesAPI", url));
  }

  // ── Flux (VidSrc.me) ─────────────────────────────────────────────────────────
  if (imdbId) {
    const url = isShow
      ? `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${i.season ?? 1}&episode=${i.episode ?? 1}`
      : `https://vidsrc.me/embed/movie?imdb=${imdbId}`;
    sources.push(mkEmbed("flux", "Flux", "VidSrc.me", url));
  }

  // ── Cipher (vidsrc.xyz) ──────────────────────────────────────────────────────
  if (imdbId) {
    const url = isShow
      ? `https://vidsrc.xyz/embed/tv?imdb=${imdbId}&season=${i.season ?? 1}&episode=${i.episode ?? 1}`
      : `https://vidsrc.xyz/embed/movie?imdb=${imdbId}`;
    sources.push(mkEmbed("cipher", "Cipher", "VidSrc XYZ", url));
  }

  // ── Apex (SmashyStream) ──────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://player.smashy.stream/tv/${i.tmdbId}?s=${i.season ?? 1}&e=${i.episode ?? 1}`
      : `https://player.smashy.stream/movie/${i.tmdbId}`;
    sources.push(mkEmbed("apex", "Apex", "SmashyStream", url));
  }

  // ── Echo (111movies) ─────────────────────────────────────────────────────────
  {
    const url = isShow
      ? `https://111movies.com/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
      : `https://111movies.com/movie/${i.tmdbId}`;
    sources.push(mkEmbed("echo", "Echo", "111Movies", url));
  }

  // ── Flare (NontonFilm / rive) ─────────────────────────────────────────────
  {
    const url = isShow
      ? `https://rivestream.live/watch?type=tv&id=${i.tmdbId}&season=${i.season ?? 1}&episode=${i.episode ?? 1}&autoPlay=true`
      : `https://rivestream.live/watch?type=movie&id=${i.tmdbId}&autoPlay=true`;
    sources.push(mkEmbed("flare", "Flare", "RiveStream", url));
  }

  return sources;
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveAllSources(input: ResolveInput): Promise<ResolveResult> {
  // Kick off IMDB lookup and direct source in parallel
  const [imdbId, directResult] = await Promise.allSettled([
    tmdbToImdb(input.tmdbId, input.type),
    resolveShowboxFebbox(input),
  ]);

  const imdb = imdbId.status === "fulfilled" ? imdbId.value : null;
  const direct = directResult.status === "fulfilled" ? directResult.value : null;

  const embeds = buildEmbeds(input, imdb);
  const sources: ResolvedSource[] = direct ? [direct, ...embeds] : embeds;

  return { sources, primary: sources[0]?.id };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stream aggregator — resolves TMDB IDs to real HLS/MP4 URLs.
 *
 * Primary direct source: Cineby/speedracelight API
 *   1. GET  {origin}/seed?mediaId={tmdbId}           → { seed, ttlMs }
 *   2. GET  {origin}/{server}/sources-with-title
 *        ?title=...&mediaType=...&tmdbId=...&enc=2&seed=...  → encrypted base64
 *   3. Decrypt with custom XOR-PRNG cipher (seed as key, tmdbId as nonce)
 *   4. Returns { sources: [{url, quality, type}], subtitles: [...] }
 *
 * Subtitles: sub.1x2.space API
 *   GET /api/movie/{tmdbId}          → [{label, language, url}]
 *   GET /api/tv/{tmdbId}/{s}/{e}     → [{label, language, url}]
 *
 * Fallback: 16+ embed sources.
 */
import CryptoJS from "crypto-js";

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

// ─── Cineby cipher ────────────────────────────────────────────────────────────

const CINEBY_API = "https://api.speedracelight.com";
const CINEBY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const U = [
  1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993,
  2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987,
  1925078388, 2162078206, 2614888103, 3248222580,
];
const MAGIC = [109, 118, 109, 49]; // "mvm1"

function fmix32(e: number): number {
  e = e >>> 0;
  e ^= e >>> 16;
  e = Math.imul(e, 2246822507) >>> 0;
  e ^= e >>> 13;
  e = Math.imul(e, 3266489909) >>> 0;
  e ^= e >>> 16;
  return e >>> 0;
}

function rotl(e: number, t: number): number {
  e = e >>> 0;
  t = t & 31;
  if (t === 0) return e;
  return ((e << t) | (e >>> (32 - t))) >>> 0;
}

function fnv1a(s: string): number {
  let t = 2166136261;
  for (let i = 0; i < s.length; i++) {
    t = (Math.imul(t ^ s.charCodeAt(i), 16777619)) >>> 0;
  }
  return fmix32(t);
}

function buildState(seedStr: string, tmdbIdNum: number): { R: Map<number, number>; acc: number } {
  const R = new Map<number, number>();
  let n = fmix32(fnv1a(seedStr) ^ fmix32((tmdbIdNum ^ 2654435769) >>> 0));
  for (let e = 0; e < 8; e++) {
    // All e*(e+1) are even, so is_even_pr is always true
    const t = n % 61;
    n = rotl((n + 2654435769) >>> 0, 7 + (7 & e));
    R.set(t, (n ^ fmix32(n)) >>> 0);
    n = fmix32((n + t) >>> 0);
  }
  const acc = fmix32(2779096485 ^ n) >>> 0;
  return { R, acc };
}

function prngNext(state: { R: Map<number, number>; acc: number }, counter: number): number {
  const { R, acc: a } = state;
  const i = a % 61;
  const slotAssigned = R.has(i);
  const u = slotAssigned ? 0xffffffff : 0;
  const l = (R.get(i) ?? 0) >>> 0;
  const val = (l ^ (Math.imul(2654435769, counter + 1) >>> 0)) >>> 0;

  let c: number;
  if (slotAssigned) {
    c = ((a ^ val) | (a & val)) >>> 0; // u = 0xffffffff → a | val
  } else {
    c = (a ^ val) >>> 0; // u = 0
  }

  c = (rotl((c + a) >>> 0, 31 & i) ^ rotl(a, 31 & (Math.imul(i, 7) & 31))) >>> 0;
  const newAcc = fmix32((c + 2654435769) >>> 0);
  R.set(i, newAcc);
  state.acc = newAcc;
  return newAcc;
}

function decodeBase64Url(b64: string): Uint8Array {
  const t = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = t + "=".repeat((4 - (t.length % 4)) % 4);
  const binary = atob(padded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

function decryptResponse(encrypted: string, seedStr: string, tmdbIdNum: number): string {
  const data = decodeBase64Url(encrypted);
  const state = buildState(seedStr, tmdbIdNum);

  const keystream = new Uint8Array(data.length);
  let a = 0;
  let e = 0;
  while (e < data.length) {
    const val = prngNext(state, a++);
    keystream[e++] = val & 255;
    if (e < data.length) keystream[e++] = (val >>> 8) & 255;
    if (e < data.length) keystream[e++] = (val >>> 16) & 255;
    if (e < data.length) keystream[e++] = (val >>> 24) & 255;
  }

  for (let i = 0; i < data.length; i++) data[i] ^= keystream[i];

  for (let i = 0; i < MAGIC.length; i++) {
    if (data[i] !== MAGIC[i]) throw new Error("Cineby decrypt: magic mismatch");
  }

  return new TextDecoder("utf-8").decode(data.subarray(MAGIC.length));
}

// ─── Cineby seed cache ────────────────────────────────────────────────────────

const seedCache = new Map<string, { seed: string; expiresAt: number }>();

async function getSeed(tmdbId: string): Promise<string> {
  const now = Date.now();
  const cached = seedCache.get(tmdbId);
  if (cached && cached.expiresAt - 5000 > now) return cached.seed;

  const res = await fetch(`${CINEBY_API}/seed?mediaId=${tmdbId}`, {
    headers: {
      "User-Agent": CINEBY_UA,
      Referer: "https://www.cineby.at/",
      Origin: "https://www.cineby.at",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Cineby seed: ${res.status}`);
  const d = await res.json();
  const ttl = d.ttlMs ?? 30000;
  seedCache.set(tmdbId, { seed: d.seed, expiresAt: now + ttl });
  return d.seed as string;
}

// ─── Cineby source resolver ───────────────────────────────────────────────────

const CINEBY_SERVERS = ["neon2", "jett", "cdn", "hdmovie", "lamovie", "ym"];

function inferFormat(url: string, type?: string): StreamQuality["format"] {
  const t = (type || "").toLowerCase();
  if (t === "hls" || t === "m3u8") return "hls";
  if (t === "dash") return "mp4";
  if (t === "mp4") return "mp4";
  const l = url.toLowerCase();
  if (l.includes(".m3u8")) return "hls";
  if (l.includes(".mp4")) return "mp4";
  if (l.includes(".mkv")) return "mkv";
  if (l.includes(".mpd")) return "mp4";
  return "unknown";
}

function parseResolution(label: string): number {
  const m = String(label).match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

async function resolveCineby(input: ResolveInput): Promise<DirectSource | null> {
  try {
    const seed = await getSeed(input.tmdbId);
    const isShow = input.type !== "movie";
    const params = new URLSearchParams({
      title: input.title,
      mediaType: isShow ? "tv" : "movie",
      tmdbId: input.tmdbId,
      enc: "2",
      seed,
    });
    if (isShow) {
      params.set("season", String(input.season ?? 1));
      params.set("episode", String(input.episode ?? 1));
    }

    // Try multiple servers, pick the first that returns HLS sources
    const results = await Promise.allSettled(
      CINEBY_SERVERS.map(async (server) => {
        const url = `${CINEBY_API}/${server}/sources-with-title?${params}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": CINEBY_UA,
            Referer: "https://www.cineby.at/",
            Origin: "https://www.cineby.at",
          },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error(`${server}: ${res.status}`);
        const encrypted = await res.text();
        const decrypted = decryptResponse(encrypted, seed, parseInt(input.tmdbId, 10));
        const parsed = JSON.parse(decrypted);
        return { server, parsed };
      }),
    );

    const qualities: StreamQuality[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { parsed } = result.value;
      const sources: any[] = Array.isArray(parsed?.sources) ? parsed.sources : [];
      for (const s of sources) {
        const url = String(s?.url || "").trim();
        if (!url || seen.has(url)) continue;
        // Skip DASH streams (our player uses HLS.js, not dash.js)
        if (String(s?.type || "").toLowerCase() === "dash") continue;
        seen.add(url);
        const label = String(s?.quality || "Auto");
        qualities.push({
          url,
          label,
          quality: label,
          format: inferFormat(url, s?.type),
          resolution: parseResolution(label),
        });
      }
    }

    if (!qualities.length) return null;

    // Sort: HLS first, then by resolution descending
    qualities.sort((a, b) => {
      if (a.format === "hls" && b.format !== "hls") return -1;
      if (a.format !== "hls" && b.format === "hls") return 1;
      return (b.resolution || 0) - (a.resolution || 0);
    });

    // Fetch subtitles
    const subtitles = await fetchSubtitles(input);

    return {
      kind: "direct",
      id: "alpha",
      name: "Alpha Stream",
      badge: "HLS Direct",
      qualities,
      subtitles,
    };
  } catch (err) {
    console.error("[resolveCineby]", err);
    return null;
  }
}

// ─── Subtitle fetcher (sub.1x2.space) ─────────────────────────────────────────

async function fetchSubtitles(input: ResolveInput): Promise<StreamSubtitle[]> {
  try {
    const isShow = input.type !== "movie";
    const subUrl = isShow
      ? `https://sub.1x2.space/api/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `https://sub.1x2.space/api/movie/${input.tmdbId}`;

    const res = await fetch(subUrl, {
      headers: { "User-Agent": CINEBY_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    const subs: StreamSubtitle[] = [];
    for (const item of list) {
      const url = String(item?.url || "").trim();
      if (!url || item?.status === "failed") continue;
      const fullUrl = url.startsWith("http") ? url : `https://sub.1x2.space${url}`;
      const lang = String(item?.language || item?.label || "en").toLowerCase();
      subs.push({
        url: fullUrl,
        language: lang,
        label: String(item?.label || lang).toUpperCase(),
        type: "vtt",
      });
    }
    return subs;
  } catch {
    return [];
  }
}

// ─── TMDB → IMDB lookup ───────────────────────────────────────────────────────

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

// ─── Showbox / FebBox (secondary direct source) ───────────────────────────────

const SB = {
  BASE: "https://mbpapi.shegu.net/api/api_client/index/",
  APP_KEY: "moviebox",
  IV: "wEiphTn!",
  KEY: "123d6cedf626dy54233aa1w6",
  DEFAULTS: {
    childmode: "0", app_version: "11.5", lang: "en",
    platform: "android", channel: "Website", appid: "27",
    version: "129", medium: "Website",
  },
};
const FB = "https://www.febbox.com";
const FB_UA = CINEBY_UA;
const SHARE_HOSTS = [
  "https://www.showbox.media", "https://showbox.media",
  "https://www.boxmovie.media", "https://boxmovie.media",
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
function sbEncrypt(d: string) {
  return CryptoJS.TripleDES.encrypt(d, CryptoJS.enc.Utf8.parse(SB.KEY), {
    iv: CryptoJS.enc.Utf8.parse(SB.IV),
  }).toString();
}
function sbVerify(enc: string) {
  return CryptoJS.MD5(CryptoJS.MD5(SB.APP_KEY).toString() + SB.KEY + enc).toString();
}

async function sbRequest(module: string, params: Record<string, any> = {}): Promise<any> {
  const payload = {
    ...SB.DEFAULTS,
    expired_date: Math.floor(Date.now() / 1000 + 60 * 60 * 12),
    module, ...params,
  };
  const enc = sbEncrypt(JSON.stringify(payload));
  const body = JSON.stringify({
    app_key: CryptoJS.MD5(SB.APP_KEY).toString(),
    verify: sbVerify(enc), encrypt_data: enc,
  });
  const form = new URLSearchParams({
    data: toB64(body), appid: SB.DEFAULTS.appid,
    platform: SB.DEFAULTS.platform, version: SB.DEFAULTS.version,
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
  } catch { return []; }
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
      headers: { "user-agent": FB_UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      signal: AbortSignal.timeout(12000),
    });
    const anyH = r.headers as any;
    const setCookies: string[] =
      typeof anyH.getSetCookie === "function"
        ? (anyH.getSetCookie() as string[])
        : (r.headers.get("set-cookie") ? [r.headers.get("set-cookie")!] : []);
    const sess = setCookies.map((v) => v.match(/PHPSESSID=([^;\s,]+)/i)?.[1]).find(Boolean);
    if (!sess) return base;
    return base ? `${base}; PHPSESSID=${sess}` : `PHPSESSID=${sess}`;
  } catch { return base; }
}

interface FBFile { fid: number; file_name: string; file_size: number; is_dir: 0 | 1 }

async function fbFileList(shareKey: string, parentId: number, cookie?: string): Promise<FBFile[]> {
  const headers: Record<string, string> = {
    "user-agent": FB_UA, "x-requested-with": "XMLHttpRequest",
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
  } catch { return []; }
}

async function fbLinks(
  shareKey: string, fid: number, cookie?: string,
): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const headers: Record<string, string> = {
    "user-agent": FB_UA, "x-requested-with": "XMLHttpRequest",
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

  const pickUrl = (item: any): string => {
    const cands = [item?.hls_url, item?.play_url, item?.stream_url, item?.url, item?.download_url, item?.file_url, item?.src];
    for (const c of cands) {
      const v = String(c || "").trim();
      if (v && /^https?:/i.test(v) && v.toLowerCase().includes(".m3u8")) return v;
    }
    for (const c of cands) {
      const v = String(c || "").trim();
      if (v && /^https?:/i.test(v)) return v;
    }
    return "";
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
  if (d1) collectQualities(d1);
  if (d2) {
    if ((d2 as any).html) {
      const re = /class="file_quality"[^>]*data-url="([^"]*)"[^>]*data-quality="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec((d2 as any).html)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        qualities.push({ url: m[1], label: m[2], quality: m[2], format: inferFormat(m[1]), resolution: parseResolution(m[2]) });
      }
    } else { collectQualities(d2); }
  }
  if (d3 && !(d3 as any).html) collectQualities(d3);

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
    const best = results.find((r: any) => {
      const t = (r.title || r.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return t === norm;
    }) || results[0];

    const shareKey = await getShareKey(Number(best.id), type === "movie" ? 1 : 2);
    if (!shareKey) return null;

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
        return n.includes(`season ${s}`) || n.includes(`s${String(s).padStart(2, "0")}`) || n.includes(`season${s}`) || n === `s${s}`;
      });
      if (seasonDir) files = await fbFileList(shareKey, seasonDir.fid, cookie);
      const pad = String(e).padStart(2, "0");
      target = files.find((f) => {
        if (f.is_dir) return false;
        const n = f.file_name.toLowerCase();
        return n.includes(`e${pad}`) || n.includes(`episode ${e}`) || n.includes(`ep${pad}`) || n.includes(`.e${pad}.`) || n.includes(`x${pad}`);
      });
      if (!target) {
        const vids = files.filter((f) => !f.is_dir).sort((a, b) => a.file_name.localeCompare(b.file_name));
        target = vids[e - 1] ?? vids[0];
      }
    }
    if (!target) return null;

    const { qualities, subtitles } = await fbLinks(shareKey, target.fid, cookie);
    if (!qualities.length) return null;

    return {
      kind: "direct",
      id: "febbox",
      name: "FebBox",
      badge: input.febboxCookie ? "Premium" : "Free",
      qualities,
      subtitles,
      fileName: target.file_name,
    };
  } catch (err) {
    console.error("[resolveShowboxFebbox]", err);
    return null;
  }
}

// ─── Embed source builders ─────────────────────────────────────────────────────

function mkEmbed(id: string, name: string, badge: string, url: string): EmbedSource {
  return { kind: "embed", id, name, badge, url };
}

function buildEmbeds(i: ResolveInput, imdbId: string | null): EmbedSource[] {
  const isShow = i.type !== "movie";
  const tv = (base: string) => `${base}/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  const sources: EmbedSource[] = [];

  // Nebula (Cinezo)
  {
    const base = isShow
      ? `https://player.cinezo.live/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
      : `https://player.cinezo.live/embed/movie/${i.tmdbId}`;
    const p = new URLSearchParams({
      autoplay: "true", poster: "true", pip: "true", episodelist: "true",
      primarycolor: "6366f1", secondarycolor: "0a0a12", iconcolor: "ffffff", setting: "true",
    });
    sources.push(mkEmbed("nebula", "Nebula", "Cinezo", `${base}?${p}`));
  }
  // Pulse (VidSrc CC)
  sources.push(mkEmbed("pulse", "Pulse", "VidSrc CC",
    isShow ? `https://vidsrc.cc/v2/embed/tv/${tv("")}?autoPlay=true` : `https://vidsrc.cc/v2/embed/movie/${i.tmdbId}?autoPlay=true`));
  // Vortex (Vidfast)
  sources.push(mkEmbed("vortex", "Vortex", "Vidfast",
    isShow ? `https://vidfast.pro/tv/${tv("")}?autoPlay=true&nextButton=true&autoNext=true&title=true&poster=true` : `https://vidfast.pro/movie/${i.tmdbId}?autoPlay=true&title=true&poster=true`));
  // Photon (Vidlink)
  sources.push(mkEmbed("photon", "Photon", "Vidlink",
    isShow ? `https://vidlink.pro/tv/${tv("")}?primaryColor=6366f1&autoplay=true&nextbutton=true` : `https://vidlink.pro/movie/${i.tmdbId}?primaryColor=6366f1&autoplay=true`));
  // Quasar (Videasy)
  sources.push(mkEmbed("quasar", "Quasar", "Videasy",
    isShow ? `https://player.videasy.net/tv/${tv("")}?color=6366f1&autoPlay=true&nextEpisode=true&episodeSelector=true` : `https://player.videasy.net/movie/${i.tmdbId}?color=6366f1&autoPlay=true`));
  // Zenith (AutoEmbed)
  sources.push(mkEmbed("zenith", "Zenith", "AutoEmbed",
    isShow ? `https://player.autoembed.cc/embed/tv/${tv("")}` : `https://player.autoembed.cc/embed/movie/${i.tmdbId}`));
  // Orion (2Embed)
  sources.push(mkEmbed("orion", "Orion", "2Embed",
    isShow ? `https://www.2embed.cc/embedtv/${i.tmdbId}&s=${i.season ?? 1}&e=${i.episode ?? 1}` : `https://www.2embed.cc/embed/${i.tmdbId}`));
  // Nova (VidSrc.to)
  sources.push(mkEmbed("nova", "Nova", "VidSrc",
    isShow ? `https://vidsrc.to/embed/tv/${tv("")}` : `https://vidsrc.to/embed/movie/${i.tmdbId}`));
  // Solaris (embed.su)
  sources.push(mkEmbed("solaris", "Solaris", "EmbedSu",
    isShow ? `https://embed.su/embed/tv/${tv("")}` : `https://embed.su/embed/movie/${i.tmdbId}`));
  // Prism (SuperEmbed)
  sources.push(mkEmbed("prism", "Prism", "SuperEmbed",
    isShow ? `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1&s=${i.season ?? 1}&e=${i.episode ?? 1}` : `https://multiembed.mov/directstream.php?video_id=${i.tmdbId}&tmdb=1`));
  // Helix (VidBinge)
  sources.push(mkEmbed("helix", "Helix", "VidBinge",
    isShow ? `https://vidbinge.dev/embed/tv/${tv("")}` : `https://vidbinge.dev/embed/movie/${i.tmdbId}`));
  // Apex (SmashyStream)
  sources.push(mkEmbed("apex", "Apex", "SmashyStream",
    isShow ? `https://player.smashy.stream/tv/${i.tmdbId}?s=${i.season ?? 1}&e=${i.episode ?? 1}` : `https://player.smashy.stream/movie/${i.tmdbId}`));
  // Flare (RiveStream)
  sources.push(mkEmbed("flare", "Flare", "RiveStream",
    isShow ? `https://rivestream.live/watch?type=tv&id=${i.tmdbId}&season=${i.season ?? 1}&episode=${i.episode ?? 1}&autoPlay=true` : `https://rivestream.live/watch?type=movie&id=${i.tmdbId}&autoPlay=true`));
  // IMDB-based sources (only if we have the IMDB ID)
  if (imdbId) {
    sources.push(mkEmbed("aurora", "Aurora", "MoviesAPI",
      isShow ? `https://moviesapi.club/tv/${imdbId}-${i.season ?? 1}-${i.episode ?? 1}` : `https://moviesapi.club/movie/${imdbId}`));
    sources.push(mkEmbed("cipher", "Cipher", "VidSrc XYZ",
      isShow ? `https://vidsrc.xyz/embed/tv?imdb=${imdbId}&season=${i.season ?? 1}&episode=${i.episode ?? 1}` : `https://vidsrc.xyz/embed/movie?imdb=${imdbId}`));
  }

  return sources;
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveAllSources(input: ResolveInput): Promise<ResolveResult> {
  // Run Cineby, Showbox/FebBox, and IMDB lookup in parallel
  const [cinebyResult, showboxResult, imdbResult] = await Promise.allSettled([
    resolveCineby(input),
    resolveShowboxFebbox(input),
    tmdbToImdb(input.tmdbId, input.type),
  ]);

  const cineby = cinebyResult.status === "fulfilled" ? cinebyResult.value : null;
  const showbox = showboxResult.status === "fulfilled" ? showboxResult.value : null;
  const imdb = imdbResult.status === "fulfilled" ? imdbResult.value : null;

  const embeds = buildEmbeds(input, imdb);

  // Build source list: direct sources first, then embeds
  const sources: ResolvedSource[] = [];
  if (cineby) sources.push(cineby);
  if (showbox) sources.push(showbox);
  sources.push(...embeds);

  return { sources, primary: sources[0]?.id };
}

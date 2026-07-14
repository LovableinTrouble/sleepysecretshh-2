/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stream aggregator — resolves TMDB IDs to real HLS/MP4 URLs and
 * generates embed URLs for fallback sources. Ported from NexVid's
 * Showbox / FebBox pipeline.
 */
import CryptoJS from "crypto-js";

// ─── Showbox config ────────────────────────────────────────────────
const SB_CONFIG = {
  BASE_URL: "https://mbpapi.shegu.net/api/api_client/index/",
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

const FEBBOX_BASE = "https://www.febbox.com";
const FEBBOX_HEADERS = {
  "x-requested-with": "XMLHttpRequest",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};
const SHARE_LINK_HOSTS = [
  "https://www.showbox.media",
  "https://showbox.media",
  "https://www.boxmovie.media",
  "https://boxmovie.media",
  "https://showbox.run",
];

function randomHex(len: number): string {
  const c = "0123456789abcdef";
  let r = "";
  for (let i = 0; i < len; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function toBase64Utf8(v: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(v)));
  const b = new TextEncoder().encode(v);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function encrypt(data: string): string {
  return CryptoJS.TripleDES.encrypt(data, CryptoJS.enc.Utf8.parse(SB_CONFIG.KEY), {
    iv: CryptoJS.enc.Utf8.parse(SB_CONFIG.IV),
  }).toString();
}
function verify(enc: string): string {
  return CryptoJS.MD5(
    CryptoJS.MD5(SB_CONFIG.APP_KEY).toString() + SB_CONFIG.KEY + enc,
  ).toString();
}

async function showboxRequest(module: string, params: Record<string, any> = {}): Promise<any> {
  const requestData = {
    ...SB_CONFIG.DEFAULTS,
    expired_date: Math.floor(Date.now() / 1000 + 60 * 60 * 12),
    module,
    ...params,
  };
  const enc = encrypt(JSON.stringify(requestData));
  const body = JSON.stringify({
    app_key: CryptoJS.MD5(SB_CONFIG.APP_KEY).toString(),
    verify: verify(enc),
    encrypt_data: enc,
  });
  const form = new URLSearchParams({
    data: toBase64Utf8(body),
    appid: SB_CONFIG.DEFAULTS.appid,
    platform: SB_CONFIG.DEFAULTS.platform,
    version: SB_CONFIG.DEFAULTS.version,
    medium: SB_CONFIG.DEFAULTS.medium,
  });
  const res = await fetch(SB_CONFIG.BASE_URL, {
    method: "POST",
    headers: {
      Platform: SB_CONFIG.DEFAULTS.platform,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "okhttp/3.2.0",
    },
    body: `${form.toString()}&token${randomHex(32)}`,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Showbox ${module}: ${res.status}`);
  return res.json();
}

async function searchShowbox(title: string, type: "movie" | "tv"): Promise<any[]> {
  const d = await showboxRequest("Search5", { page: 1, type, keyword: title, pagelimit: 20 });
  return d?.data || [];
}

async function getShareKey(id: number, type: 1 | 2): Promise<string | null> {
  for (const host of SHARE_LINK_HOSTS) {
    try {
      const r = await fetch(`${host}/index/share_link?id=${id}&type=${type}`, {
        headers: { "User-Agent": "okhttp/3.2.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const link = d?.data?.link;
      if (link) return link.split("/").pop() || null;
    } catch { /* try next */ }
  }
  return null;
}

function cookieHeader(raw?: string): string | undefined {
  const v = (raw || "").trim();
  if (!v) return undefined;
  if (v.toLowerCase().startsWith("cookie:")) return v.slice(7).trim();
  if (v.includes("=")) return v;
  return `ui=${v}`;
}

async function shareSessionCookie(shareKey: string, ui?: string): Promise<string | undefined> {
  const base = cookieHeader(ui);
  try {
    const r = await fetch(`${FEBBOX_BASE}/share/${shareKey}`, {
      headers: {
        "user-agent": FEBBOX_HEADERS["user-agent"],
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    const setCookies: string[] = [];
    const anyH = r.headers as any;
    if (typeof anyH?.getSetCookie === "function") {
      const v = anyH.getSetCookie();
      if (Array.isArray(v)) setCookies.push(...v);
    } else {
      const s = r.headers.get("set-cookie");
      if (s) setCookies.push(s);
    }
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
    ...FEBBOX_HEADERS,
    referer: `${FEBBOX_BASE}/share/${shareKey}`,
  };
  if (cookie) headers.cookie = cookie;
  const r = await fetch(
    `${FEBBOX_BASE}/file/file_share_list?share_key=${shareKey}&pwd=&parent_id=${parentId}&is_html=0`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!r.ok) return [];
  const d = await r.json();
  return d?.data?.file_list || [];
}

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

function parseResolution(label: string): number {
  const m = String(label).match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

async function fbLinks(shareKey: string, fid: number, cookie?: string) {
  const headers: Record<string, string> = {
    ...FEBBOX_HEADERS,
    referer: `${FEBBOX_BASE}/share/${shareKey}`,
  };
  if (cookie) headers.cookie = cookie;

  const inferFormat = (u: string): StreamQuality["format"] => {
    const l = u.toLowerCase();
    if (l.includes(".m3u8")) return "hls";
    if (l.includes(".mp4")) return "mp4";
    if (l.includes(".mkv")) return "mkv";
    return "unknown";
  };
  const pickUrl = (item: any, fallback: string): string => {
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
    return String(fallback || "").trim();
  };
  const fetchJson = async (url: string) => {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      const t = await r.text();
      try { return JSON.parse(t); } catch { return { html: t }; }
    } catch { return null; }
  };

  const qualities: StreamQuality[] = [];
  const subtitles: StreamSubtitle[] = [];
  const seen = new Set<string>();

  const collectSubs = (data: any) => {
    const fileEntry = Array.isArray(data?.data) ? data.data[0] : data?.data || {};
    const items = [
      ...(Array.isArray(fileEntry?.subtitle_list) ? fileEntry.subtitle_list : []),
      ...(Array.isArray(data?.subtitle_list) ? data.subtitle_list : []),
    ];
    const guess = (v: string) => {
      const l = v.toLowerCase();
      if (l.includes("spa") || l.includes("_es")) return "es";
      if (l.includes("fre") || l.includes("_fr")) return "fr";
      if (l.includes("ger") || l.includes("_de")) return "de";
      return "en";
    };
    for (const it of items) {
      const u = typeof it === "string" ? it : it?.url || it?.src || "";
      if (!u) continue;
      const lang = it?.language || guess(u);
      subtitles.push({
        url: u,
        language: String(lang).toLowerCase(),
        label: String(it?.label || lang).toUpperCase(),
        type: u.toLowerCase().includes(".vtt") ? "vtt" : "srt",
      });
    }
  };

  const collectQualities = (data: any) => {
    const fileEntry = Array.isArray(data?.data) ? data.data[0] : data?.data || data || {};
    const rawList = fileEntry.quality_list || fileEntry.transcode_list || data.list || {};
    const items = Array.isArray(rawList) ? rawList : Object.values(rawList);
    for (const q of items) {
      const url = pickUrl(q, String(fileEntry?.download_url || ""));
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const label = String((q as any)?.quality || (q as any)?.label || "Auto");
      qualities.push({
        url,
        label,
        quality: label,
        format: inferFormat(url),
        size: (q as any)?.file_size ? String((q as any).file_size) : undefined,
        resolution: parseResolution(label),
      });
    }
    if (fileEntry?.download_url) {
      const u = String(fileEntry.download_url);
      if (!seen.has(u)) {
        seen.add(u);
        qualities.push({
          url: u, label: "Original", quality: "ORG",
          format: inferFormat(u),
          size: fileEntry.file_size ? String(fileEntry.file_size) : undefined,
          resolution: 0,
        });
      }
    }
  };

  const d1 = await fetchJson(
    `${FEBBOX_BASE}/file/file_download?fid=${fid}&share_key=${encodeURIComponent(shareKey)}&is_hls=1&is_html=0`,
  );
  if (d1) { collectQualities(d1); collectSubs(d1); }

  const d2 = await fetchJson(
    `${FEBBOX_BASE}/console/video_quality_list?fid=${fid}&share_id=${shareKey}&is_hls=1&is_html=0`,
  );
  if (d2) {
    if ((d2 as any).html) {
      const re = /class="file_quality"[^>]*data-url="([^"]*)"[^>]*data-quality="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec((d2 as any).html)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        qualities.push({
          url: m[1], label: m[2], quality: m[2],
          format: inferFormat(m[1]),
          resolution: parseResolution(m[2]),
        });
      }
    } else {
      collectQualities(d2); collectSubs(d2);
    }
  }

  const d3 = await fetchJson(`${FEBBOX_BASE}/file/hls_playlist?fid=${fid}&share_key=${shareKey}`);
  if (d3 && !(d3 as any).html) { collectQualities(d3); collectSubs(d3); }

  qualities.sort((a, b) => {
    if (a.format === "hls" && b.format !== "hls") return -1;
    if (a.format !== "hls" && b.format === "hls") return 1;
    return (b.resolution || 0) - (a.resolution || 0);
  });
  return { qualities, subtitles };
}

async function resolveFebbox(input: ResolveInput): Promise<DirectSource | null> {
  try {
    const type = input.type === "movie" ? "movie" : "tv";
    const results = await searchShowbox(input.title, type);
    if (!results.length) return null;
    const norm = input.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const best =
      results.find((r: any) => {
        const t = (r.title || r.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return t === norm;
      }) || results[0];
    const shareKey = await getShareKey(best.id, type === "movie" ? 1 : 2);
    if (!shareKey) return null;
    const cookie = await shareSessionCookie(shareKey, input.febboxCookie);
    let files = await fbFileList(shareKey, 0, cookie);
    if (!files.length) return null;

    let target: FBFile | undefined;
    if (type === "movie") {
      target = files.filter((f) => !f.is_dir).sort((a, b) => b.file_size - a.file_size)[0];
    } else {
      const s = input.season || 1;
      const e = input.episode || 1;
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
          n.includes(`.e${pad}.`)
        );
      });
      if (!target) {
        const vids = files.filter((f) => !f.is_dir).sort((a, b) => a.file_name.localeCompare(b.file_name));
        target = vids[e - 1] || vids[0];
      }
    }
    if (!target) return null;
    const { qualities, subtitles } = await fbLinks(shareKey, target.fid, cookie);
    if (!qualities.length) return null;
    return {
      kind: "direct",
      id: "alpha",
      name: "Alpha",
      badge: "Premium HLS",
      qualities,
      subtitles,
      fileName: target.file_name,
    };
  } catch (err) {
    console.error("[resolveFebbox]", err);
    return null;
  }
}

// ─── Embed source builders ─────────────────────────────────────────
function embedCinezo(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const base = isShow
    ? `https://player.cinezo.live/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
    : `https://player.cinezo.live/embed/movie/${i.tmdbId}`;
  const p = new URLSearchParams({
    autoplay: "true", poster: "true", chromecast: "true", pip: "true",
    episodelist: "true", primarycolor: "6366f1", secondarycolor: "0a0a12",
    iconcolor: "ffffff", setting: "true",
  });
  return { kind: "embed", id: "nebula", name: "Nebula", badge: "Cinezo", url: `${base}?${p}` };
}
function embedVidsrc(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const url = isShow
    ? `https://vidsrc.to/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
    : `https://vidsrc.to/embed/movie/${i.tmdbId}`;
  return { kind: "embed", id: "pulse", name: "Pulse", badge: "VidSrc", url };
}
function embedVidfast(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const url = isShow
    ? `https://vidfast.pro/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}?autoPlay=true&nextButton=true&autoNext=true&title=true&poster=true`
    : `https://vidfast.pro/movie/${i.tmdbId}?autoPlay=true&title=true&poster=true`;
  return { kind: "embed", id: "vortex", name: "Vortex", badge: "Vidfast", url };
}
function embedVidlink(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const url = isShow
    ? `https://vidlink.pro/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}?primaryColor=6366f1&autoplay=true&nextbutton=true`
    : `https://vidlink.pro/movie/${i.tmdbId}?primaryColor=6366f1&autoplay=true`;
  return { kind: "embed", id: "photon", name: "Photon", badge: "Vidlink", url };
}
function embedVideasy(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const url = isShow
    ? `https://player.videasy.net/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}?color=6366f1&autoPlay=true&nextEpisode=true&episodeSelector=true`
    : `https://player.videasy.net/movie/${i.tmdbId}?color=6366f1&autoPlay=true`;
  return { kind: "embed", id: "quasar", name: "Quasar", badge: "Videasy", url };
}
function embedAutoembed(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const url = isShow
    ? `https://player.autoembed.cc/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
    : `https://player.autoembed.cc/embed/movie/${i.tmdbId}`;
  return { kind: "embed", id: "zenith", name: "Zenith", badge: "AutoEmbed", url };
}
function embed2Embed(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const url = isShow
    ? `https://www.2embed.cc/embedtv/${i.tmdbId}&s=${i.season ?? 1}&e=${i.episode ?? 1}`
    : `https://www.2embed.cc/embed/${i.tmdbId}`;
  return { kind: "embed", id: "orion", name: "Orion", badge: "2Embed", url };
}
function embedVidsrcCc(i: ResolveInput): EmbedSource {
  const isShow = i.type !== "movie";
  const url = isShow
    ? `https://vidsrc.cc/v2/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}?autoPlay=true`
    : `https://vidsrc.cc/v2/embed/movie/${i.tmdbId}?autoPlay=true`;
  return { kind: "embed", id: "helix", name: "Helix", badge: "VidSrc CC", url };
}

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

export async function resolveAllSources(input: ResolveInput): Promise<ResolveResult> {
  const embeds: ResolvedSource[] = [
    embedCinezo(input),
    embedVidsrcCc(input),
    embedVidfast(input),
    embedVidlink(input),
    embedVideasy(input),
    embedVidsrc(input),
    embedAutoembed(input),
    embed2Embed(input),
  ];

  let direct: DirectSource | null = null;
  if (input.febboxCookie && input.febboxCookie.trim()) {
    direct = await resolveFebbox(input);
  }

  const sources: ResolvedSource[] = direct ? [direct, ...embeds] : embeds;
  return { sources, primary: sources[0]?.id };
}
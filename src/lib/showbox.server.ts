/* ============================================
   Showbox + FebBox API Client
   Based on: github.com/badwinton/show_feb_box_api
   Server-side only (used in API routes)
   ============================================ */

import CryptoJS from 'crypto-js';

// ---- Configuration ----

const SB_CONFIG = {
  BASE_URL: 'https://mbpapi.shegu.net/api/api_client/index/',
  APP_KEY: 'moviebox',
  APP_ID: 'com.tdo.showbox',
  IV: 'wEiphTn!',
  KEY: '123d6cedf626dy54233aa1w6',
  DEFAULTS: {
    CHILD_MODE: '0',
    APP_VERSION: '11.5',
    LANG: 'en',
    PLATFORM: 'android',
    CHANNEL: 'Website',
    APPID: '27',
    VERSION: '129',
    MEDIUM: 'Website',
  },
};

const FEBBOX_BASE = 'https://www.febbox.com';
const FEBBOX_HEADERS = {
  'x-requested-with': 'XMLHttpRequest',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-ch-ua': '"Chromium";v="135", "Not_A Brand";v="24", "Google Chrome";v="135"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

const PROXY_TARGET_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type FebboxProxyTarget = {
  url: string;
  cookie?: string;
  referer?: string;
  expires: number;
};

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Build a self-contained proxy token. We embed the upstream URL + cookie +
 * referer into the token itself so playback works on serverless runtimes
 * (Cloudflare Workers) where in-memory maps aren't shared between isolates
 * and would otherwise yield "expired or unknown token" 404s on every range
 * request — and also survives dev-server HMR restarts.
 */
export function registerFebboxProxyTarget(
  rawUrl: string,
  options: { cookie?: string; referer?: string } = {},
) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Unsupported stream URL');
  }
  const payload = {
    u: parsed.toString(),
    c: options.cookie || undefined,
    r: options.referer || undefined,
    e: Date.now() + PROXY_TARGET_TTL_MS,
  };
  const token = base64UrlEncode(JSON.stringify(payload));
  return `/api/public/febbox-proxy?t=${encodeURIComponent(token)}`;
}

export function getFebboxProxyTarget(token: string): FebboxProxyTarget | null {
  const decoded = base64UrlDecode(token);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as { u?: string; c?: string; r?: string; e?: number };
    if (!payload?.u || typeof payload.e !== 'number') return null;
    if (payload.e <= Date.now()) return null;
    return { url: payload.u, cookie: payload.c, referer: payload.r, expires: payload.e };
  } catch {
    return null;
  }
}

// Share-link base domains to try (some go down intermittently)
const SHARE_LINK_HOSTS = [
  'https://www.showbox.media',
  'https://showbox.media',
  'https://www.boxmovie.media',
  'https://boxmovie.media',
  'https://showbox.run',
  'https://www.showbox.run',
];

function randomHex(len: number): string {
  const chars = '0123456789abcdef';
  let r = '';
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function toBase64Utf8(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(value)));
  }

  let binary = '';
  const bytes = new TextEncoder().encode(value);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---- Showbox Encryption ----

function encrypt(data: string): string {
  return CryptoJS.TripleDES.encrypt(data, CryptoJS.enc.Utf8.parse(SB_CONFIG.KEY), {
    iv: CryptoJS.enc.Utf8.parse(SB_CONFIG.IV),
  }).toString();
}

function generateVerify(encryptedData: string): string {
  return CryptoJS.MD5(
    CryptoJS.MD5(SB_CONFIG.APP_KEY).toString() + SB_CONFIG.KEY + encryptedData,
  ).toString();
}

function getExpiryTimestamp(): number {
  return Math.floor(Date.now() / 1000 + 60 * 60 * 12);
}

// ---- Showbox API ----

async function showboxRequest(module: string, params: Record<string, any> = {}): Promise<any> {
  const requestData = {
    ...SB_CONFIG.DEFAULTS,
    expired_date: getExpiryTimestamp(),
    module,
    ...params,
  };

  const encryptedData = encrypt(JSON.stringify(requestData));
  const body = JSON.stringify({
    app_key: CryptoJS.MD5(SB_CONFIG.APP_KEY).toString(),
    verify: generateVerify(encryptedData),
    encrypt_data: encryptedData,
  });

  const formData = new URLSearchParams({
    data: toBase64Utf8(body),
    appid: SB_CONFIG.DEFAULTS.APPID,
    platform: SB_CONFIG.DEFAULTS.PLATFORM,
    version: SB_CONFIG.DEFAULTS.VERSION,
    medium: SB_CONFIG.DEFAULTS.MEDIUM,
  });

  const nonce = randomHex(32);

  const response = await fetch(SB_CONFIG.BASE_URL, {
    method: 'POST',
    headers: {
      Platform: SB_CONFIG.DEFAULTS.PLATFORM,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'okhttp/3.2.0',
    },
    body: `${formData.toString()}&token${nonce}`,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) throw new Error(`Showbox API ${module}: HTTP ${response.status}`);
  return response.json();
}

export async function searchShowbox(
  title: string,
  type: 'movie' | 'tv' = 'movie',
  page = 1,
): Promise<any[]> {
  const data = await showboxRequest('Search5', {
    page,
    type: type === 'movie' ? 'movie' : 'tv',
    keyword: title,
    pagelimit: 20,
  });
  return data?.data || [];
}

export async function getShowboxMovieDetails(movieId: number): Promise<any> {
  const data = await showboxRequest('Movie_detail', { mid: movieId });
  return data?.data;
}

export async function getShowboxShowDetails(showId: number): Promise<any> {
  const data = await showboxRequest('TV_detail_v2', { tid: showId });
  return data?.data;
}

export async function getFebBoxShareKey(showboxId: number, type: 1 | 2): Promise<string | null> {
  const errors: string[] = [];
  for (const host of SHARE_LINK_HOSTS) {
    try {
      const url = `${host}/index/share_link?id=${showboxId}&type=${type}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'okhttp/3.2.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        errors.push(`${host}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const link = data?.data?.link;
      if (link) return link.split('/').pop() || null;
      errors.push(`${host}: no link in response`);
    } catch (err: any) {
      errors.push(`${host}: ${err?.message || String(err)}`);
    }
  }
  console.error('[showbox] getFebBoxShareKey failed:', errors.join('; '));
  return null;
}

// ---- FebBox OAuth API (official) ----

export interface FebBoxTokenResponse {
  code: number;
  msg: string;
  data?: {
    access_token: string;
    expires_in: number;
    token_type: string;
    refresh_token: string;
  };
}

export async function getFebBoxToken(
  clientId: string,
  clientSecret: string,
): Promise<FebBoxTokenResponse> {
  try {
    const res = await fetch(`${FEBBOX_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(10000),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('json')) {
      return {
        code: 0,
        msg: `FebBox OAuth: HTTP ${res.status} (${ct.split(';')[0] || 'non-json'})`,
      };
    }
    return await res.json();
  } catch (err: any) {
    return { code: 0, msg: `FebBox OAuth: ${err.message}` };
  }
}

// ---- FebBox Web Share API ----

export interface FebBoxFile {
  fid: number;
  file_name: string;
  file_size: number;
  is_dir: 0 | 1;
  oss_fid?: number;
}

export interface FebBoxQuality {
  url: string;
  quality: string;
  name: string;
  size: string;
  format: string;
  mime?: string;
  type?: string;
  label: string;
}

export interface FebBoxSubtitle {
  url: string;
  language: string;
  label: string;
  type: 'srt' | 'vtt';
}

export interface FebBoxAudioTrack {
  id: number;
  name: string;
  lang: string;
  isDefault: boolean;
  url?: string;
}

function buildFebboxCookieHeader(rawCookie?: string): string | undefined {
  let value = (rawCookie || '').trim();
  if (!value) return undefined;

  if (value.toLowerCase().startsWith('cookie:')) value = value.slice(7).trim();

  const cookieName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  const cookieValue = /^[^\x00-\x20\x7f;,]+$/;
  const cookieAttributes = new Set([
    'domain',
    'expires',
    'httponly',
    'max-age',
    'path',
    'priority',
    'samesite',
    'secure',
  ]);
  const pairs: string[] = [];

  if (!value.includes('=')) {
    return cookieValue.test(value) ? `ui=${value}` : undefined;
  }

  for (const part of value.split(/[;\n\r]+/)) {
    const trimmed = part.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [rawName, ...rest] = trimmed.split('=');
    const name = rawName.trim();
    if (cookieAttributes.has(name.toLowerCase())) continue;
    const val = rest.join('=').trim().replace(/^"|"$/g, '');
    if (!cookieName.test(name) || !cookieValue.test(val)) continue;
    pairs.push(`${name}=${val}`);
  }

  return pairs.length ? pairs.join('; ') : undefined;
}

function readSetCookieHeaders(response: Response): string[] {
  const anyHeaders = response.headers as any;
  if (typeof anyHeaders?.getSetCookie === 'function') {
    const values = anyHeaders.getSetCookie();
    if (Array.isArray(values) && values.length > 0) return values;
  }

  const single = response.headers.get('set-cookie');
  if (!single) return [];
  return [single];
}

function mergeCookieParts(...cookieValues: Array<string | undefined>): string | undefined {
  const parts = cookieValues
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().replace(/;+$/, ''));

  if (parts.length === 0) return undefined;

  const unique = new Map<string, string>();
  for (const part of parts.join('; ').split(';')) {
    const trimmed = part.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [name, ...rest] = trimmed.split('=');
    if (!name) continue;
    unique.set(name.trim(), `${name.trim()}=${rest.join('=').trim()}`);
  }

  if (unique.size === 0) return undefined;
  return Array.from(unique.values()).join('; ');
}

async function getFebboxShareSessionCookie(
  shareKey: string,
  uiCookie?: string,
): Promise<string | undefined> {
  const baseCookie = buildFebboxCookieHeader(uiCookie);
  const shareUrl = `${FEBBOX_BASE}/share/${shareKey}`;
  const requestHeaders = {
    'user-agent': FEBBOX_HEADERS['user-agent'],
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  try {
    const response = await fetch(shareUrl, {
      headers: requestHeaders,
      signal: AbortSignal.timeout(10000),
    });

    const setCookies = readSetCookieHeaders(response);
    const phpSess = setCookies
      .map((value) => value.match(/(?:^|\s|,)PHPSESSID=([^;\s,]+)/i)?.[1])
      .find(Boolean);

    if (!phpSess) return baseCookie;
    return mergeCookieParts(baseCookie, `PHPSESSID=${phpSess}`);
  } catch {
    return baseCookie;
  }
}

export async function febboxGetFileList(
  shareKey: string,
  parentId = 0,
  uiCookie?: string,
): Promise<FebBoxFile[]> {
  const url = `${FEBBOX_BASE}/file/file_share_list?share_key=${shareKey}&pwd=&parent_id=${parentId}&is_html=0`;
  const baseHeaders: Record<string, string> = {
    ...FEBBOX_HEADERS,
    accept: 'application/json, text/javascript, */*; q=0.01',
    referer: `${FEBBOX_BASE}/share/${shareKey}`,
  };
  const cookieHeader = buildFebboxCookieHeader(uiCookie);

  const fetchList = async (cookie?: string) => {
    const headers = { ...baseHeaders };
    if (cookie) headers.cookie = cookie;
    // Retry once on Cloudflare 429 with a small jittered backoff — shared
    // worker IPs trip rate limits intermittently.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      if (response.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 600 + Math.floor(Math.random() * 400)));
        continue;
      }
      if (!response.ok) {
        const compact = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        throw new Error(`HTTP ${response.status}: ${compact.slice(0, 160)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        const compact = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        throw new Error(`Non-JSON response: ${compact.slice(0, 160)}`);
      }
    }
    throw new Error('FebBox: rate-limited (HTTP 429)');
  };

  const attempts = cookieHeader ? [cookieHeader, undefined] : [undefined];
  let lastError = 'unknown error';
  for (const cookie of attempts) {
    try {
      const data = await fetchList(cookie);
      if (data?.code && data.code !== 1) {
        lastError = data?.msg || `FebBox code ${data.code}`;
        continue;
      }
      return data?.data?.file_list || [];
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }

  throw new Error(`FebBox file list fetch failed (${lastError})`);
}

export async function febboxGetLinks(
  shareKey: string,
  fid: number,
  uiCookie?: string,
): Promise<{
  qualities: FebBoxQuality[];
  subtitles: FebBoxSubtitle[];
  audioTracks: FebBoxAudioTrack[];
}> {
  const headers: Record<string, string> = {
    ...FEBBOX_HEADERS,
    referer: `${FEBBOX_BASE}/share/${shareKey}`,
  };
  const cookieHeader = buildFebboxCookieHeader(uiCookie);
  if (cookieHeader) headers.cookie = cookieHeader;

  // Helpers

  const inferFormatFromUrl = (rawUrl: string): string => {
    const url = String(rawUrl || '').toLowerCase();
    if (!url) return '';
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.mkv')) return 'mkv';
    return '';
  };

  const pickQualityUrl = (item: any, fallback: string): string => {
    const candidates = [
      item?.hls_url,
      item?.play_url,
      item?.stream_url,
      item?.url,
      item?.download_url,
      item?.file_url,
      item?.src,
    ];

    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (!value) continue;
      if (/^https?:\/\//i.test(value) && value.toLowerCase().includes('.m3u8')) return value;
    }

    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (!value) continue;
      if (/^https?:\/\//i.test(value)) return value;
    }

    return String(fallback || '').trim();
  };

  const fetchJson = async (url: string) => {
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch {
        return { html: text }; // Treat as HTML if JSON fails
      }
    } catch {
      return null;
    }
  };

  const parseDirectSubtitles = (directData: any): FebBoxSubtitle[] => {
    const fileEntry = Array.isArray(directData?.data) ? directData.data[0] : directData?.data || {};
    const items = [
      ...(Array.isArray(fileEntry?.subtitle_list) ? fileEntry.subtitle_list : []),
      ...(Array.isArray(directData?.subtitle_list) ? directData.subtitle_list : []),
    ];
    const guessLang = (v: string) => {
      const l = v.toLowerCase();
      if (l.includes('pol') || l.includes('pl')) return 'pl';
      if (l.includes('spa') || l.includes('es')) return 'es';

      return 'en';
    };
    return items
      .map((item) => {
        const u = typeof item === 'string' ? item : item?.url || item?.src || '';
        if (!u) return null;
        return {
          url: u,
          language: guessLang(u),
          label: guessLang(u).toUpperCase(),
          type: u.toLowerCase().includes('.vtt') ? 'vtt' : 'srt',
        } as FebBoxSubtitle;
      })
      .filter((s): s is FebBoxSubtitle => !!s);
  };

  const parseDirectAudioTracks = (directData: any): FebBoxAudioTrack[] => {
    const fileEntry = Array.isArray(directData?.data) ? directData.data[0] : directData?.data || {};
    const items = [
      ...(Array.isArray(fileEntry?.audio_list) ? fileEntry.audio_list : []),
      ...(Array.isArray(directData?.audio_list) ? directData.audio_list : []),
    ];
    return items.map((item, index) => {
      const u = typeof item === 'string' ? item : item?.url || item?.src || '';
      const lang = String(item?.lang || 'en');
      return {
        id: index,
        name: lang.toUpperCase(),
        lang,
        isDefault: index === 0,
        url: u,
      } as FebBoxAudioTrack;
    });
  };

  const parseLinks = (data: any) => {
    const fileEntry = Array.isArray(data?.data) ? data.data[0] : data?.data || data || {};
    const rawList =
      fileEntry.quality_list || fileEntry.transcode_list || data.list || data.data?.list || {};
    const items = Array.isArray(rawList) ? rawList : Object.values(rawList);

    const qualities = items
      .map((q: any) => {
        const u = pickQualityUrl(q, String(fileEntry?.download_url || ''));
        if (!u) return null;

        return {
          url: u,
          quality: String(q?.quality || q?.label || 'ORG'),
          name: String(q?.label || q?.name || 'Original'),
          label: String(q?.label || q?.name || 'Original'),
          size: q?.file_size ? `${q.file_size}` : '',
          format: inferFormatFromUrl(u),
        };
      })
      .filter((q): q is FebBoxQuality => !!q);

    return {
      qualities,
      subtitles: parseDirectSubtitles(data),
      audioTracks: parseDirectAudioTracks(data),
    };
  };

  let allQualities: FebBoxQuality[] = [];
  let allSubtitles: FebBoxSubtitle[] = [];
  let allAudioTracks: FebBoxAudioTrack[] = [];

  // Fire all three quality endpoints in parallel
  const [r1, r2, r3] = await Promise.allSettled([
    fetchJson(
      `${FEBBOX_BASE}/file/file_download?fid=${fid}&share_key=${encodeURIComponent(shareKey)}&is_hls=1&is_html=0`,
    ),
    fetchJson(
      `${FEBBOX_BASE}/console/video_quality_list?fid=${fid}&share_id=${shareKey}&is_hls=1&is_html=0`,
    ),
    fetchJson(`${FEBBOX_BASE}/file/hls_playlist?fid=${fid}&share_key=${shareKey}`),
  ]);
  const d1 = r1.status === 'fulfilled' ? r1.value : null;
  const d2 = r2.status === 'fulfilled' ? r2.value : null;
  const d3 = r3.status === 'fulfilled' ? r3.value : null;

  if (d1) {
    const p = parseLinks(d1);
    allQualities.push(...p.qualities);
    allSubtitles.push(...p.subtitles);
    allAudioTracks.push(...p.audioTracks);
    if (d1.data?.[0]?.download_url) {
      const u = d1.data[0].download_url;
      if (!allQualities.find((q) => q.url === u)) {
        allQualities.push({
          url: u,
          quality: 'ORG',
          name: 'Original',
          label: 'Original',
          size: d1.data[0].file_size || '',
          format: inferFormatFromUrl(u),
        });
      }
    }
  }

  if (d2) {
    if (d2.html) {
      const regex = /class="file_quality"[^>]*data-url="([^"]*)"[^>]*data-quality="([^"]*)"/g;
      let m;
      while ((m = regex.exec(d2.html)) !== null) {
        if (!allQualities.find((q) => q.url === m![1])) {
          allQualities.push({
            url: m[1],
            quality: m[2],
            name: m[2],
            label: m[2],
            size: '',
            format: inferFormatFromUrl(m[1]),
          });
        }
      }
    } else {
      const p = parseLinks(d2);
      p.qualities.forEach((q) => {
        if (!allQualities.find((aq) => aq.url === q.url)) allQualities.push(q);
      });
    }
  }

  if (d3 && !d3.html) {
    const p = parseLinks(d3);
    p.qualities.forEach((q) => {
      if (!allQualities.find((aq) => aq.url === q.url)) allQualities.push(q);
    });
  }

  // Final Merge & Priority
  allQualities.sort((a, b) => {
    const aH = a.url.toLowerCase().includes('.m3u8');
    const bH = b.url.toLowerCase().includes('.m3u8');
    if (aH && !bH) return -1;
    if (!aH && bH) return 1;
    return 0;
  });

  return { qualities: allQualities, subtitles: allSubtitles, audioTracks: allAudioTracks };
}

export interface ResolvedStream {
  qualities: { url: string; quality: string; label: string; size: string; isHls?: boolean }[];
  subtitles: {
    url: string;
    language: string;
    label: string;
    type: 'srt' | 'vtt';
  }[];
  audioTracks: {
    id: number;
    name: string;
    lang: string;
    isDefault: boolean;
    url?: string;
  }[];
  shareKey: string;
  fileName?: string;
}

export interface ResolveLog {
  step: string;
  status: 'ok' | 'fail';
  detail?: string;
}

const RESOLVE_CACHE_TTL_MS = 10 * 60 * 1000;
const resolveCache = new Map<string, { expires: number; promise: Promise<{ stream: ResolvedStream | null; logs: ResolveLog[] }> }>();

function resolveCacheKey(options: { title: string; tmdbId: string; type: 'movie' | 'show'; season?: number; episode?: number; uiCookie?: string }) {
  return [options.type, options.tmdbId, options.title.toLowerCase(), options.season ?? 0, options.episode ?? 0, Boolean(options.uiCookie?.trim())].join('|');
}

function normalizeTitle(title: string): string {
  let t = title.trim().toLowerCase();
  if (t !== 'the movie' && t.endsWith('the movie')) t = t.replace(/the movie$/, '');
  if (t !== 'the series' && t.endsWith('the series')) t = t.replace(/the series$/, '');
  return t.replace(/['":]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function compareTitle(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}

export async function resolveStream(options: {
  title: string;
  tmdbId: string;
  type: 'movie' | 'show';
  season?: number;
  episode?: number;
  uiCookie?: string;
  releaseYear?: number;
}): Promise<{ stream: ResolvedStream | null; logs: ResolveLog[] }> {
  const cacheKey = resolveCacheKey(options);
  const cached = resolveCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.promise;

  const promise = resolveStreamUncached(options);
  resolveCache.set(cacheKey, { expires: Date.now() + RESOLVE_CACHE_TTL_MS, promise });
  try {
    const result = await promise;
    if (!result.stream) {
      resolveCache.delete(cacheKey);
    }
    return result;
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError' || /abort|timeout/i.test(err?.message || '');
    if (!isAbort) resolveCache.delete(cacheKey);
    throw err;
  }
}

async function resolveStreamUncached(options: {
  title: string;
  tmdbId: string;
  type: 'movie' | 'show';
  season?: number;
  episode?: number;
  uiCookie?: string;
  releaseYear?: number;
}): Promise<{ stream: ResolvedStream | null; logs: ResolveLog[] }> {
  const { title, tmdbId, type, season, episode, uiCookie, releaseYear } = options;
  const logs: ResolveLog[] = [];

  // Step 1: Search Showbox
  let results: any[];
  try {
    const searchType = type === 'movie' ? 'movie' : 'tv';
    results = await searchShowbox(title, searchType);
    if (!results || results.length === 0) {
      logs.push({ step: 'search', status: 'fail', detail: `No results for "${title}"` });
      return { stream: null, logs };
    }
    logs.push({ step: 'search', status: 'ok', detail: `${results.length} results` });
  } catch (err: any) {
    logs.push({ step: 'search', status: 'fail', detail: err.message });
    return { stream: null, logs };
  }

  const boxType = type === 'movie' ? 1 : 2;
  // Match using normalised title (p-stream compareTitle) + year when known.
  // Year match: exact > ±1 (release-vs-air drift) > unknown.
  const scoredMatches = [...results]
    .map((r: any, index: number) => {
      const rTitle = r.title || r.name || '';
      const rYear = Number(r.year) || Number(String(r.release_date || '').slice(0, 4)) || 0;
      const titleHit = compareTitle(rTitle, title);
      const yearHit = releaseYear ? rYear === releaseYear : true;
      const yearNear = releaseYear ? Math.abs(rYear - releaseYear) <= 1 : true;
      // Soft contains fallback when both titles share a long substring
      const a = normalizeTitle(rTitle);
      const b = normalizeTitle(title);
      const contains = a && b && (a.includes(b) || b.includes(a));
      let score = 0;
      if (titleHit && yearHit) score = 6;
      else if (titleHit && yearNear) score = 5;
      else if (titleHit) score = 4;
      else if (contains && yearNear) score = 3;
      else if (contains) score = 2;
      else if (index === 0) score = 1;
      return { item: r, index, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const orderedMatches = scoredMatches
    .filter((m, index, all) => all.findIndex((x) => x.item.id === m.item.id) === index)
    .slice(0, 8);

  let selectedMatch: any | undefined;
  let shareKey: string | null = null;
  let files: FebBoxFile[] = [];
  let shareSessionCookie: string | undefined;
  const matchFailures: string[] = [];

  // Silence unused-var warning while keeping tmdbId in the public type signature.
  void tmdbId;



  for (const candidate of orderedMatches) {
    const match = candidate.item;
    const showboxId = match.id;
    const matchName = match.title || match.name;
    try {
      const candidateShareKey = await getFebBoxShareKey(showboxId, boxType as 1 | 2);
      if (!candidateShareKey) {
        matchFailures.push(`${matchName}: no share link`);
        continue;
      }
      const candidateCookie = await getFebboxShareSessionCookie(candidateShareKey, uiCookie);
      const candidateFiles = await febboxGetFileList(candidateShareKey, 0, candidateCookie);
      if (!candidateFiles?.length) {
        matchFailures.push(`${matchName}: empty file list`);
        continue;
      }
      selectedMatch = match;
      shareKey = candidateShareKey;
      shareSessionCookie = candidateCookie;
      files = candidateFiles;
      break;
    } catch (err: any) {
      matchFailures.push(`${matchName}: ${err?.message || String(err)}`);
    }
  }

  if (!selectedMatch || !shareKey || !files.length) {
    logs.push({
      step: 'match',
      status: 'fail',
      detail: matchFailures.slice(0, 3).join(' | ') || 'No usable FebBox share found',
    });
    return { stream: null, logs };
  }

  logs.push({
    step: 'match',
    status: 'ok',
    detail: `id=${selectedMatch.id} "${selectedMatch.title || selectedMatch.name}"`,
  });
  logs.push({ step: 'shareKey', status: 'ok', detail: shareKey });
  logs.push({ step: 'fileList', status: 'ok', detail: `${files.length} files` });

  // Step 5: Navigate to target file
  let targetFile: FebBoxFile | undefined;
  try {
    if (type === 'movie') {
      targetFile = files.filter((f) => !f.is_dir).sort((a, b) => b.file_size - a.file_size)[0];
    } else {
      const seasonNum = season || 1;
      const episodeNum = episode || 1;

      const seasonDir = files.find((f) => {
        if (!f.is_dir) return false;
        const name = f.file_name.toLowerCase();
        return (
          name.includes(`season ${seasonNum}`) ||
          name.includes(`s${String(seasonNum).padStart(2, '0')}`) ||
          name.includes(`season${seasonNum}`) ||
          name === `s${seasonNum}`
        );
      });

      if (seasonDir) {
        files = await febboxGetFileList(shareKey, seasonDir.fid, shareSessionCookie);
        logs.push({
          step: 'seasonNav',
          status: 'ok',
          detail: seasonDir.file_name,
        });
      }

      const epPad = String(episodeNum).padStart(2, '0');
      targetFile = files.find((f) => {
        if (f.is_dir) return false;
        const name = f.file_name.toLowerCase();
        return (
          name.includes(`e${epPad}`) ||
          name.includes(`episode ${episodeNum}`) ||
          name.includes(`episode${episodeNum}`) ||
          name.includes(`ep${epPad}`) ||
          name.includes(`.e${epPad}.`)
        );
      });

      if (!targetFile) {
        const videoFiles = files
          .filter((f) => !f.is_dir)
          .sort((a, b) => a.file_name.localeCompare(b.file_name));
        targetFile = videoFiles[episodeNum - 1] || videoFiles[0];
      }
    }

    if (!targetFile) {
      logs.push({
        step: 'findFile',
        status: 'fail',
        detail: 'No target file found',
      });
      return { stream: null, logs };
    }
    logs.push({
      step: 'findFile',
      status: 'ok',
      detail: `${targetFile.file_name} (fid=${targetFile.fid})`,
    });
  } catch (err: any) {
    logs.push({ step: 'findFile', status: 'fail', detail: err.message });
    return { stream: null, logs };
  }

  // Step 6: Get video links + merge p-stream febbox subtitles in parallel
  try {
    const { scrapeFebboxCaptions } = await import('@/utils/externalSubtitles/febbox');
    const [linkData, pstreamSubs] = await Promise.all([
      febboxGetLinks(shareKey, targetFile.fid, shareSessionCookie),
      scrapeFebboxCaptions(tmdbId, season, episode).catch(() => []),
    ]);
    const links = linkData.qualities;
    if (!links || links.length === 0) {
      logs.push({ step: 'getLinks', status: 'fail', detail: 'No qualities extracted' });
      return { stream: null, logs };
    }

    // Merge subtitle lists — dedupe by URL, prefer febbox-native, then p-stream.
    const seenSubs = new Set<string>();
    const mergedSubs: FebBoxSubtitle[] = [];
    for (const s of [...linkData.subtitles, ...pstreamSubs]) {
      if (!s?.url || seenSubs.has(s.url)) continue;
      seenSubs.add(s.url);
      mergedSubs.push({ url: s.url, language: s.language, label: s.label, type: s.type });
    }

    logs.push({
      step: 'getLinks',
      status: 'ok',
      detail: `${links.length} qualities, ${mergedSubs.length} subs (${pstreamSubs.length} via p-stream), ${linkData.audioTracks.length} audio`,
    });

    return {
      stream: {
        qualities: links.map((l) => ({
          // Return the raw FebBox URL — presigned URLs play directly in the browser.
          url: l.url,
          quality: l.quality,
          label: l.name || l.quality,
          size: l.size,
          isHls: l.url.toLowerCase().includes('.m3u8') || l.format === 'hls',
        })),
        subtitles: mergedSubs,
        audioTracks: linkData.audioTracks,
        shareKey,
        fileName: targetFile.file_name,
      },
      logs,
    };
  } catch (err: any) {
    logs.push({ step: 'getLinks', status: 'fail', detail: err.message });
    return { stream: null, logs };
  }
}

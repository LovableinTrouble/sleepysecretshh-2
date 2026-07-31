/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StreamQuality {
  url: string;
  label: string;
  quality: string;
  format: "hls" | "mp4" | "mkv" | "dash" | "unknown";
  headers?: Record<string, string>;
  size?: string;
  resolution?: number;
  sourceId?: ProviderId;
  sourceName?: string;
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

export function buildEmbedsOnly(input: ResolveInput): ResolveResult {
  return { sources: [], primary: undefined };
}

// ============================================================
// Direct HLS scraper — VidPhantom only. It returns raw provider HLS
// URLs through its signed proxy endpoint; we pass every URL through
// our own playlist proxy so hls.js can load manifests, keys and
// segments without browser CORS/referer stalls.
// ============================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export type ProviderId = "febbox" | "nimbus" | "orion" | "vega" | "atlas";
export interface ProviderMeta { id: ProviderId; name: string; }
export const PROVIDERS: ProviderMeta[] = [
  { id: "febbox", name: "Febbox" },
  { id: "orion", name: "Orion" },
  { id: "vega", name: "Vega" },
  { id: "atlas", name: "Atlas" },
  { id: "nimbus", name: "Nimbus" },  // vidphantom (last)
];

const SLEEPY_SOURCES = "https://sleepy-sources.pxifusionxx.workers.dev";
const SLEEPY_SLUGS: Partial<Record<ProviderId, string>> = {
  orion: "peachify",
  vega: "moviebox",
  atlas: "vidrock",
};

const LANGUAGE_CODES: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt",
  arabic: "ar", bengali: "bn", bulgarian: "bg", chinese: "zh", croatian: "hr", czech: "cs",
  danish: "da", dutch: "nl", estonian: "et", filipino: "tl", finnish: "fi", greek: "el",
  hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", japanese: "ja", korean: "ko",
  malay: "ms", norwegian: "no", polish: "pl", romanian: "ro", russian: "ru", swedish: "sv",
  thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", vietnamese: "vi",
};

function detectQuality(url: string, hint?: string): { quality: string; resolution?: number } {
  const s = `${url} ${hint ?? ""}`;
  if (/2160|4k|uhd/i.test(s)) return { quality: "4K", resolution: 2160 };
  if (/1440/i.test(s)) return { quality: "1440p", resolution: 1440 };
  if (/1080/i.test(s)) return { quality: "1080p", resolution: 1080 };
  if (/720/i.test(s)) return { quality: "720p", resolution: 720 };
  if (/480/i.test(s)) return { quality: "480p", resolution: 480 };
  if (/360/i.test(s)) return { quality: "360p", resolution: 360 };
  return { quality: "Auto" };
}

function qualityRank(q: StreamQuality): number {
  if (q.resolution) return q.resolution;
  if (/4k|uhd/i.test(q.quality)) return 2160;
  const m = q.quality.match(/(\d{3,4})p?/i);
  return m ? Number(m[1]) : 0;
}

function uniqueByQuality(items: StreamQuality[]): StreamQuality[] {
  const seen = new Set<string>();
  const out: StreamQuality[] = [];
  for (const item of items.sort((a, b) => qualityRank(b) - qualityRank(a))) {
    const label = item.quality.toLowerCase().replace(/\s+\d+$/, "").trim();
    const key = item.resolution ? String(item.resolution) : label.startsWith("auto") ? "auto" : label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function proxyUrl(raw: string, referer?: string) {
  const p = new URLSearchParams();
  p.set("url", raw);
  if (referer) p.set("ref", referer);
  return `/api/public/iptv-proxy?${p.toString()}`;
}

// Some upstreams 403 direct browser requests (hotlink protection) which makes
// playback hang forever on a dead manifest. Probe each candidate server-side:
// playable as-is -> keep direct; playable with headers -> route via our proxy;
// dead either way -> drop it so the player moves to the next provider.
async function probeStream(rawUrl: string): Promise<string | null> {
  const attempt = async (headers: Record<string, string>) => {
    try {
      const res = await fetch(rawUrl, {
        headers: { ...headers, Range: "bytes=0-1" },
        signal: AbortSignal.timeout(7000),
        redirect: "follow",
      });
      // consume/cancel so the socket is released
      try { await res.body?.cancel(); } catch { /* noop */ }
      return res.ok || res.status === 206;
    } catch { return false; }
  };

  let origin = "";
  try { origin = new URL(rawUrl).origin; } catch { /* noop */ }
  // Race both forms instead of waiting up to seven seconds twice. Prefer the
  // direct URL when it works; otherwise retain the header-capable proxy path.
  const [direct, withHeaders] = await Promise.all([
    attempt({}),
    attempt({ "User-Agent": UA, Referer: origin ? `${origin}/` : "", Origin: origin }),
  ]);
  if (direct) return rawUrl;
  if (withHeaders) return proxyUrl(rawUrl, origin ? `${origin}/` : undefined);
  return null;
}

async function keepPlayable(items: StreamQuality[], limit = 6): Promise<StreamQuality[]> {
  const checked = await Promise.all(
    items.slice(0, limit).map(async (q) => {
      const url = await probeStream(q.url);
      return url ? { ...q, url } : null;
    }),
  );
  return checked.filter((q): q is StreamQuality => q !== null);
}

async function scrapeVidPhantom(providerId: ProviderId, providerName: string, i: ResolveInput, fast = false): Promise<StreamQuality[]> {
  const path =
    i.type === "movie"
      ? `movie/${i.tmdbId}`
      : `tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  const results: { name: string; url: string }[] = [];
  const controller = new AbortController();
  // TV endpoints often stream slower; give the fast pass more headroom so shows aren't cut off mid-response.
  const isShow = i.type !== "movie";
  const timer = setTimeout(() => controller.abort(), fast ? (isShow ? 12000 : 9000) : (isShow ? 22000 : 18000));
  try {
    const res = await fetch(`https://vidphantom.com/api/hls/${path}`, {
      headers: { "User-Agent": UA, Accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return [];
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      for (;;) {
        const idx = buf.indexOf("\n\n");
        if (idx === -1) break;
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const j = JSON.parse(line.slice(5).trim());
          if (j.done) return uniqueByQuality(toQualities(results, providerId, providerName, true));
          if (j.proxiedUrl) {
            results.push({ name: String(j.name || "Auto"), url: String(j.proxiedUrl) });
            if (fast) return uniqueByQuality(toQualities(results, providerId, providerName, true));
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* timeout still returns whatever arrived */ }
  finally { clearTimeout(timer); controller.abort(); }
  return uniqueByQuality(toQualities(results, providerId, providerName, true));
}

function toQualities(results: { name: string; url: string; quality?: string; type?: string }[], providerId: ProviderId, providerName: string, alreadyProxied = false): StreamQuality[] {
  return results
    .filter((s) => s.url)
    .map((s, idx) => {
      const kind = String(s.type || "").toLowerCase();
      const lower = s.url.toLowerCase();
      const format: StreamQuality["format"] =
        kind === "dash" || kind === "mpd" || lower.includes(".mpd") ? "dash"
        : kind === "hls" || kind === "m3u8" || lower.includes(".m3u8") || s.url.includes("/hls") ? "hls"
        : kind === "mp4" ? "mp4"
        : kind === "mkv" || lower.includes(".mkv") ? "mkv"
        : lower.includes(".mp4") || lower.includes("mp4-proxy") ? "mp4"
        : "unknown";
      const q = detectQuality(s.url, `${s.quality ?? ""} ${s.name}`);
      return {
        url: alreadyProxied ? s.url : proxyUrl(s.url),
        label: providerName,
        quality: q.quality,
        format,
        resolution: q.resolution,
        sourceId: providerId,
        sourceName: providerName,
      };
    });
}

// Sleepy Sources worker — one shape-tolerant parser for every upstream provider.
// Handles: sources[] (hls/m3u8), source.qualities{} (mp4/dash), single url, mpd/dash.
function collectSleepyItems(json: any): { url: string; name: string; quality?: string; type?: string }[] {
  const out: { url: string; name: string; quality?: string; type?: string }[] = [];
  const push = (url: any, quality?: any, type?: any, name?: any) => {
    const u = String(url || "");
    if (!u.startsWith("http")) return;
    out.push({ url: u, quality: quality != null ? String(quality) : "", type: String(type || ""), name: String(name || quality || "Auto") });
  };

  if (Array.isArray(json?.sources)) {
    for (const s of json.sources) push(s?.url ?? s?.file ?? s, s?.quality ?? s?.label, s?.type, s?.server);
  }
  const src = json?.source;
  if (src) {
    if (src.qualities && typeof src.qualities === "object") {
      for (const [key, val] of Object.entries<any>(src.qualities)) {
        push(val?.url ?? val, key, val?.type ?? src.type, src.server);
      }
    }
    if (src.url) push(src.url, src.quality ?? json?.quality, src.type, src.server);
  }
  if (json?.url) push(json.url, json?.quality, json?.type, json?.provider);

  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

async function scrapeSleepySource(providerId: ProviderId, providerName: string, i: ResolveInput, fast = false): Promise<StreamQuality[]> {
  const slug = SLEEPY_SLUGS[providerId];
  if (!slug) return [];
  const params = new URLSearchParams({ type: i.type === "movie" ? "movie" : "tv", tmdb: i.tmdbId });
  if (i.type !== "movie") {
    params.set("season", String(i.season ?? 1));
    params.set("episode", String(i.episode ?? 1));
  }
  try {
    const res = await fetch(`${SLEEPY_SOURCES}/${slug}?${params.toString()}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(fast ? (i.type === "movie" ? 12000 : 15000) : 25000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    if (json?.error) return [];
    const items = collectSleepyItems(json);
    if (!items.length) return [];
    const parsed = uniqueByQuality(toQualities(items, providerId, providerName, true));
    // Verify the manifests actually serve before we hand them to the player.
    // Fast pass: only probe the top couple of candidates so the first
    // working stream comes back as quickly as possible.
    const playable = await keepPlayable(parsed, fast ? 2 : 6);
    return fast ? playable.slice(0, 1) : playable;
  } catch { return []; }
}

async function fetchWorkerSubs(i: ResolveInput): Promise<StreamSubtitle[]> {
  const params = new URLSearchParams({ type: i.type === "movie" ? "movie" : "tv", tmdb: i.tmdbId });
  if (i.type !== "movie") {
    params.set("season", String(i.season ?? 1));
    params.set("episode", String(i.episode ?? 1));
  }
  try {
    const res = await fetch(`${SLEEPY_SOURCES}/vidfast-subtitles?${params.toString()}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const arr: any[] = Array.isArray(json?.subtitles) ? json.subtitles : [];
    return arr
      .filter((s) => s?.url)
      .slice(0, 40)
      .map((s) => {
        const raw = String(s.url);
        const lang = String(s.language || s.display || "en").toLowerCase();
        return {
          url: `/api/public/subtitle?url=${encodeURIComponent(raw)}`,
          language: (LANGUAGE_CODES[lang] ?? lang.slice(0, 2)) || "en",
          label: String(s.display || s.language || "Subtitle"),
          type: (/\.srt/i.test(raw) ? "srt" : "vtt") as "srt" | "vtt",
        };
      });
  } catch { return []; }
}

async function resolveSubtitles(i: ResolveInput): Promise<StreamSubtitle[]> {
  const [worker, legacy] = await Promise.all([fetchWorkerSubs(i), fetchSubs(i)]);
  const seenUrls = new Set<string>();
  const seenTracks = new Set<string>();
  return [...worker, ...legacy].filter((s) => {
    const normalizedLabel = s.label.toLowerCase().replace(/\b(cc|sdh|forced|subtitle|subtitles)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const trackKey = `${s.language.toLowerCase()}|${normalizedLabel || s.language.toLowerCase()}`;
    if (seenUrls.has(s.url) || seenTracks.has(trackKey)) return false;
    seenUrls.add(s.url);
    seenTracks.add(trackKey);
    return true;
  });
}

export async function resolveProviderById(id: ProviderId, input: ResolveInput, options: { fast?: boolean; febboxCookie?: string } = {}): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const meta = PROVIDERS.find((p) => p.id === id);
  if (!meta) return { qualities: [], subtitles: [] };
  const qualitiesPromise = id === "nimbus"
    ? scrapeVidPhantom(id, meta.name, input, options.fast)
    : id === "febbox"
      ? scrapeFebbox(id, meta.name, input, options.febboxCookie)
      : scrapeSleepySource(id, meta.name, input, options.fast);
  // The first-pass resolver must not wait up to ten seconds for captions before
  // handing a playable manifest to the browser. The background full pass adds
  // captions immediately afterward.
  if (options.fast) return { qualities: await qualitiesPromise, subtitles: [] };
  const [qualities, subtitles] = await Promise.all([qualitiesPromise, resolveSubtitles(input)]);
  return { qualities, subtitles };
}

async function scrapeFebbox(providerId: ProviderId, providerName: string, i: ResolveInput, cookie?: string): Promise<StreamQuality[]> {
  const trimmed = String(cookie || "").trim();
  if (!trimmed) return [];
  try {
    const { resolveStream } = await import("./febbox.server");
    const out = await resolveStream({
      title: i.title,
      tmdbId: i.tmdbId,
      type: i.type === "movie" ? "movie" : "show",
      season: i.season,
      episode: i.episode,
      uiCookie: trimmed,
    });
    const stream = out.stream;
    if (!stream || !stream.qualities.length) return [];
    const items = stream.qualities.map((q) => ({
      url: q.url,
      name: q.label || q.quality || "Auto",
      quality: q.quality,
      type: q.url.toLowerCase().includes(".m3u8") ? "hls" : q.url.toLowerCase().includes(".mkv") ? "mkv" : q.url.toLowerCase().includes(".mp4") ? "mp4" : "",
    }));
    // FebBox links are already signed CDN URLs. Proxying every segment through
    // our server adds a full extra round trip and makes seeking especially slow.
    return uniqueByQuality(toQualities(items, providerId, providerName, true));
  } catch {
    return [];
  }
}

async function scrapeVaplayer(providerId: ProviderId, providerName: string, i: ResolveInput, fast = false): Promise<StreamQuality[]> {
  const params = new URLSearchParams({ tmdb: i.tmdbId });
  if (i.type === "movie") params.set("type", "movie");
  else {
    params.set("type", "tv");
    params.set("season", String(i.season ?? 1));
    params.set("episode", String(i.episode ?? 1));
  }
  try {
    const res = await fetch(`https://streamdata.vaplayer.ru/api.php?${params.toString()}`, {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://nextgencloudfabric.com/" },
      signal: AbortSignal.timeout(fast ? 6000 : 12000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const urls: any[] = Array.isArray(json?.stream_urls) ? json.stream_urls : [];
    const items = urls.map((u) => {
      const url = typeof u === "string" ? u : String(u?.url || u?.stream || "");
      const quality = typeof u === "string" ? "" : String(u?.quality || u?.label || "");
      return { url, name: quality || "Auto", quality, type: "hls" };
    }).filter((s) => s.url);
    const qualities = toQualities(items, providerId, providerName, false);
    const unique = uniqueByQuality(qualities);
    return fast ? unique.slice(0, 1) : unique;
  } catch { return []; }
}

async function fetchSubs(i: ResolveInput): Promise<StreamSubtitle[]> {
  try {
    const url =
      i.type === "movie"
        ? `https://sub.1x2.space/api/movie/${i.tmdbId}`
        : `https://sub.1x2.space/api/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s: any) => String(s.status || "cached") === "cached" && s.url)
      .slice(0, 40)
      .map((s: any) => {
        const rawUrl = String(s.url);
        const absolute = rawUrl.startsWith("http") ? rawUrl : `https://sub.1x2.space${rawUrl}`;
        const lang = String(s.language || s.label || "English").toLowerCase();
        return {
          url: `/api/public/subtitle?url=${encodeURIComponent(absolute)}`,
          language: (LANGUAGE_CODES[lang] ?? lang.slice(0, 2)) || "en",
          label: String(s.label || s.language || "Subtitle"),
          type: /\.srt/i.test(rawUrl) ? "srt" : "vtt",
        };
      });
  } catch { return []; }
}

export async function resolveDirect(input: ResolveInput): Promise<ResolveResult> {
  const [primary, subs] = await Promise.all([
    scrapeVidPhantom("nimbus", "Nimbus", input),
    fetchSubs(input),
  ]);
  if (!primary.length) throw new Error("No streams connected for this title yet. Try again in a moment.");

  const direct: DirectSource = {
    kind: "direct",
    id: "direct",
    name: "Sleepy Player",
    badge: "HLS",
    qualities: primary,
    subtitles: subs,
  };
  return { sources: [direct], primary: direct.id };
}

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

export type ProviderId = "febbox" | "nimbus" | "aurora" | "orion" | "vega" | "atlas" | "comet";
export interface ProviderMeta { id: ProviderId; name: string; }
export const PROVIDERS: ProviderMeta[] = [
  { id: "febbox", name: "Febbox" },
  { id: "aurora", name: "Aurora" },  // videasy (yoru)
  { id: "orion",  name: "Orion"  },  // peachify
  { id: "vega",   name: "Vega"   },  // moviebox
  { id: "atlas",  name: "Atlas"  },  // vidrock
  { id: "comet",  name: "Comet"  },  // vidfast
  { id: "nimbus", name: "Nimbus" },  // vidphantom (last)
];

const SLEEPY_SOURCES = "https://sleepy-sources.pxifusionxx.workers.dev";
const SLEEPY_SLUGS: Partial<Record<ProviderId, string>> = {
  aurora: "videasy",
  orion: "peachify",
  vega: "moviebox",
  atlas: "vidrock",
  comet: "vidfast",
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

async function scrapeVidPhantom(providerId: ProviderId, providerName: string, i: ResolveInput, fast = false): Promise<StreamQuality[]> {
  const path =
    i.type === "movie"
      ? `movie/${i.tmdbId}`
      : `tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  const results: { name: string; url: string }[] = [];
  const controller = new AbortController();
  // TV endpoints often stream slower; give the fast pass more headroom so shows aren't cut off mid-response.
  const isShow = i.type !== "movie";
  const timer = setTimeout(() => controller.abort(), fast ? (isShow ? 4500 : 3000) : (isShow ? 9000 : 6000));
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
      const format: StreamQuality["format"] =
        kind === "hls" || s.url.toLowerCase().includes(".m3u8") || s.url.includes("/hls") ? "hls"
        : kind === "mp4" ? "mp4"
        : kind === "mkv" ? "mkv"
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

async function scrapeStreamVault(host: string, providerId: ProviderId, providerName: string, i: ResolveInput, fast = false): Promise<StreamQuality[]> {
  const path =
    i.type === "movie"
      ? `movie/${i.tmdbId}`
      : `tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  try {
    const res = await fetch(`https://${host}/api/embed-streams/${path}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      // Shows respond ~2-3s on cold path; bump fast timeout so we don't return empty on TV.
      signal: AbortSignal.timeout(fast ? (i.type === "movie" ? 3200 : 4500) : 7000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const streams: any[] = Array.isArray(json?.streams) ? json.streams : [];
    const parsed = uniqueByQuality(toQualities(streams.map((s) => ({
      url: String(s?.url || ""),
      name: String(s?.provider || s?.quality || "Auto"),
      quality: String(s?.quality || ""),
      type: String(s?.type || ""),
    })), providerId, providerName));
    return fast ? parsed.slice(0, 1) : parsed;
  } catch { return []; }
}

const PROVIDER_HOSTS: Record<Exclude<ProviderId, "nimbus" | "vaplayer" | "febbox">, string> = {
  aurora: "storage1.streamvaultsrc.click",
  orion:  "storage2.streamvaultsrc.click",
  vega:   "storage3.streamvaultsrc.click",
  atlas:  "storage4.streamvaultsrc.click",
};

export async function resolveProviderById(id: ProviderId, input: ResolveInput, options: { fast?: boolean; febboxCookie?: string } = {}): Promise<{ qualities: StreamQuality[]; subtitles: StreamSubtitle[] }> {
  const meta = PROVIDERS.find((p) => p.id === id);
  if (!meta) return { qualities: [], subtitles: [] };
  const [qualities, subs] = await Promise.all([
    id === "nimbus"
      ? scrapeVidPhantom(id, meta.name, input, options.fast)
      : id === "vaplayer"
        ? scrapeVaplayer(id, meta.name, input, options.fast)
        : id === "febbox"
          ? scrapeFebbox(id, meta.name, input, options.febboxCookie)
          : scrapeStreamVault(PROVIDER_HOSTS[id as Exclude<ProviderId, "nimbus" | "vaplayer" | "febbox">], id, meta.name, input, options.fast),
    // Only Nimbus fetches subtitles from 1x2 to keep things fast; other providers reuse via merge on the client.
    id === "nimbus" || id === "febbox" ? fetchSubs(input) : Promise.resolve<StreamSubtitle[]>([]),
  ]);
  return { qualities, subtitles: subs };
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
    return uniqueByQuality(toQualities(items, providerId, providerName));
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

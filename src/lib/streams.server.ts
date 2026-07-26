/* eslint-disable @typescript-eslint/no-explicit-any */

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

function mkEmbed(id: string, name: string, badge: string, url: string): EmbedSource {
  return { kind: "embed", id, name, badge, url };
}

function buildEmbeds(i: ResolveInput): EmbedSource[] {
  const isShow = i.type !== "movie";
  const season = i.season ?? 1;
  const episode = i.episode ?? 1;
  const path = isShow
    ? `embed/tv/${i.tmdbId}/${season}/${episode}`
    : `embed/movie/${i.tmdbId}`;
  // VidKing embed. Sleepy's gold accent via ?color=, all features enabled.
  const params = new URLSearchParams({
    color: "e8b86d",
    autoPlay: "true",
    nextEpisode: "true",
    episodeSelector: "true",
  });
  return [
    mkEmbed(
      "vidking",
      "VidKing",
      "Embed",
      `https://www.vidking.net/${path}?${params.toString()}`,
    ),
  ];
}

export function buildEmbedsOnly(input: ResolveInput): ResolveResult {
  const sources = buildEmbeds(input);
  return { sources, primary: sources[0]?.id };
}

// ============================================================
// Direct HLS scraper — VidPhantom (primary) with fallback to
// stream-providers (Vidlink, NoTorrent, VidSrc). All URLs proxied
// through /api/public/iptv-proxy so browser plays them without
// CORS/referer issues.
// ============================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const CLEAN_NAMES: Record<string, string> = {
  StreamVault: "Nebula",
  VidKing: "Aurora",
  VidRock: "Orion",
  VidRock2: "Orion",
  Vidzee: "Vega",
  Xprime: "Lyra",
  Vidsrc: "Polaris",
};

function proxyUrl(raw: string, referer?: string) {
  const p = new URLSearchParams();
  p.set("url", raw);
  if (referer) p.set("ref", referer);
  return `/api/public/iptv-proxy?${p.toString()}`;
}

async function scrapeVidPhantom(i: ResolveInput): Promise<StreamQuality[]> {
  const path =
    i.type === "movie"
      ? `movie/${i.tmdbId}`
      : `tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`;
  const results: { name: string; url: string; subs: any[] }[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://vidphantom.com/api/hls/${path}`, {
        headers: { "User-Agent": UA, Accept: "text/event-stream" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok || !res.body) continue;
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
            if (j.done) break;
            if (j.proxiedUrl) results.push({ name: j.name, url: j.proxiedUrl, subs: j.subtitles ?? [] });
          } catch { /* ignore */ }
        }
      }
      if (results.length) break;
    } catch { /* retry */ }
  }
  return results.map((r) => ({
    url: r.url,
    label: CLEAN_NAMES[r.name] ?? r.name,
    quality: "Auto",
    format: "hls" as const,
  }));
}

async function scrapeFallback(i: ResolveInput): Promise<StreamQuality[]> {
  const { PROVIDERS } = await import("./stream-providers");
  const type: "movie" | "tv" = i.type === "movie" ? "movie" : "tv";
  const out: StreamQuality[] = [];
  for (const p of PROVIDERS) {
    try {
      const streams = await p.fetch(i.tmdbId, type, i.season, i.episode);
      for (const s of streams) {
        out.push({
          url: s.url,
          label: CLEAN_NAMES[p.nickname] ?? p.nickname,
          quality: s.quality || "Auto",
          format: s.type === "hls" ? "hls" : "mp4",
        });
      }
      if (out.length) break;
    } catch { /* try next */ }
  }
  return out;
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
    return arr.slice(0, 30).map((s: any) => ({
      url: proxyUrl(String(s.url)),
      language: String(s.language || "en"),
      label: String(s.label || s.language || "Subtitle"),
      type: /\.srt/i.test(String(s.url)) ? "srt" : "vtt",
    }));
  } catch { return []; }
}

export async function resolveDirect(input: ResolveInput): Promise<ResolveResult> {
  // Try VidPhantom, then fallback scrapers (Vidlink/NoTorrent/VidSrc).
  const [primary, subs] = await Promise.all([
    scrapeVidPhantom(input),
    fetchSubs(input),
  ]);
  let qualities = primary;
  if (!qualities.length) qualities = await scrapeFallback(input);

  const embeds = buildEmbeds(input);
  if (!qualities.length) {
    return { sources: embeds, primary: embeds[0]?.id };
  }

  const direct: DirectSource = {
    kind: "direct",
    id: "direct",
    name: "Sleepy Player",
    badge: "HLS",
    qualities,
    subtitles: subs,
  };
  return { sources: [direct, ...embeds], primary: direct.id };
}

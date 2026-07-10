/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface DownloadItem {
  id: string;
  url: string;
  source: string;
  quality: string;
  type: "mp4" | "hls" | "mkv" | "file";
  size?: string;
  fileName?: string;
  headers?: Record<string, string>;
}

export interface DownloadsResult {
  ok: boolean;
  downloads: DownloadItem[];
  subtitles: { url: string; label: string; language: string; type: "srt" | "vtt" }[];
  error?: string;
}

const DownloadsSchema = z.object({
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
});

function inferType(url: string): DownloadItem["type"] {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes(".mkv")) return "mkv";
  if (lower.includes(".mp4")) return "mp4";
  return "file";
}

/**
 * Downloads resolver — uses the public autoembed.cc provider chain, which
 * returns direct playable stream URLs (mp4/m3u8) keyed by TMDB id.
 * Endpoints:
 *   Movie: https://tom.autoembed.cc/api/getVideoSource?type=movie&id={tmdb}
 *   TV:    https://tom.autoembed.cc/api/getVideoSource?type=tv&id={tmdb}/{s}/{e}
 * Response: { videoSource: string, subtitles?: [{ file, label, kind }] }
 */
/**
 * Multi-provider downloader chain. Tries several public TMDB-keyed stream
 * APIs in parallel and returns every direct playable URL they hand back.
 *
 * Providers tried:
 *   - rgshows.me           — JSON { stream: { url, captions } }
 *   - vidsrc.icu / .vip    — JSON { url }
 *   - autoembed.cc         — JSON { videoSource, subtitles }
 *   - vidapi.xyz           — JSON { url }
 */

type Input = z.infer<typeof DownloadsSchema>;
type ProviderHit = {
  downloads: DownloadItem[];
  subs: DownloadsResult["subtitles"];
};

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

async function safeJson(url: string, referer?: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json, */*",
        "user-agent": UA,
        ...(referer ? { referer, origin: new URL(referer).origin } : {}),
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function qualityGuess(url: string): string {
  if (/2160|4k/i.test(url)) return "4K";
  if (/1080/.test(url)) return "1080p";
  if (/720/.test(url)) return "720p";
  if (/480/.test(url)) return "480p";
  return "Auto";
}

function toItem(url: string, source: string): DownloadItem | null {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return {
    id: `${source}-${u}`,
    url: u,
    source,
    quality: qualityGuess(u),
    type: inferType(u),
  };
}

// ── Providers ────────────────────────────────────────────────────────────

async function providerRgshows(i: Input): Promise<ProviderHit | null> {
  const url =
    i.type === "show"
      ? `https://api.rgshows.me/main/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
      : `https://api.rgshows.me/main/movie/${i.tmdbId}`;
  const data = await safeJson(url, "https://rgshows.me/");
  if (!data) return null;
  const stream = data?.stream ?? data;
  const src = String(stream?.url || "").trim();
  const item = src ? toItem(src, "RgShows") : null;
  if (!item) return null;
  const captions = Array.isArray(stream?.captions) ? stream.captions : [];
  const subs = captions
    .map((c: any) => {
      const u = String(c?.url || c?.file || "").trim();
      if (!/^https?:\/\//i.test(u)) return null;
      return {
        url: u,
        label: String(c?.language || c?.label || "Subtitle"),
        language: String(c?.language || "en"),
        type: u.toLowerCase().includes(".vtt") ? ("vtt" as const) : ("srt" as const),
      };
    })
    .filter(Boolean) as DownloadsResult["subtitles"];
  return { downloads: [item], subs };
}

async function providerVidsrcVip(i: Input): Promise<ProviderHit | null> {
  const url =
    i.type === "show"
      ? `https://vidsrc.vip/api/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
      : `https://vidsrc.vip/api/movie/${i.tmdbId}`;
  const data = await safeJson(url, "https://vidsrc.vip/");
  if (!data) return null;
  const src = String(data?.url || data?.source || data?.data?.url || "").trim();
  const item = src ? toItem(src, "VidSrc") : null;
  return item ? { downloads: [item], subs: [] } : null;
}

async function providerAutoEmbed(i: Input): Promise<ProviderHit | null> {
  const url =
    i.type === "show"
      ? `https://tom.autoembed.cc/api/getVideoSource?type=tv&id=${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
      : `https://tom.autoembed.cc/api/getVideoSource?type=movie&id=${i.tmdbId}`;
  const data = await safeJson(url, "https://autoembed.cc/");
  if (!data) return null;
  const src = String(data?.videoSource || data?.url || "").trim();
  const item = src ? toItem(src, "AutoEmbed") : null;
  if (!item) return null;
  const subsRaw = Array.isArray(data?.subtitles) ? data.subtitles : [];
  const subs = subsRaw
    .map((s: any) => {
      const u = String(s?.file || s?.url || "").trim();
      if (!/^https?:\/\//i.test(u)) return null;
      return {
        url: u,
        label: String(s?.label || s?.lang || "Subtitle"),
        language: String(s?.lang || s?.language || "en"),
        type: u.toLowerCase().includes(".vtt") ? ("vtt" as const) : ("srt" as const),
      };
    })
    .filter(Boolean) as DownloadsResult["subtitles"];
  return { downloads: [item], subs };
}

async function providerVidApi(i: Input): Promise<ProviderHit | null> {
  const url =
    i.type === "show"
      ? `https://vidapi.xyz/embed/tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
      : `https://vidapi.xyz/embed/movie/${i.tmdbId}`;
  const data = await safeJson(url, "https://vidapi.xyz/");
  if (!data) return null;
  const src = String(data?.url || data?.source || "").trim();
  const item = src ? toItem(src, "VidApi") : null;
  return item ? { downloads: [item], subs: [] } : null;
}

const PROVIDERS = [providerRgshows, providerVidsrcVip, providerAutoEmbed, providerVidApi];

export const resolveDownloaderSources = createServerFn({ method: "POST" })
  .inputValidator((data) => DownloadsSchema.parse(data))
  .handler(async ({ data }): Promise<DownloadsResult> => {
    const results = await Promise.all(
      PROVIDERS.map((p) => p(data).catch(() => null)),
    );
    const downloads: DownloadItem[] = [];
    let subs: DownloadsResult["subtitles"] = [];
    const seen = new Set<string>();
    for (const hit of results) {
      if (!hit) continue;
      for (const d of hit.downloads) {
        if (seen.has(d.url)) continue;
        seen.add(d.url);
        downloads.push(d);
      }
      if (!subs.length && hit.subs.length) subs = hit.subs;
    }
    return {
      ok: downloads.length > 0,
      downloads,
      subtitles: subs,
      error: downloads.length ? undefined : "No downloads found for this title.",
    };
  });

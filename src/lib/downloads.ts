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
const PROVIDERS = [
  {
    name: "AutoEmbed",
    build: (i: z.infer<typeof DownloadsSchema>) =>
      i.type === "show"
        ? `https://tom.autoembed.cc/api/getVideoSource?type=tv&id=${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
        : `https://tom.autoembed.cc/api/getVideoSource?type=movie&id=${i.tmdbId}`,
  },
];

async function tryProvider(
  url: string,
  name: string,
): Promise<{ downloads: DownloadItem[]; subs: DownloadsResult["subtitles"] } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        referer: "https://autoembed.cc/",
        origin: "https://autoembed.cc",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const src = String(data?.videoSource || data?.url || "").trim();
    if (!/^https?:\/\//i.test(src)) return null;
    const downloads: DownloadItem[] = [
      {
        id: `${name}-${src}`,
        url: src,
        source: name,
        quality: /1080/.test(src) ? "1080p" : /720/.test(src) ? "720p" : "Auto",
        type: inferType(src),
      },
    ];
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
    return { downloads, subs };
  } catch {
    return null;
  }
}

export const resolveDownloaderSources = createServerFn({ method: "POST" })
  .inputValidator((data) => DownloadsSchema.parse(data))
  .handler(async ({ data }): Promise<DownloadsResult> => {
    const all: DownloadItem[] = [];
    let subs: DownloadsResult["subtitles"] = [];
    for (const p of PROVIDERS) {
      const result = await tryProvider(p.build(data), p.name);
      if (result) {
        all.push(...result.downloads);
        if (!subs.length) subs = result.subs;
      }
    }
    return {
      ok: all.length > 0,
      downloads: all,
      subtitles: subs,
      error: all.length ? undefined : "No downloads found for this title.",
    };
  });

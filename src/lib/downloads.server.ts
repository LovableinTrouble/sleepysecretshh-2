/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DownloadItem, DownloadsResult } from "./downloads";

type Input = {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
};

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function inferType(url: string): DownloadItem["type"] {
  const lower = url.toLowerCase();
  if (lower.startsWith("magnet:")) return "magnet";
  if (lower.includes(".torrent") || lower.includes("/torrent/")) return "torrent";
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes(".mkv")) return "mkv";
  if (lower.includes(".mp4")) return "mp4";
  return "file";
}

function qualityGuess(text: string): string {
  if (/2160|4k/i.test(text)) return "4K";
  if (/1080/i.test(text)) return "1080p";
  if (/720/i.test(text)) return "720p";
  if (/480/i.test(text)) return "480p";
  if (/3d/i.test(text)) return "3D";
  return "Auto";
}

function toItem(
  url: string,
  source: string,
  label: string,
  quality?: string,
  size?: string,
): DownloadItem | null {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u) && !/^magnet:/i.test(u)) return null;
  const type = inferType(u);
  const baseName = safeFilename(label || source || "download");
  return {
    id: `${source}-${u}`,
    url: u,
    source,
    quality: quality || qualityGuess(`${label} ${u}`),
    type,
    size: size || undefined,
    fileName: type === "torrent" ? `${baseName}.torrent` : undefined,
  };
}

async function providerVyla(input: Input): Promise<{ downloads: DownloadItem[]; subs: DownloadsResult["subtitles"] } | null> {
  const key = process.env.VYLA_API_KEY?.trim();
  if (!key) return null;

  const path =
    input.type === "show"
      ? `/api/downloads/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `/api/downloads/movie/${input.tmdbId}`;
  try {
    const res = await fetch(`https://api.vyla.cc${path}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json", "user-agent": UA },
      signal: AbortSignal.timeout(14000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = Array.isArray(data?.downloads) ? data.downloads : [];
    const downloads = raw
      .map((d: any) =>
        toItem(
          String(d?.url || ""),
          "Vyla",
          `${input.title} ${d?.quality || ""}`,
          String(d?.quality || "Auto"),
          d?.size ? String(d.size) : undefined,
        ),
      )
      .filter(Boolean) as DownloadItem[];
    return downloads.length ? { downloads, subs: [] } : null;
  } catch {
    return null;
  }
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  const hit = await providerVyla(input).catch(() => null);
  const downloads = hit?.downloads ?? [];

  return {
    ok: downloads.length > 0,
    downloads,
    subtitles: [],
    error: downloads.length ? undefined : "No downloads found for this title.",
  };
}

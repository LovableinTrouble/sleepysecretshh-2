import type { DownloadItem, DownloadsResult } from "./downloads";

interface Input {
  tmdbId: string;
  title: string;
  year?: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}

interface SheguLink {
  source?: string;
  name?: string;
  quality?: number | string;
  url?: string;
  size?: string;
  filename?: string;
  provider?: string;
}

const BASE = "https://downloads.shegu.xyz";

function inferType(url: string): DownloadItem["type"] {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".m3u8")) return "hls";
  if (clean.endsWith(".mkv")) return "mkv";
  if (clean.endsWith(".mp4")) return "mp4";
  return "file";
}

function qualityLabel(q: SheguLink["quality"], name?: string): string {
  const n = typeof q === "string" ? parseInt(q, 10) : q;
  if (n && Number.isFinite(n)) {
    if (n >= 2160) return "4K";
    return `${n}p`;
  }
  const m = name?.match(/(2160|1440|1080|720|480|360)p?/i);
  if (m) return m[1] === "2160" ? "4K" : `${m[1]}p`;
  return "SD";
}

function fileNameFor(link: SheguLink, input: Input): string {
  if (link.filename) return link.filename;
  try {
    const u = new URL(link.url!);
    const disp = u.searchParams.get("response-content-disposition");
    const m = disp?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (m?.[1]) return decodeURIComponent(m[1]);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    if (/\.[a-z0-9]{2,4}$/i.test(last)) return last;
  } catch {
    /* ignore */
  }
  const ep =
    input.type === "show" ? ` S${String(input.season ?? 1).padStart(2, "0")}E${String(input.episode ?? 1).padStart(2, "0")}` : "";
  return `${input.title}${ep}.mkv`;
}

export async function resolveDownloadProviders(input: Input): Promise<DownloadsResult> {
  const path =
    input.type === "show"
      ? `${BASE}/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`
      : `${BASE}/movie/${input.tmdbId}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch(path, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, downloads: [], subtitles: [], error: `Download service responded ${res.status}` };
    }
    const json = (await res.json()) as { links?: SheguLink[] };
    const raw = Array.isArray(json.links) ? json.links : [];

    const seen = new Set<string>();
    const downloads: DownloadItem[] = [];
    for (const link of raw) {
      if (!link.url || !/^https?:\/\//i.test(link.url)) continue;
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      downloads.push({
        id: `shegu-${downloads.length}`,
        url: link.url,
        source: link.source || link.provider || "Shegu",
        quality: qualityLabel(link.quality, link.name),
        type: inferType(link.url),
        size: link.size,
        fileName: fileNameFor(link, input),
      });
    }

    const rank = (q: string) => (q === "4K" ? 2160 : parseInt(q, 10) || 0);
    downloads.sort((a, b) => rank(b.quality) - rank(a.quality));

    if (!downloads.length) {
      return { ok: false, downloads: [], subtitles: [], error: "No direct downloads found for this title." };
    }
    return { ok: true, downloads, subtitles: [] };
  } catch (e) {
    return {
      ok: false,
      downloads: [],
      subtitles: [],
      error: (e as Error)?.name === "AbortError" ? "Download search timed out." : "Download search failed.",
    };
  }
}

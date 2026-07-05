import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BASE_URL = "https://02moviedownloader.site";

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

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; U; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36",
  accept: "*/*",
  "accept-language": "en-US,en;q=0.1",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "sec-gpc": "1",
};

function buildPageUrl(input: z.infer<typeof DownloadsSchema>) {
  if (input.type === "show") {
    return `${BASE_URL}/api/download/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`;
  }
  return `${BASE_URL}/api/download/movie/${input.tmdbId}`;
}

function inferType(url: string): DownloadItem["type"] {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes(".mkv")) return "mkv";
  if (lower.includes(".mp4")) return "mp4";
  return "file";
}

async function getToken(pageUrl: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/verify-robot`, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; U; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36",
      accept: "*/*",
      "accept-language": "en-US,en;q=0.7",
      "cache-control": "no-cache",
      pragma: "no-cache",
      dnt: "1",
      origin: BASE_URL,
      referer: pageUrl,
      priority: "u=1, i",
      "sec-ch-ua": '"(Not(A:Brand";v="99", "Google Chrome";v="134", "Chromium";v="134"',
      "sec-ch-ua-full-version-list": '"(Not(A:Brand";v="99.0.0.0", "Google Chrome";v="134", "Chromium";v="134"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "sec-gpc": "1",
    },
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { token?: string };
  return json.token || null;
}

async function fetchPayload(pageUrl: string, token: string): Promise<any> {
  const res = await fetch(pageUrl, {
    headers: {
      ...HEADERS,
      accept: "application/json",
      "x-session-token": token,
      origin: BASE_URL,
      referer: pageUrl,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function mapPayload(payload: any) {
  const downloads: DownloadItem[] = [];
  const directDownloads = payload?.data?.downloadData?.data?.downloads ?? [];
  for (const item of directDownloads) {
    const url = String(item?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    downloads.push({
      id: String(item?.id || url),
      url,
      source: "02MovieDownloader",
      quality: Number(item?.resolution) > 0 ? `${item.resolution}p` : "Original",
      type: inferType(url),
      size: item?.size ? String(item.size) : undefined,
      headers: url.includes("hakunaymatata")
        ? { ...HEADERS, Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc/" }
        : url.includes("pixeldra")
          ? undefined
          : { ...HEADERS },
    });
  }

  const externalStreams = payload?.externalStreams ?? [];
  for (const stream of externalStreams) {
    const url = String(stream?.url || "").trim();
    if (!/^https?:\/\//i.test(url) || url.includes("111477.xyz")) continue;
    // Match NexVid's per-source header handling: hakunaymatata needs its own
    // Referer/Origin, pixeldrain needs none, everything else gets the
    // standard downloader headers.
    let headers: Record<string, string> | undefined;
    if (url.includes("hakunaymatata")) {
      headers = { ...HEADERS, Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc/" };
    } else if (!url.includes("pixeldra")) {
      headers = { ...HEADERS };
    }
    downloads.push({
      id: `${stream?.name || "external"}-${url}`,
      url,
      source: String(stream?.name || stream?.title || "External"),
      quality: String(stream?.quality || "Original"),
      type: inferType(url),
      size: stream?.size ? String(stream.size) : undefined,
      fileName: stream?.filename ? String(stream.filename) : undefined,
      headers,
    });
  }

  const seen = new Set<string>();
  const unique = downloads.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const captions = payload?.data?.downloadData?.data?.captions ?? [];
  const subtitles = captions
    .map((caption: any) => {
      const url = String(caption?.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return null;
      return {
        url,
        label: String(caption?.lanName || caption?.lan || "Subtitle"),
        language: String(caption?.lan || "en"),
        type: url.toLowerCase().includes(".vtt") ? "vtt" : "srt",
      };
    })
    .filter(Boolean) as DownloadsResult["subtitles"];

  return {
    downloads: unique.sort((a, b) => (Number.parseInt(b.quality) || 0) - (Number.parseInt(a.quality) || 0)),
    subtitles,
  };
}

export const resolveDownloaderSources = createServerFn({ method: "POST" })
  .inputValidator((data) => DownloadsSchema.parse(data))
  .handler(async ({ data }): Promise<DownloadsResult> => {
    const pageUrl = buildPageUrl(data);
    try {
      const token = await getToken(pageUrl);
      if (!token) return { ok: false, downloads: [], subtitles: [], error: "Downloader verification failed." };
      const payload = await fetchPayload(pageUrl, token);
      const { downloads, subtitles } = mapPayload(payload);
      return {
        ok: downloads.length > 0,
        downloads,
        subtitles,
        error: downloads.length ? undefined : "No downloads found for this title.",
      };
    } catch (err: any) {
      return { ok: false, downloads: [], subtitles: [], error: err?.message || "Failed to load downloads." };
    }
  });

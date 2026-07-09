/* eslint-disable @typescript-eslint/no-explicit-any */
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

function extractCookie(res: Response): string | null {
  // Node/undici exposes multiple Set-Cookie headers via getSetCookie(); fall
  // back to the single-header form for other runtimes.
  const raw =
    typeof (res.headers as any).getSetCookie === "function"
      ? ((res.headers as any).getSetCookie() as string[])
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  if (!raw.length) return null;
  return raw.map((c) => c.split(";")[0]).join("; ");
}

function buildScope(input: z.infer<typeof DownloadsSchema>): string {
  if (input.type === "show") return `tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`;
  return `movie/${input.tmdbId}`;
}

async function getToken(
  pageUrl: string,
  scope: string,
): Promise<{ token: string | null; cookie: string | null; detail: string }> {
  const verifyHeaders: Record<string, string> = {
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
    "sec-ch-ua-full-version-list":
      '"(Not(A:Brand";v="99.0.0.0", "Google Chrome";v="134", "Chromium";v="134"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "sec-gpc": "1",
  };

  // Load the page first, like a real browser would before its JS calls
  // verify-robot — this picks up any session/anti-bot cookie the site sets
  // on first hit, which a bare POST to verify-robot never gets a chance to.
  let cookie: string | null = null;
  try {
    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": verifyHeaders["User-Agent"], accept: "*/*" },
      signal: AbortSignal.timeout(10000),
    });
    cookie = extractCookie(pageRes);
  } catch {
    // Non-fatal — proceed without a cookie if the pre-flight fails.
  }
  if (cookie) verifyHeaders.cookie = cookie;

  // The upstream verify-robot endpoint now requires the caller to state which
  // movie/show it's issuing a token for ("a valid media scope is required").
  // The previous implementation sent no body at all, which is exactly the
  // "Invalid scope" 400 users were hitting. The exact field name isn't
  // documented, so try the handful of shapes a JSON API like this is likely
  // to accept, stopping at the first one that yields a token.
  const bodyCandidates: (Record<string, any> | null)[] = [
    { scope },
    { mediaScope: scope },
    { path: `/api/download/${scope}` },
    { url: pageUrl },
    null,
  ];

  const attemptOnce = async (
    body: Record<string, any> | null,
  ): Promise<{ token: string | null; cookie: string | null; detail: string }> => {
    const res = await fetch(`${BASE_URL}/api/verify-robot`, {
      method: "POST",
      headers: body ? { ...verifyHeaders, "content-type": "application/json" } : verifyHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const verifyCookie = extractCookie(res) || cookie;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        token: null,
        cookie: verifyCookie,
        detail: `verify-robot HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const text = await res.text();
    let json: { token?: string; success?: boolean } = {};
    try {
      json = JSON.parse(text);
    } catch {
      return {
        token: null,
        cookie: verifyCookie,
        detail: `verify-robot returned non-JSON (likely a bot-check page): ${text.slice(0, 200)}`,
      };
    }
    if (!json.token)
      return { token: null, cookie: verifyCookie, detail: "verify-robot response had no token" };
    return { token: json.token, cookie: verifyCookie, detail: "ok" };
  };

  const details: string[] = [];
  for (const body of bodyCandidates) {
    const attempt = await attemptOnce(body);
    if (attempt.token) return attempt;
    details.push(attempt.detail);
    if (attempt.cookie && attempt.cookie !== cookie) {
      // Retry once with whatever cookie verify-robot itself just handed back —
      // some anti-bot flows require the *second* request to carry a cookie
      // that was only issued by the first.
      verifyHeaders.cookie = attempt.cookie;
      const retry = await attemptOnce(body);
      if (retry.token) return retry;
      details.push(`retry: ${retry.detail}`);
      cookie = attempt.cookie;
    }
  }
  return { token: null, cookie, detail: details.join(" | ") };
}

async function fetchPayload(pageUrl: string, token: string, cookie: string | null): Promise<any> {
  const res = await fetch(pageUrl, {
    headers: {
      ...HEADERS,
      accept: "application/json",
      "x-session-token": token,
      origin: BASE_URL,
      referer: pageUrl,
      ...(cookie ? { cookie } : {}),
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
    downloads: unique.sort(
      (a, b) => (Number.parseInt(b.quality) || 0) - (Number.parseInt(a.quality) || 0),
    ),
    subtitles,
  };
}

export const resolveDownloaderSources = createServerFn({ method: "POST" })
  .inputValidator((data) => DownloadsSchema.parse(data))
  .handler(async ({ data }): Promise<DownloadsResult> => {
    const pageUrl = buildPageUrl(data);
    const scope = buildScope(data);
    try {
      const { token, cookie, detail } = await getToken(pageUrl, scope);
      if (!token) {
        return {
          ok: false,
          downloads: [],
          subtitles: [],
          error: `Downloader verification failed: ${detail}`,
        };
      }
      const payload = await fetchPayload(pageUrl, token, cookie);
      const { downloads, subtitles } = mapPayload(payload);
      return {
        ok: downloads.length > 0,
        downloads,
        subtitles,
        error: downloads.length ? undefined : "No downloads found for this title.",
      };
    } catch (err: any) {
      return {
        ok: false,
        downloads: [],
        subtitles: [],
        error: err?.message || "Failed to load downloads.",
      };
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DOWNLOADER_ORIGINS = ["https://02moviedownloader.site", "https://02moviedownloader.top"] as const;
const DEFAULT_DOWNLOADER_ORIGIN = DOWNLOADER_ORIGINS[0];

export interface DownloadItem {
  id: string;
  url: string;
  source: string;
  quality: string;
  type: "mp4" | "hls" | "mkv" | "file";
  size?: string;
  fileName?: string;
}

export interface DownloadsResult {
  ok: boolean;
  pageUrl: string;
  downloads: DownloadItem[];
  subtitles: { url: string; label: string; language: string; type: "srt" | "vtt" }[];
  error?: string;
  requiresExternalVerification?: boolean;
  verification?: DownloaderVerification;
}

// Mirrors the downloader verification challenge returned by its HTML gate.
export interface DownloaderVerification {
  siteKey: string;
  scope: string;
  pageNonce: string;
  powChallenge: string;
  powDifficulty: number;
  origin?: string;
  pageUrl?: string;
}

const DownloadsSchema = z.object({
  tmdbId: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  type: z.enum(["movie", "show"]),
  season: z.number().optional(),
  episode: z.number().optional(),
  turnstileToken: z.string().optional(),
  verification: z
    .object({
      siteKey: z.string(),
      scope: z.string(),
      pageNonce: z.string(),
      powChallenge: z.string(),
      powDifficulty: z.number(),
      origin: z.string().optional(),
      pageUrl: z.string().optional(),
    })
    .optional(),
});

const BASE_HEADERS = {
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

function buildPageUrl(input: z.infer<typeof DownloadsSchema>, origin: string = DEFAULT_DOWNLOADER_ORIGIN) {
  if (input.type === "show") {
    return `${origin}/api/download/tv/${input.tmdbId}/${input.season ?? 1}/${input.episode ?? 1}`;
  }
  return `${origin}/api/download/movie/${input.tmdbId}`;
}

function inferType(url: string): DownloadItem["type"] {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes(".mkv")) return "mkv";
  if (lower.includes(".mp4")) return "mp4";
  return "file";
}

interface TokenResponse {
  success?: boolean;
  token?: string;
  expiresIn?: number;
  error?: string;
  message?: string;
}

interface TokenAttempt {
  token?: string;
  verification?: DownloaderVerification;
  message?: string;
}

function originFromVerification(origin?: string) {
  if (!origin) return DEFAULT_DOWNLOADER_ORIGIN;
  try {
    const normalized = new URL(origin).origin;
    return DOWNLOADER_ORIGINS.includes(normalized as (typeof DOWNLOADER_ORIGINS)[number])
      ? normalized
      : DEFAULT_DOWNLOADER_ORIGIN;
  } catch {
    return DEFAULT_DOWNLOADER_ORIGIN;
  }
}

function parseVerificationConfig(html: string, origin: string, pageUrl: string): DownloaderVerification | undefined {
  const match = html.match(/const\s+VERIFY_CONFIG\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return undefined;
  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    const scope = String(raw.scope || "");
    const pageNonce = String(raw.pageNonce || "");
    const powChallenge = String(raw.powChallenge || "");
    if (!scope || !pageNonce || !powChallenge) return undefined;
    return {
      siteKey: String(raw.turnstileSiteKey || raw.siteKey || ""),
      scope,
      pageNonce,
      powChallenge,
      powDifficulty: Number(raw.powDifficulty || 0),
      origin,
      pageUrl,
    };
  } catch {
    return undefined;
  }
}

async function fetchVerificationConfig(origin: string, pageUrl: string) {
  const response = await fetch(pageUrl, {
    headers: {
      ...BASE_HEADERS,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin,
      referer: pageUrl,
    },
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();
  return parseVerificationConfig(html, origin, pageUrl);
}

async function solveProofOfWork(challenge: string, difficulty: number) {
  const prefix = "0".repeat(Math.max(0, difficulty));
  const encoder = new TextEncoder();
  for (let nonce = 0; nonce < 5_000_000; nonce += 1) {
    const hashBuffer = await globalThis.crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`${challenge}${nonce}`),
    );
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (hashHex.startsWith(prefix)) return String(nonce);
  }
  throw new Error("Downloader proof-of-work timed out.");
}

async function requestSessionToken(
  origin: string,
  pageUrl: string,
  verification?: DownloaderVerification,
  turnstileToken?: string,
): Promise<TokenAttempt> {
  const challenge = verification ?? (await fetchVerificationConfig(origin, pageUrl));
  if (challenge) {
    if (challenge.siteKey && !turnstileToken) return { verification: challenge };
    const payload: Record<string, string> = {
      scope: challenge.scope,
      pageNonce: challenge.pageNonce,
      powChallenge: challenge.powChallenge,
    };
    if (turnstileToken) {
      payload.turnstileToken = turnstileToken;
    } else if (challenge.powDifficulty > 0) {
      payload.powNonce = await solveProofOfWork(challenge.powChallenge, challenge.powDifficulty);
    }
    const response = await fetch(`${origin}/api/verify-robot`, {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        accept: "application/json",
        "content-type": "application/json",
        origin,
        referer: pageUrl,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await response.json().catch(() => ({}))) as TokenResponse;
    if (json.token) return { token: json.token };
    const freshChallenge = await fetchVerificationConfig(origin, pageUrl).catch(() => undefined);
    return {
      verification: freshChallenge ?? challenge,
      message: json.message || json.error || `Downloader verification failed (${response.status}).`,
    };
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (X11; U; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36",
    accept: "*/*",
    "accept-language": "en-US,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    dnt: "1",
    origin,
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

  const res = await fetch(`${origin}/api/verify-robot`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (json.token) return { token: json.token };
  return { message: json.message || json.error || "Downloader verification did not return a token." };
}

function base64ToBytes(input: string) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function decryptPayload(cipherBundle: string, token: string) {
  const parts = cipherBundle.split(":");
  if (parts.length !== 2) throw new Error("Invalid encrypted downloader payload.");
  const tokenBytes = new TextEncoder().encode(token);
  const keyHash = await globalThis.crypto.subtle.digest("SHA-256", tokenBytes);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyHash,
    { name: "AES-CBC", length: 256 },
    false,
    ["decrypt"],
  );
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-CBC", iv: base64ToBytes(parts[0]) },
    cryptoKey,
    base64ToBytes(parts[1]),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function fetchDownloaderPayload(origin: string, pageUrl: string, token: string) {
  const response = await fetch(pageUrl, {
    headers: {
      ...BASE_HEADERS,
      accept: "application/json",
      "x-session-token": token,
      origin,
      referer: pageUrl,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Downloader HTTP ${response.status}`);
  const raw = (await response.json()) as any;
  if (raw?.encrypted === true && typeof raw.data === "string") {
    return decryptPayload(raw.data, token);
  }
  return raw;
}

function mapDownloaderPayload(payload: any) {
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
    });
  }

  const externalStreams = payload?.externalStreams ?? [];
  for (const stream of externalStreams) {
    const url = String(stream?.url || "").trim();
    if (!/^https?:\/\//i.test(url) || url.includes("111477.xyz")) continue;
    downloads.push({
      id: `${stream?.name || "external"}-${url}`,
      url,
      source: String(stream?.name || stream?.title || "External"),
      quality: String(stream?.quality || "Original"),
      type: inferType(url),
      size: stream?.size ? String(stream.size) : undefined,
      fileName: stream?.filename ? String(stream.filename) : undefined,
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
    downloads: unique.sort((a, b) => Number.parseInt(b.quality) - Number.parseInt(a.quality)),
    subtitles,
  };
}

export const resolveDownloaderSources = createServerFn({ method: "POST" })
  .inputValidator((data) => DownloadsSchema.parse(data))
  .handler(async ({ data }): Promise<DownloadsResult> => {
    const preferredOrigin = originFromVerification(data.verification?.origin);
    const origins = [preferredOrigin, ...DOWNLOADER_ORIGINS.filter((origin) => origin !== preferredOrigin)];
    let lastError = "Failed to load downloads.";
    let lastPageUrl = buildPageUrl(data, preferredOrigin);
    let lastVerification: DownloaderVerification | undefined;

    for (const origin of origins) {
      const pageUrl = data.verification?.origin === origin && data.verification.pageUrl
        ? data.verification.pageUrl
        : buildPageUrl(data, origin);
      lastPageUrl = pageUrl;
      const verification = data.verification?.origin === origin ? data.verification : undefined;
      try {
        const tokenAttempt = await requestSessionToken(origin, pageUrl, verification, data.turnstileToken);
        if (!tokenAttempt.token) {
          lastVerification = tokenAttempt.verification;
          lastError = tokenAttempt.message || "Complete verification to unlock direct downloads.";
          if (tokenAttempt.verification) break;
          continue;
        }
        const payload = await fetchDownloaderPayload(origin, pageUrl, tokenAttempt.token);
        const { downloads, subtitles } = mapDownloaderPayload(payload);
        return {
          ok: downloads.length > 0,
          pageUrl,
          downloads,
          subtitles,
          error: downloads.length ? undefined : "No downloads found for this title.",
        };
      } catch (err: any) {
        lastError = err?.message || "Failed to load downloads.";
      }
    }

    return {
      ok: false,
      pageUrl: lastPageUrl,
      downloads: [],
      subtitles: [],
      error: lastVerification ? undefined : lastError,
      requiresExternalVerification: Boolean(lastVerification),
      verification: lastVerification,
    };
  });

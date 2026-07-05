import { createFileRoute } from "@tanstack/react-router";
import { getFebboxProxyTarget } from "@/lib/showbox.server";

/**
 * FebBox stream proxy. Stream URLs from FebBox often require
 * specific cookies (PHPSESSID / ui) and Referer headers, and frequently block
 * cross-origin playback. We register the upstream URL + headers server-side
 * under an opaque token and stream the response back to the player from our
 * own origin so <video>/HLS can play it.
 *
 * Some resolvers hand back a "file" URL that is itself a third-party
 * relay/proxy (e.g. a foreign m3u8-proxy) wrapping the real CDN URL in its
 * own ?url=&headers= query string. Rather than depending on that relay
 * staying up and accepting our requests, we unwrap it and fetch the real
 * final URL directly with whatever headers were embedded in the wrapper.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
} as const;

const PASS_REQUEST_HEADERS = ["range", "accept", "accept-encoding"] as const;
const PASS_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
] as const;

const ALLOWED_HEADER_KEYS = new Set([
  "referer",
  "origin",
  "user-agent",
  "authorization",
  "cookie",
  "accept",
  "accept-language",
  "range",
  "connection",
]);

function encodeProxyUrl(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeProxyUrl(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

// ---- SSRF protection: block private/internal targets, allow any public host ----
// (The underlying CDN host for a given resolver can be different and
// unpredictable per title, so a domain allowlist would constantly need
// updating — a private-IP/localhost/cloud-metadata blocklist is the right
// boundary here.)

function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((value, index) => !/^\d+$/.test(parts[index]) || Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // Carrier-grade NAT
  return false;
}

function expandIPv6(hostname: string): number[] | null {
  const normalized = hostname.toLowerCase();
  if (!normalized.includes(":")) return null;
  if (normalized.includes(".") && normalized.includes(":")) {
    const lastColon = normalized.lastIndexOf(":");
    const head = normalized.slice(0, lastColon);
    const tail = normalized.slice(lastColon + 1);
    const ipv4 = parseIPv4(tail);
    if (!ipv4) return null;
    const mapped = `${head}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
    return expandIPv6(mapped);
  }

  const parts = normalized.split("::");
  if (parts.length > 2) return null;

  const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const right = parts[1] ? parts[1].split(":").filter(Boolean) : [];
  if (left.length + right.length > 8) return null;
  if (parts.length === 1 && left.length !== 8) return null;

  const fillCount = 8 - (left.length + right.length);
  const full = [...left, ...Array(fillCount).fill("0"), ...right];
  if (full.length !== 8) return null;

  const hextets = full.map((part) => Number.parseInt(part, 16));
  if (
    hextets.some(
      (value, index) => !/^[0-9a-f]{1,4}$/i.test(full[index]) || Number.isNaN(value) || value < 0 || value > 0xffff,
    )
  ) {
    return null;
  }
  return hextets;
}

function isPrivateIPv6(hextets: number[]): boolean {
  const [a, b, c, d, e, f, g, h] = hextets;
  const isUnspecified = hextets.every((value) => value === 0);
  const isLoopback = a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1;
  const isUniqueLocal = (a & 0xfe00) === 0xfc00; // fc00::/7
  const isLinkLocal = (a & 0xffc0) === 0xfe80; // fe80::/10
  if (isUnspecified || isLoopback || isUniqueLocal || isLinkLocal) return true;

  // IPv4-mapped IPv6 address ::ffff:x.x.x.x
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) {
    const ipv4 = [g >> 8, g & 0xff, h >> 8, h & 0xff];
    return isPrivateIPv4(ipv4);
  }

  return false;
}

function isBlockedTargetHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".internal")) return true;

  const ipv4 = parseIPv4(host);
  if (ipv4) {
    if (isPrivateIPv4(ipv4)) return true;
    if (host === "169.254.169.254") return true; // cloud metadata endpoint
    return false;
  }

  const ipv6 = expandIPv6(host);
  if (ipv6) {
    return isPrivateIPv6(ipv6);
  }

  return false;
}

// ---- Nested proxy/relay unwrapping ----

function parseHeadersJson(raw: string | null): Record<string, string> {
  if (!raw) return {};
  const parsed = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (!ALLOWED_HEADER_KEYS.has(normalized)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    result[normalized] = trimmed;
  }
  return result;
}

/**
 * Some resolvers hand back a URL that is itself a third-party relay wrapping
 * the real target in its own ?url=&headers=(&host=) query string (e.g.
 * hlsproxy3.asiaflix.net/m3u8-proxy?url=<real-cdn>&headers=<json>). Rather
 * than depending on that relay, unwrap up to 3 levels deep and fetch the real
 * final URL directly with whatever headers were embedded in the wrapper.
 */
function cleanTargetUrl(rawTarget: string): {
  targetUrl: string;
  nestedHeaders: Record<string, string>;
} {
  let target = String(rawTarget || "").trim();
  let nestedHeaders: Record<string, string> = {};

  for (let i = 0; i < 3; i += 1) {
    if (!/^https?:\/\//i.test(target)) break;
    try {
      const parsed = new URL(target);

      for (const raw of parsed.searchParams.getAll("headers")) {
        nestedHeaders = { ...nestedHeaders, ...parseHeadersJson(raw) };
      }

      const hintedHost = String(parsed.searchParams.get("host") || "").trim();
      if (hintedHost) {
        try {
          const hostUrl = new URL(hintedHost);
          if (!nestedHeaders.origin) nestedHeaders.origin = hostUrl.origin;
          if (!nestedHeaders.referer) nestedHeaders.referer = `${hostUrl.origin}/`;
        } catch {
          // ignore malformed hint
        }
      }

      const nestedUrl = String(parsed.searchParams.get("url") || "").trim();
      if (/^https?:\/\//i.test(nestedUrl)) {
        target = nestedUrl;
        continue;
      }

      parsed.searchParams.delete("headers");
      parsed.searchParams.delete("host");
      parsed.searchParams.delete("url");

      target = parsed.toString();
      break;
    } catch {
      break;
    }
  }

  return { targetUrl: target, nestedHeaders };
}

// ---- Upstream fetch with bounded timeout + retry ----
// Segments/keys should come back fast; if an edge is slow or half-open we'd
// rather fail this attempt quickly and retry than hang until the client's own
// hls.js fragLoadingTimeOut (20s) gives up on us.
const UPSTREAM_TIMEOUT_MS = 8000;
const UPSTREAM_MAX_ATTEMPTS = 3;
const UPSTREAM_RETRY_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUpstreamWithRetry(
  url: string,
  init: { method: "GET" | "HEAD"; headers: Record<string, string> },
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        redirect: "follow",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = err;
      if (attempt < UPSTREAM_MAX_ATTEMPTS) await sleep(UPSTREAM_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastErr;
}

function sameHost(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

function rewriteHlsPlaylist(body: string, base: URL, token: string): string {
  const rewrite = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    let abs: string;
    try {
      abs = new URL(trimmed, base).toString();
    } catch {
      return raw;
    }
    return `/api/public/febbox-proxy?t=${encodeURIComponent(token)}&u=${encodeURIComponent(encodeProxyUrl(abs))}`;
  };

  return body
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) {
        // Rewrite URI="..." attributes inside tags (EXT-X-KEY, EXT-X-MEDIA, MAP)
        return line.replace(/URI="([^"]+)"/g, (_m, url) => `URI="${rewrite(url)}"`);
      }
      return rewrite(t);
    })
    .join("\n");
}

async function handle(request: Request, method: "GET" | "HEAD") {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return new Response("missing token", { status: 400, headers: CORS_HEADERS });
  }

  const target = getFebboxProxyTarget(token);
  if (!target) {
    return new Response("expired or unknown token", {
      status: 404,
      headers: CORS_HEADERS,
    });
  }

  // Resolve which URL was requested (the originally registered one, or a
  // rewritten child segment/sub-playlist/key), then unwrap it if it's itself
  // a wrapped relay URL.
  let requestedUrl = target.url;
  const encodedChildUrl = url.searchParams.get("u");
  if (encodedChildUrl) {
    const decoded = decodeProxyUrl(encodedChildUrl);
    if (!decoded) return new Response("bad child url", { status: 400, headers: CORS_HEADERS });
    requestedUrl = decoded;
  }

  const { targetUrl: upstreamUrl, nestedHeaders } = cleanTargetUrl(requestedUrl);

  let finalHost: URL;
  try {
    finalHost = new URL(upstreamUrl);
  } catch {
    return new Response("bad target url", { status: 400, headers: CORS_HEADERS });
  }
  if (!/^https?:$/.test(finalHost.protocol) || isBlockedTargetHost(finalHost.hostname)) {
    return new Response("target host not allowed", { status: 403, headers: CORS_HEADERS });
  }

  // Only forward the stored cookie/referer when they actually belong to the
  // host we're about to hit — the "file" URL a resolver returns is frequently
  // on a completely different domain (or, after unwrapping, the real CDN)
  // than the site the referer was captured from, and forcing a mismatched
  // Referer onto an unrelated host is a common way to get rejected outright.
  let refererHost: string | null = null;
  try {
    refererHost = target.referer ? new URL(target.referer).hostname : null;
  } catch {
    refererHost = null;
  }
  const refererBelongsHere = !!refererHost && sameHost(finalHost.hostname, refererHost);

  const upstreamHeaders: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    accept: "*/*",
  };
  if (target.cookie && refererBelongsHere) upstreamHeaders.cookie = target.cookie;
  upstreamHeaders.referer = refererBelongsHere ? target.referer! : `${finalHost.origin}/`;

  // Headers embedded in a wrapper URL's own ?headers= param (e.g. the Origin
  // a relay says the real CDN expects) take precedence over our defaults.
  Object.assign(upstreamHeaders, nestedHeaders);

  for (const name of PASS_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders[name] = value;
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstreamWithRetry(upstreamUrl, { method, headers: upstreamHeaders });
    // A host rejecting a mismatched referer/cookie typically fails fast with a
    // 4xx/5xx rather than hanging — if that happens, retry once with no
    // referer/cookie at all before giving up.
    if (!upstream.ok && upstream.status >= 400 && (upstreamHeaders.referer || upstreamHeaders.cookie)) {
      const bareHeaders: Record<string, string> = { ...upstreamHeaders };
      delete bareHeaders.referer;
      delete bareHeaders.cookie;
      try {
        const retryResponse = await fetchUpstreamWithRetry(upstreamUrl, {
          method,
          headers: bareHeaders,
        });
        if (retryResponse.ok) upstream = retryResponse;
      } catch {
        // Keep the original response/error if the bare retry also fails.
      }
    }
  } catch (err) {
    return new Response(`upstream fetch failed: ${(err as Error).message}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  // Use the final, post-redirect URL as the base for resolving relative HLS
  // paths — upstreamUrl is the pre-redirect request URL and, when the CDN
  // redirects the manifest to a different path/host, resolving relative
  // segment/sub-playlist paths against it produces broken URLs.
  const resolvedBase = new URL(upstream.url || upstreamUrl);

  const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  const looksLikeHls =
    resolvedBase.pathname.toLowerCase().includes(".m3u8") ||
    contentType.includes("mpegurl") ||
    contentType.includes("application/x-mpegurl");

  if (method === "GET" && looksLikeHls && upstream.ok) {
    const text = await upstream.text();
    const rewritten = rewriteHlsPlaylist(text, resolvedBase, token);
    responseHeaders["content-type"] = "application/vnd.apple.mpegurl";
    delete responseHeaders["content-length"];
    return new Response(rewritten, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/public/febbox-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request, "GET"),
      HEAD: async ({ request }) => handle(request, "HEAD"),
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
    },
  },
});

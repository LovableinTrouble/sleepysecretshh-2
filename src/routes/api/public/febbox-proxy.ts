import { createFileRoute } from "@tanstack/react-router";
import { getFebboxProxyTarget } from "@/lib/showbox.server";

/**
 * FebBox stream proxy. Stream URLs from FebBox often require specific
 * cookies (PHPSESSID / ui) and Referer headers, and frequently block
 * cross-origin playback. We register the upstream URL + headers server-side
 * under an opaque token and stream the response back to the player from our
 * own origin so <video>/HLS can play it.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
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

function rewriteHlsPlaylist(body: string, upstreamUrl: string, token: string): string {
  const base = new URL(upstreamUrl);
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

  let upstreamUrl = target.url;
  const encodedChildUrl = url.searchParams.get("u");
  if (encodedChildUrl) {
    const decoded = decodeProxyUrl(encodedChildUrl);
    if (!decoded) return new Response("bad child url", { status: 400, headers: CORS_HEADERS });
    const child = new URL(decoded);
    const parent = new URL(target.url);
    if (!/^https?:$/.test(child.protocol) || child.hostname !== parent.hostname) {
      return new Response("child url not allowed", { status: 403, headers: CORS_HEADERS });
    }
    upstreamUrl = child.toString();
  }

  const upstreamHeaders: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    accept: "*/*",
  };
  if (target.cookie) upstreamHeaders.cookie = target.cookie;
  if (target.referer) upstreamHeaders.referer = target.referer;

  for (const name of PASS_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders[name] = value;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (err) {
    return new Response(`upstream fetch failed: ${(err as Error).message}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  const looksLikeHls =
    upstreamUrl.toLowerCase().includes(".m3u8") ||
    contentType.includes("mpegurl") ||
    contentType.includes("application/x-mpegurl");

  if (method === "GET" && looksLikeHls && upstream.ok) {
    const text = await upstream.text();
    const rewritten = rewriteHlsPlaylist(text, upstreamUrl, token);
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
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),
    },
  },
});
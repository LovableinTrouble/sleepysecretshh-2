import { createFileRoute } from "@tanstack/react-router";

/**
 * Generic IPTV / HLS proxy.
 *
 * Many free IPTV streams set Access-Control-Allow-Origin to their own
 * domain (e.g. Pluto.tv only allows pluto.tv), which causes hls.js to
 * stall forever on the browser. This route fetches the upstream playlist
 * or segment from the server, adds permissive CORS headers, and — for
 * .m3u8 playlists — rewrites every absolute/relative URI inside so that
 * every nested fetch (variant playlists, segments, keys, subtitles) also
 * flows through this proxy.
 *
 * Usage: /api/public/iptv-proxy?u=<base64url(upstream)>
 *        or  /api/public/iptv-proxy?url=<encoded upstream>
 */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

function encodeUrl(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeUrl(value: string): string | null {
  try {
    const padded =
      value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function proxify(absUrl: string): string {
  return `/api/public/iptv-proxy?u=${encodeUrl(absUrl)}`;
}

function rewritePlaylist(body: string, upstreamUrl: string): string {
  const base = new URL(upstreamUrl);
  const rewriteUri = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    try {
      const abs = new URL(trimmed, base).toString();
      return proxify(abs);
    } catch {
      return raw;
    }
  };

  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line) {
      out.push(line);
      continue;
    }
    if (line.startsWith("#")) {
      // Rewrite URI="..." attributes inside tags like EXT-X-KEY, EXT-X-MAP,
      // EXT-X-MEDIA, EXT-X-I-FRAME-STREAM-INF.
      out.push(line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${rewriteUri(u)}"`));
    } else {
      // Bare segment / variant playlist line.
      out.push(rewriteUri(line));
    }
  }
  return out.join("\n");
}

function unavailablePlaylist(): Response {
  return new Response(
    "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ENDLIST\n",
    {
      status: 200,
      headers: {
        ...CORS,
        "content-type": "application/vnd.apple.mpegurl",
        "cache-control": "no-store",
      },
    },
  );
}

export const Route = createFileRoute("/api/public/iptv-proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      HEAD: async ({ request }) => handle(request, "HEAD"),
      GET: async ({ request }) => handle(request, "GET"),
    },
  },
});

async function handle(request: Request, method: "GET" | "HEAD"): Promise<Response> {
  const url = new URL(request.url);
  const encoded = url.searchParams.get("u");
  const raw = url.searchParams.get("url");
  const target = encoded ? decodeUrl(encoded) : raw;
  if (!target) {
    return new Response("missing url", { status: 400, headers: CORS });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400, headers: CORS });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return new Response("bad protocol", { status: 400, headers: CORS });
  }

  // Forward Range so segment requests / seeking work.
  const fwd: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    accept: "*/*",
    "accept-language": "en-US,en;q=0.8",
    referer: `${parsed.protocol}//${parsed.hostname}/`,
    origin: `${parsed.protocol}//${parsed.hostname}`,
  };
  // Some upstreams (notably a few iptv-org-listed streams) refuse any UA
  // other than the one the broadcaster pinned. Callers can pass overrides
  // via the `ua` and `ref` query params to override the defaults below.
  const overrideUa = url.searchParams.get("ua");
  const overrideReferer = url.searchParams.get("ref");
  if (overrideUa) fwd["user-agent"] = overrideUa;
  if (overrideReferer) fwd["referer"] = overrideReferer;
  const range = request.headers.get("range");
  if (range) fwd["range"] = range;

  let upstream: Response;
  let currentUrl = parsed.toString();
  try {
    // Manually follow redirects — some runtimes don't auto-follow cross-origin.
    let hops = 0;
    while (true) {
      upstream = await fetch(currentUrl, {
        method,
        headers: fwd,
        redirect: "manual",
      });
      const status = upstream.status;
      if (status >= 300 && status < 400 && status !== 304) {
        const loc = upstream.headers.get("location");
        if (!loc || hops >= 5) break;
        currentUrl = new URL(loc, currentUrl).toString();
        hops++;
        continue;
      }
      break;
    }
  } catch (err) {
    console.error("[iptv-proxy] fetch failed", currentUrl, err);
    return unavailablePlaylist();
  }

  if (!upstream.ok && upstream.status !== 206) {
    console.warn("[iptv-proxy] upstream unavailable", upstream.status, currentUrl);
    return unavailablePlaylist();
  }
  // Use the final resolved URL for playlist base rewriting.
  parsed = new URL(currentUrl);

  const ct = (upstream.headers.get("content-type") || "").toLowerCase();
  const isPlaylist =
    ct.includes("mpegurl") ||
    ct.includes("application/x-mpegurl") ||
    ct.includes("vnd.apple.mpegurl") ||
    /\.m3u8(\?|$)/i.test(parsed.pathname);

  const headers = new Headers(CORS);
  const passthrough = ["content-range", "accept-ranges", "last-modified", "etag", "cache-control"];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  // raw=1 — return upstream text verbatim (used when importing user M3U
  // playlists so we don't rewrite per-channel stream URLs into proxy URLs).
  if (url.searchParams.get("raw") === "1") {
    const body = method === "HEAD" ? null : await upstream.text();
    headers.set("content-type", ct || "text/plain; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(body, { status: upstream.status, headers });
  }

  if (isPlaylist) {
    if (method === "HEAD") {
      headers.set("content-type", "application/vnd.apple.mpegurl");
      return new Response(null, { status: upstream.status, headers });
    }
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, upstream.url || parsed.toString());
    headers.set("content-type", "application/vnd.apple.mpegurl");
    headers.set("cache-control", "no-store");
    return new Response(rewritten, { status: upstream.status, headers });
  }

  // Binary segment / key / subtitle — stream through.
  const upstreamLen = upstream.headers.get("content-length");
  if (upstreamLen) headers.set("content-length", upstreamLen);
  headers.set("content-type", ct || "application/octet-stream");
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

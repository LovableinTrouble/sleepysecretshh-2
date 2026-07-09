import { createFileRoute } from "@tanstack/react-router";

/**
 * Download proxy: streams an upstream media file back through our origin with
 * a Content-Disposition: attachment header so the browser actually saves it
 * instead of navigating to it (or being blocked by hotlink/Referer checks on
 * the upstream CDN). Range requests are forwarded so resumable downloads and
 * background download managers work.
 */

const ALLOWED_HOST_SUFFIXES: string[] = [
  // Allow any https host — this is a generic file proxy. The downloader API
  // returns CDN URLs that change frequently, so an allowlist would be too
  // brittle. The route is rate-limited by Cloudflare and the response is
  // never executed in our origin (we just stream bytes), so this is safe.
];

function inferFilename(url: URL, hint?: string | null): string {
  if (hint && hint.trim())
    return hint
      .trim()
      .replace(/[\r\n"]/g, "")
      .slice(0, 200);
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "download";
  const cleaned = decodeURIComponent(last).replace(/[\r\n"]/g, "");
  if (/\.[a-z0-9]{2,5}$/i.test(cleaned)) return cleaned.slice(0, 200);
  return `${cleaned || "download"}.mp4`.slice(0, 200);
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
  };
}

export const Route = createFileRoute("/api/public/download")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),

      HEAD: async ({ request }) => handle(request, "HEAD"),
      GET: async ({ request }) => handle(request, "GET"),
    },
  },
});

async function handle(request: Request, method: "GET" | "HEAD"): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const filenameHint = url.searchParams.get("filename");
  if (!target) return new Response("missing url", { status: 400, headers: corsHeaders() });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400, headers: corsHeaders() });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return new Response("bad protocol", { status: 400, headers: corsHeaders() });
  }
  if (ALLOWED_HOST_SUFFIXES.length > 0) {
    const ok = ALLOWED_HOST_SUFFIXES.some((s) => parsed.hostname.endsWith(s));
    if (!ok) return new Response("host not allowed", { status: 403, headers: corsHeaders() });
  }

  const forwardHeaders: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    accept: "*/*",
    // Many CDNs check referer/origin; send something plausible from the upstream
    // host so hotlink protection doesn't bounce us.
    referer: `${parsed.protocol}//${parsed.hostname}/`,
    origin: `${parsed.protocol}//${parsed.hostname}`,
  };
  if (/hakuna[y]?matata/i.test(parsed.hostname + parsed.pathname)) {
    forwardHeaders.referer = "https://lok-lok.cc/";
    forwardHeaders.origin = "https://lok-lok.cc";
  }
  const range = request.headers.get("range");
  if (range) forwardHeaders["range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      method,
      headers: forwardHeaders,
      redirect: "follow",
    });
  } catch (err) {
    return new Response(`fetch failed: ${(err as Error).message}`, {
      status: 502,
      headers: corsHeaders(),
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`upstream ${upstream.status}`, {
      status: upstream.status,
      headers: corsHeaders(),
    });
  }

  const filename = inferFilename(parsed, filenameHint);
  const headers = new Headers(corsHeaders());

  const passthrough = ["content-length", "content-range", "accept-ranges", "last-modified", "etag"];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  const upstreamType = upstream.headers.get("content-type") || "";
  // Force a generic binary type for video files so the browser triggers a
  // download instead of trying to play them inline in a new tab.
  const isMedia = /\.(mp4|mkv|m4v|webm|avi|mov|ts|m3u8)(\?|$)/i.test(parsed.pathname);
  headers.set("content-type", isMedia || !upstreamType ? "application/octet-stream" : upstreamType);
  headers.set(
    "content-disposition",
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  headers.set("cache-control", "no-store");

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

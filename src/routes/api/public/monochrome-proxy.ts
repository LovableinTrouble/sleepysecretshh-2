import { createFileRoute } from "@tanstack/react-router";

/**
 * CORS proxy for Monochrome API at https://monochrome-api.samidy.com
 * Wraps all requests to prevent browser CORS/403 blocks.
 */

const MONOCHROME_BASE = "https://monochrome-api.samidy.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type",
};

async function proxyFetch(path: string, init: RequestInit = {}, timeout = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const url = `${MONOCHROME_BASE}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, audio/*, */*",
        ...(init.headers || {}),
      },
    });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

export const Route = createFileRoute("/api/public/monochrome-proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const endpoint = url.searchParams.get("endpoint"); // e.g., "/search?q=..."
        const rawPath = url.searchParams.get("path"); // direct path like /stream/xyz

        if (!endpoint && !rawPath) {
          return new Response(JSON.stringify({ error: "Missing 'endpoint' or 'path' parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const path = endpoint || rawPath || "";

        try {
          const res = await proxyFetch(path);

          // Handle audio streams specially for Range requests
          const contentType = res.headers.get("Content-Type") || "application/octet-stream";
          const contentLength = res.headers.get("Content-Length");
          const contentRange = res.headers.get("Content-Range");

          const headers: Record<string, string> = {
            "Content-Type": contentType,
            ...CORS,
          };

          if (contentLength) headers["Content-Length"] = contentLength;
          if (contentRange) headers["Content-Range"] = contentRange;

          const arrayBuffer = await res.arrayBuffer();

          return new Response(arrayBuffer, {
            status: res.status,
            headers,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Proxy error";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },

      POST: async ({ request }) => {
        const body = await request.text();
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const { path: postPath, method = "POST", body: postBody } = parsed;

        if (!postPath) {
          return new Response(JSON.stringify({ error: "Missing 'path' in body" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const res = await proxyFetch(postPath, {
            method,
            body: postBody ? JSON.stringify(postBody) : undefined,
            headers: postBody ? { "Content-Type": "application/json" } : undefined,
          });

          const data = await res.json();

          return new Response(JSON.stringify(data), {
            status: res.status,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Proxy error";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});

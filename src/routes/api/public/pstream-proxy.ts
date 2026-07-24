/* eslint-disable @typescript-eslint/no-explicit-any */
// P-Stream simple-proxy compatible endpoint. Forwards X-Origin / X-Referer /
// X-Cookie / X-User-Agent / X-X-Real-Ip as their real header names to the
// target passed in `?destination=`. See @p-stream/providers simpleProxy.
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Origin, X-Referer, X-Cookie, X-User-Agent, X-X-Real-Ip, X-Token",
  "Access-Control-Expose-Headers": "X-Final-Destination, X-Set-Cookie",
  "Access-Control-Max-Age": "86400",
};

const HEADER_UNMAP: Record<string, string> = {
  "x-origin": "origin",
  "x-referer": "referer",
  "x-cookie": "cookie",
  "x-user-agent": "user-agent",
  "x-x-real-ip": "x-real-ip",
};

async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const destination = url.searchParams.get("destination");
  if (!destination) {
    return new Response(JSON.stringify({ error: "missing destination" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const outHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HEADER_UNMAP[k]) {
      outHeaders.set(HEADER_UNMAP[k], value);
      return;
    }
    if (
      k === "host" || k === "connection" || k === "content-length" ||
      k === "accept-encoding" || k.startsWith("cf-") || k.startsWith("x-forwarded-")
    ) return;
    if (k === "origin" || k === "referer" || k === "cookie") return;
    outHeaders.set(key, value);
  });

  const method = request.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(destination, {
      method, headers: outHeaders, body, redirect: "follow",
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "proxy fetch failed", detail: String(e?.message ?? e) }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "set-cookie") { respHeaders.append("x-set-cookie", value); return; }
    if (k === "content-encoding" || k === "content-length" ||
        k === "transfer-encoding" || k === "connection") return;
    respHeaders.set(key, value);
  });
  respHeaders.set("X-Final-Destination", upstream.url || destination);
  Object.entries(CORS).forEach(([k, v]) => respHeaders.set(k, v));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const Route = createFileRoute("/api/public/pstream-proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => proxy(request),
      POST: async ({ request }) => proxy(request),
      PUT: async ({ request }) => proxy(request),
      DELETE: async ({ request }) => proxy(request),
    },
  },
});
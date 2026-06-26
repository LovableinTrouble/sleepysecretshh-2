import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
} as const;

export const Route = createFileRoute("/api/ppv/streams")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const r = await fetch("https://ppv.to/api/streams", {
            headers: {
              accept: "application/json",
              "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            },
          });
          const body = await r.text();
          return new Response(body, {
            status: r.status,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=30, s-maxage=30",
              ...CORS,
            },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ success: false, error: String((e as Error).message || e), streams: [] }),
            { status: 502, headers: { "Content-Type": "application/json", ...CORS } }
          );
        }
      },
    },
  },
});
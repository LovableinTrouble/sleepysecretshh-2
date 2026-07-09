import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
} as const;

const PPV_ENDPOINTS = ["https://api.ppv.to/api/streams", "https://api.ppv.st/api/streams"] as const;

export const Route = createFileRoute("/api/ppv/streams")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          let lastError = "Unable to reach PPV API";

          for (const endpoint of PPV_ENDPOINTS) {
            try {
              const r = await fetch(endpoint, {
                headers: {
                  accept: "application/json",
                  referer: "https://ppv.to/",
                  origin: "https://ppv.to",
                  "user-agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                },
              });
              const body = await r.text();
              const parsed = JSON.parse(body);
              if (!r.ok || !parsed?.success || !Array.isArray(parsed?.streams)) {
                lastError = `Bad PPV response from ${endpoint}`;
                continue;
              }

              return new Response(JSON.stringify(parsed), {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "public, max-age=10, s-maxage=10",
                  ...CORS,
                },
              });
            } catch (e) {
              lastError = String((e as Error).message || e);
            }
          }

          return new Response(JSON.stringify({ success: false, error: lastError, streams: [] }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({
              success: false,
              error: String((e as Error).message || e),
              streams: [],
            }),
            { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});

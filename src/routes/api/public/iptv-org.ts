import { createFileRoute } from "@tanstack/react-router";

/**
 * iptv-org proxy + filter endpoint.
 *
 * Two read operations:
 *   GET /api/public/iptv-org?type=countries
 *   GET /api/public/iptv-org?type=channels&country=US
 *
 * Big upstream files are cached in module scope from `src/lib/iptv-org.ts`,
 * so a single first request can take a few seconds but every subsequent
 * request returns in <50 ms. We still cap response freshness so a user
 * can re-pull after a transient upstream failure.
 */

import {
  getGlobalCountries,
  getGlobalChannelsByCountry,
} from "@/lib/iptv-org";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export const Route = createFileRoute("/api/public/iptv-org")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const type = (url.searchParams.get("type") || "").toLowerCase();
        const country = url.searchParams.get("country") || "";

        try {
          if (type === "countries") {
            const countries = await getGlobalCountries();
            return new Response(JSON.stringify({ countries }), {
              status: 200,
              headers: {
                ...CORS,
                "content-type": "application/json",
                "cache-control": "public, max-age=86400, s-maxage=86400",
              },
            });
          }

          if (type === "channels") {
            if (!/^[A-Za-z]{2,3}$/.test(country)) {
              return new Response(JSON.stringify({ error: "missing country" }), {
                status: 400,
                headers: { ...CORS, "content-type": "application/json" },
              });
            }
            const channels = await getGlobalChannelsByCountry(country);
            return new Response(
              JSON.stringify({ country: country.toUpperCase(), channels }),
              {
                status: 200,
                headers: {
                  ...CORS,
                  "content-type": "application/json",
                  "cache-control": "public, max-age=3600, s-maxage=7200",
                },
              },
            );
          }

          return new Response(
            JSON.stringify({ error: "type must be 'countries' or 'channels'" }),
            {
              status: 400,
              headers: { ...CORS, "content-type": "application/json" },
            },
          );
        } catch (err) {
          console.error("[iptv-org] handler failed", err);
          return new Response(
            JSON.stringify({
              error: "Couldn't reach the IPTV catalog right now.",
              detail: (err as Error)?.message ?? String(err),
            }),
            {
              status: 502,
              headers: { ...CORS, "content-type": "application/json" },
            },
          );
        }
      },
    },
  },
});

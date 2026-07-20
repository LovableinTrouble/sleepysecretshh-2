import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
} as const;

export const Route = createFileRoute("/api/downloads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async (event: any) => {
        try {
          let urlStr = "";
          try {
            if (event instanceof Request) {
              urlStr = event.url;
            } else if (event?.request?.url) {
              urlStr = event.request.url;
            } else if (typeof event?.url === "string") {
              urlStr = event.url;
            } else if (event?.path) {
              urlStr = `http://localhost${event.path}`;
            }
          } catch {}

          const u = new URL(urlStr);
          const input = {
            tmdbId: u.searchParams.get("tmdbId") || "",
            title: u.searchParams.get("title") || "",
            year: u.searchParams.get("year") || undefined,
            type: (u.searchParams.get("type") === "show" ? "show" : "movie") as "movie" | "show",
            season: u.searchParams.get("season") ? Number(u.searchParams.get("season")) : undefined,
            episode: u.searchParams.get("episode") ? Number(u.searchParams.get("episode")) : undefined,
          };

          if (!input.tmdbId || !input.title) {
            return new Response(
              JSON.stringify({ ok: false, downloads: [], subtitles: [], error: "Missing tmdbId or title" }),
              { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
            );
          }

          const { resolveDownloadProviders } = await import("@/lib/downloads.server");
          const result = await resolveDownloadProviders(input);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({
              ok: false,
              downloads: [],
              subtitles: [],
              error: String((e as Error)?.message || e),
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});

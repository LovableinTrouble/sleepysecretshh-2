import { createFileRoute } from "@tanstack/react-router";

/**
 * Subtitle proxy: fetches an upstream caption file (SRT or VTT), converts SRT
 * to WebVTT when needed, and serves it from our origin with permissive CORS so
 * <track> elements can load it reliably across browsers.
 */
function srtToVtt(input: string): string {
  // Normalize line endings, strip BOM
  const text = input.replace(/^\uFEFF/, "").replace(/\r+/g, "");
  // Replace "00:00:00,000" -> "00:00:00.000" timecodes
  const fixed = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${fixed.trim()}\n`;
}

export const Route = createFileRoute("/api/public/subtitle")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("url");
        if (!target) return new Response("missing url", { status: 400 });

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return new Response("invalid url", { status: 400 });
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return new Response("bad protocol", { status: 400 });
        }

        try {
          const upstream = await fetch(parsed.toString(), {
            headers: {
              "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Safari/537.36",
              accept: "*/*",
            },
          });
          if (!upstream.ok) {
            return new Response(`upstream ${upstream.status}`, { status: 502 });
          }
          const raw = await upstream.text();
          const looksLikeVtt = /^\s*WEBVTT/i.test(raw);
          const body = looksLikeVtt ? raw : srtToVtt(raw);
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "text/vtt; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (err) {
          return new Response(`fetch failed: ${(err as Error).message}`, {
            status: 502,
          });
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
          },
        }),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

const INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://inv.thepixora.com",
  "https://iv.melmac.space",
  "https://invidious.tiekoetter.com",
  "https://invidious.reallyaweso.me",
  "https://yewtu.be",
  "https://invidious.privacyredirect.com",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function tryFetch(url: string, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const Route = createFileRoute("/api/public/yt-playlist")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id || !/^[A-Za-z0-9_-]{5,}$/.test(id)) {
          return new Response(JSON.stringify({ error: "bad id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        // try instances in parallel, pick the first valid playlist response
        const attempts = INSTANCES.map((inst) =>
          tryFetch(`${inst}/api/v1/playlists/${id}`).then((data) => {
            if (data && Array.isArray(data.videos)) return data;
            return null;
          }),
        );
        let data: any = null;
        for (const p of attempts) {
          const r = await p;
          if (r) { data = r; break; }
        }
        if (!data) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", ...CORS },
        });
      },
    },
  },
});
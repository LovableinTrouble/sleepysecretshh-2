import { createFileRoute } from "@tanstack/react-router";

/**
 * Games catalog — backed by GameMonetize's public game-feed API.
 *
 * GameMonetize (https://gamemonetize.com/rss-builder) publishes a free,
 * unauthenticated JSON feed specifically meant for third-party sites to
 * embed their HTML5 games — this is their actual business model (they
 * monetize via ads baked into the game iframe itself), so unlike an
 * unofficial GitHub mirror, this catalog is licensed for embedding and is
 * actively maintained.
 *
 * We fetch a handful of categories server-side, merge + de-dupe them into
 * one catalog, and cache the result in memory for a while. Reasons to do
 * this server-side rather than call the feed straight from the browser:
 *   - one place to add a timeout + retry instead of every client doing it
 *   - a stale-but-good cached response can be served if GameMonetize is
 *     briefly down, instead of the games page erroring out
 *   - avoids relying on GameMonetize's CORS headers being present forever
 */

const FEED_BASE = "https://rss.gamemonetize.com/rssfeed.php";

// A representative spread of categories — GameMonetize doesn't offer a
// single "everything" page with useful ordering, so we combine several.
const CATEGORIES = ["Action", "Arcade", "Puzzles", "Racing", "Sports", ".IO"] as const;

const PER_CATEGORY = 30;
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min fresh
const STALE_TTL_MS = 6 * 60 * 60 * 1000; // serve stale up to 6h if upstream is down

type UpstreamGame = {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  url: string;
  category?: string;
  tags?: string;
  thumb: string;
  width?: string;
  height?: string;
};

export type CatalogGame = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  cover: string;
  url: string;
  width: number;
  height: number;
  instructions?: string;
};

let cache: { data: CatalogGame[]; fetchedAt: number } | null = null;
let inFlight: Promise<CatalogGame[]> | null = null;

async function fetchCategory(category: string): Promise<UpstreamGame[]> {
  const params = new URLSearchParams({
    format: "json",
    category,
    type: "html5",
    popularity: "most-popular",
    company: "All",
    amount: String(PER_CATEGORY),
  });
  const res = await fetch(`${FEED_BASE}?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GameMonetize ${category} feed ${res.status}`);
  const json = (await res.json()) as UpstreamGame[];
  return Array.isArray(json) ? json : [];
}

async function buildCatalog(): Promise<CatalogGame[]> {
  const settled = await Promise.allSettled(CATEGORIES.map(fetchCategory));

  const byId = new Map<string, CatalogGame>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const g of result.value) {
      if (byId.has(g.id)) continue;
      byId.set(g.id, {
        id: g.id,
        name: g.title.trim(),
        category: g.category || "Games",
        tags: (g.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        cover: g.thumb,
        url: g.url,
        width: Number(g.width) || 800,
        height: Number(g.height) || 600,
        instructions: g.instructions,
      });
    }
  }

  // Every category failed — treat as a hard failure so the caller can fall
  // back to a stale cache instead of serving an empty catalog.
  if (byId.size === 0 && settled.every((r) => r.status === "rejected")) {
    throw new Error("all upstream category fetches failed");
  }

  return [...byId.values()];
}

async function getCatalog(): Promise<{ data: CatalogGame[]; stale: boolean }> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { data: cache.data, stale: false };
  }

  if (!inFlight) {
    inFlight = buildCatalog().finally(() => {
      inFlight = null;
    });
  }

  try {
    const data = await inFlight;
    cache = { data, fetchedAt: now };
    return { data, stale: false };
  } catch (err) {
    if (cache && now - cache.fetchedAt < STALE_TTL_MS) {
      console.warn("[games-feed] upstream failed, serving stale cache", err);
      return { data: cache.data, stale: true };
    }
    throw err;
  }
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/public/games-feed")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const { data, stale } = await getCatalog();
          return new Response(JSON.stringify({ games: data }), {
            status: 200,
            headers: {
              ...CORS,
              "content-type": "application/json",
              "cache-control": stale ? "public, max-age=60" : "public, max-age=900, s-maxage=1800",
              "x-catalog-stale": String(stale),
            },
          });
        } catch (err) {
          console.error("[games-feed] failed", err);
          return new Response(JSON.stringify({ games: [], error: "Couldn't reach the game catalog." }), {
            status: 502,
            headers: { ...CORS, "content-type": "application/json" },
          });
        }
      },
    },
  },
});

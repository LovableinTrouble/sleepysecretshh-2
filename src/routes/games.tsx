import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import { Search, X, Gamepad2, ArrowDownAZ, Clock, Fullscreen, Loader2, Play } from "lucide-react";

// Backed by /api/public/games-feed, a server route that aggregates
// GameMonetize's public game-feed API (see that route for details on why).
const FEED_URL = "/api/public/games-feed";

type CatalogGame = {
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

type SortMode = "featured" | "name" | "new";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Games — Sleepy" },
      {
        name: "description",
        content: "Play hundreds of free web games instantly. Curated, ad-free, in one click.",
      },
    ],
  }),
  component: GamesPage,
});

async function loadGames(): Promise<CatalogGame[]> {
  const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(10000) });
  const body = (await res.json().catch(() => null)) as { games?: CatalogGame[]; error?: string } | null;
  if (!res.ok || !body) {
    throw new Error(body?.error || `Failed to load games (${res.status})`);
  }
  return body.games ?? [];
}

function sortGames(list: CatalogGame[], mode: SortMode): CatalogGame[] {
  const out = [...list];
  if (mode === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  // "new": higher numeric id ≈ more recently added to the catalog.
  else if (mode === "new") out.sort((a, b) => Number(b.id) - Number(a.id));
  // "featured": keep the server's own most-popular ordering per category.
  return out;
}

const PAGE_SIZE = 36;

function GamesPage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("featured");
  const [category, setCategory] = useState<string>("All");
  const [active, setActive] = useState<CatalogGame | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["games-catalog"],
    queryFn: loadGames,
    staleTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const categories = useMemo(() => {
    if (!data) return ["All"];
    return ["All", ...Array.from(new Set(data.map((g) => g.category))).sort()];
  }, [data]);

  const games = useMemo(() => {
    if (!data) return [] as CatalogGame[];
    const q = query.trim().toLowerCase();
    let filtered = category === "All" ? data : data.filter((g) => g.category === category);
    if (q) {
      filtered = filtered.filter(
        (g) => g.name.toLowerCase().includes(q) || g.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return sortGames(filtered, sort);
  }, [data, query, sort, category]);

  // Only mount a page's worth of cards at a time — with a few hundred
  // games in the catalog, mounting every card (images + hover transitions)
  // at once is what was causing the page to lag.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, sort, category]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, games.length));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [games.length]);

  const visibleGames = games.slice(0, visibleCount);

  return (
    <>
      <div className="min-h-screen px-3 pb-32 pt-16 md:px-6 md:pt-20 animate-page-in">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <header className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
                <Gamepad2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight md:text-3xl">Games</h1>
                <p className="text-xs text-muted-foreground md:text-sm">
                  {data ? `${data.length} titles` : "Loading catalog…"} · Free to play
                </p>
              </div>
            </div>

            {/* Search + sort */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search games or tags…"
                  className="w-full rounded-full border border-glass-border bg-white/[0.04] py-2 pl-9 pr-9 text-sm outline-none transition focus:border-primary/50 focus:bg-white/[0.06]"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-0.5 rounded-full border border-glass-border bg-white/[0.03] p-1">
                {(
                  [
                    { id: "featured", icon: Gamepad2, label: "Featured" },
                    { id: "name", icon: ArrowDownAZ, label: "A-Z" },
                    { id: "new", icon: Clock, label: "New" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSort(opt.id)}
                    aria-label={opt.label}
                    title={opt.label}
                    className={`grid h-8 w-8 place-items-center rounded-full transition ${
                      sort === opt.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <opt.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Category chips */}
          {data && (
            <div className="mb-6 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    category === c
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* States */}
          {isLoading && (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
              <p>Couldn't load games{error instanceof Error ? `: ${error.message}` : ""}.</p>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/25 disabled:opacity-50"
              >
                {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Try again
              </button>
            </div>
          )}

          {/* Grid */}
          {!isLoading && !error && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 md:gap-3 lg:grid-cols-6 xl:grid-cols-7">
                {visibleGames.map((g) => (
                  <GameCard key={g.id} game={g} onOpen={() => setActive(g)} />
                ))}
              </div>
              {visibleCount < games.length && <div ref={sentinelRef} className="h-10 w-full" />}
            </>
          )}

          {!isLoading && !error && games.length === 0 && (
            <div className="mt-16 text-center text-sm text-muted-foreground">No games match "{query}".</div>
          )}
        </div>
      </div>

      {active && <GamePlayer game={active} onClose={() => setActive(null)} />}
    </>
  );
}

function GameCard({ game, onOpen }: { game: CatalogGame; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group relative overflow-hidden rounded-xl border border-glass-border bg-white/[0.03] text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-900">
        <img
          src={game.cover}
          alt={game.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-90" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Play className="h-4 w-4" fill="currentColor" />
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="line-clamp-2 text-[11px] font-semibold text-white drop-shadow md:text-xs">{game.name}</p>
        <p className="mt-0.5 text-[10px] font-medium text-white/60">{game.category}</p>
      </div>
    </button>
  );
}

function GamePlayer({ game, onClose }: { game: CatalogGame; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const savedX = window.scrollX;
    const savedY = window.scrollY;
    const restoreScroll = () => window.scrollTo(savedX, savedY);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Chrome/Safari scroll the page to reveal whatever just exited
    // fullscreen. The player is `fixed`, so nothing visibly moves until
    // the player closes and the real page scroll position shows through —
    // at which point it looked like "the screen jumped". Snap it back.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        requestAnimationFrame(restoreScroll);
      }
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.body.style.overflow = "hidden";
    document.body.classList.add("game-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.body.style.overflow = "";
      document.body.classList.remove("game-open");
      restoreScroll();
    };
  }, [onClose]);

  // A slow/blocked CDN edge can leave the iframe never firing onLoad.
  // Surface a fallback instead of spinning forever.
  useEffect(() => {
    setStuck(false);
    const t = window.setTimeout(() => {
      if (loading) setStuck(true);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [game.url, loading]);

  const goFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{game.name}</p>
          {game.instructions && <p className="truncate text-[11px] text-white/50">{game.instructions}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goFullscreen}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            <Fullscreen className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="relative flex-1 bg-black">
        {loading && !stuck && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {loading && stuck && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
            <p className="text-sm text-white/70">
              This game is taking a while to load — it may be blocked on your network.
            </p>
            <a
              href={game.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Open in a new tab instead
            </a>
          </div>
        )}
        <iframe
          src={game.url}
          title={game.name}
          className="h-full w-full"
          allow="autoplay; fullscreen; gamepad; pointer-lock; cross-origin-isolated"
          allowFullScreen
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
}

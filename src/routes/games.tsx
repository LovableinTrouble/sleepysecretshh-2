import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search,
  X,
  Gamepad2,
  ArrowDownAZ,
  Flame,
  Clock,
  Fullscreen,
  Loader2,
  ExternalLink,
  Play,
} from "lucide-react";

const ZONES_URL = "https://cdn.jsdelivr.net/gh/gn-math/assets@main/zones.json";
const COVER_URL = "https://cdn.jsdelivr.net/gh/gn-math/covers@main";
const HTML_URL = "https://cdn.jsdelivr.net/gh/gn-math/html@main";
const POPULARITY_URL =
  "https://data.jsdelivr.net/v1/stats/packages/gh/gn-math/html@main/files?period=year";

type ZoneGame = {
  id: number;
  name: string;
  cover: string;
  url: string;
  author?: string;
  authorLink?: string;
};

type Game = ZoneGame & {
  coverUrl: string;
  playUrl: string;
  hits: number;
  pinned: boolean;
};

type SortMode = "popular" | "name" | "id";

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

function resolveAsset(input: string) {
  return input.replace("{COVER_URL}", COVER_URL).replace("{HTML_URL}", HTML_URL);
}

async function loadGames(): Promise<Game[]> {
  const [zonesRes, popRes] = await Promise.all([
    fetch(ZONES_URL, { cache: "force-cache" }),
    fetch(POPULARITY_URL).catch(() => null),
  ]);
  if (!zonesRes.ok) throw new Error("Failed to load games");
  const zones = (await zonesRes.json()) as ZoneGame[];

  const hitMap = new Map<number, number>();
  if (popRes && popRes.ok) {
    try {
      const files = (await popRes.json()) as { name: string; hits?: { total: number } }[];
      for (const f of files) {
        const m = f.name.match(/\/(\d+)[^/]*\.html$/);
        if (m) {
          const id = Number(m[1]);
          const total = f.hits?.total ?? 0;
          hitMap.set(id, (hitMap.get(id) ?? 0) + total);
        }
      }
    } catch {}
  }

  return zones.map((g) => ({
    ...g,
    coverUrl: resolveAsset(g.cover),
    playUrl: resolveAsset(g.url),
    hits: hitMap.get(g.id) ?? 0,
    pinned: g.id === -1,
  }));
}

function sortGames(list: Game[], mode: SortMode): Game[] {
  const pinned = list.filter((g) => g.pinned);
  const rest = list.filter((g) => !g.pinned);
  rest.sort((a, b) => {
    if (mode === "name") return a.name.localeCompare(b.name);
    if (mode === "id") return a.id - b.id;
    return b.hits - a.hits;
  });
  return [...pinned, ...rest];
}

function GamesPage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [active, setActive] = useState<Game | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gn-math-games"],
    queryFn: loadGames,
    staleTime: 60 * 60 * 1000,
  });

  const games = useMemo(() => {
    if (!data) return [] as Game[];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.filter((g) => g.name.toLowerCase().includes(q))
      : data;
    return sortGames(filtered, sort);
  }, [data, query, sort]);

  return (
    <div className="min-h-screen px-3 pb-32 pt-16 md:px-6 md:pt-20 animate-page-in">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
              <Gamepad2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">Games</h1>
              <p className="text-xs text-muted-foreground md:text-sm">
                {data ? `${data.filter((g) => !g.pinned).length} titles` : "Loading catalog…"} · Free to play
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
                placeholder="Search games…"
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
                  { id: "popular", icon: Flame, label: "Popular" },
                  { id: "name", icon: ArrowDownAZ, label: "A-Z" },
                  { id: "id", icon: Clock, label: "New" },
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

        {/* States */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
            Couldn't load games. Please try again shortly.
          </div>
        )}

        {/* Grid */}
        {!isLoading && !error && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 md:gap-3 lg:grid-cols-6 xl:grid-cols-7">
            {games.map((g) => (
              <GameCard key={`${g.id}-${g.name}`} game={g} onOpen={() => setActive(g)} />
            ))}
          </div>
        )}

        {!isLoading && !error && games.length === 0 && (
          <div className="mt-16 text-center text-sm text-muted-foreground">
            No games match "{query}".
          </div>
        )}
      </div>

      {active && <GamePlayer game={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function GameCard({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const isExternal = game.pinned || /^https?:\/\//.test(game.url);

  const handle = () => {
    if (game.pinned) {
      window.open(game.url, "_blank", "noopener,noreferrer");
      return;
    }
    onOpen();
  };

  return (
    <button
      onClick={handle}
      className="group relative overflow-hidden rounded-xl border border-glass-border bg-white/[0.03] text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-900">
        <img
          src={game.coverUrl}
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
            {isExternal && game.pinned ? (
              <ExternalLink className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" fill="currentColor" />
            )}
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="line-clamp-2 text-[11px] font-semibold text-white drop-shadow md:text-xs">
          {game.name}
        </p>
        {!game.pinned && game.hits > 0 && (
          <p className="mt-0.5 text-[10px] font-medium text-white/60">
            {formatHits(game.hits)} plays
          </p>
        )}
      </div>
    </button>
  );
}

function formatHits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function GamePlayer({ game, onClose }: { game: Game; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

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
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{game.name}</p>
          {game.author && (
            <p className="truncate text-[11px] text-white/50">by {game.author}</p>
          )}
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
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <iframe
          src={game.playUrl}
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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Bookmark, Volume2, VolumeX, Check, ListFilter as Filter, Loader2 } from "lucide-react";
import { fetchTrendingPage, fetchPopularPage, fetchMovieVideos, fetchTVVideos } from "@/lib/tmdb";
import type { Media } from "@/lib/catalog";

export const Route = createFileRoute("/shorts")({
  head: () => ({
    meta: [
      { title: "Shorts — Sleepy" },
      { name: "description", content: "Endless vertical trailers from movies and TV." },
    ],
  }),
  component: ShortsPage,
});

type Short = {
  id: string;
  mediaId: number;
  mediaType: "movie" | "tv";
  title: string;
  poster: string;
  backdrop: string;
  videoKey: string;
  overview: string;
  rating?: number;
  media: Media;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV" },
  { id: "trending", label: "Trending" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const WATCHLIST_KEY = "sleepy:watchlist.v1";

function getWatchlist(): Media[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? (JSON.parse(raw) as Media[]) : [];
  } catch {
    return [];
  }
}
function toggleWatchlist(m: Media) {
  const list = getWatchlist();
  const exists = list.some((x) => x.id === m.id && x.type === m.type);
  const next = exists ? list.filter((x) => !(x.id === m.id && x.type === m.type)) : [m, ...list.slice(0, 199)];
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("watchlist-changed"));
}

async function loadPage(
  filter: FilterId,
  page: number,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<Short[]> {
  let items: Media[] = [];
  try {
    if (filter === "movie") items = await fetchPopularPage("movie", page);
    else if (filter === "tv") items = await fetchPopularPage("tv", page);
    else if (filter === "trending") items = await fetchTrendingPage("all", page);
    else {
      // "all" — interleave movies + tv
      const [m, t] = await Promise.all([fetchPopularPage("movie", page), fetchPopularPage("tv", page)]);
      items = [];
      const max = Math.max(m.length, t.length);
      for (let i = 0; i < max; i++) {
        if (m[i]) items.push(m[i]);
        if (t[i]) items.push(t[i]);
      }
    }
  } catch {
    return [];
  }
  // Only movie/tv items are supported here.
  items = items.filter((i) => i.type === "movie" || i.type === "tv");

  // Fetch trailers in parallel, but cache each lookup by media id so we
  // never re-hit TMDB for a title we've already resolved a trailer for
  // (this repeats a lot: "trending" and "all" overlap heavily, and
  // switching filters back and forth used to refetch everything).
  const results = await Promise.all(
    items.map(async (item) => {
      try {
        const vids = await queryClient.fetchQuery({
          queryKey: ["short-trailer-videos", item.type, item.id],
          queryFn: () => (item.type === "tv" ? fetchTVVideos(item.id) : fetchMovieVideos(item.id)),
          staleTime: Infinity,
        });
        const trailer =
          vids.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
          vids.find((v) => v.site === "YouTube" && v.type === "Teaser") ||
          vids.find((v) => v.site === "YouTube");
        if (!trailer) return null;
        const short: Short = {
          id: `${item.type}-${item.id}`,
          mediaId: item.id,
          mediaType: item.type as "movie" | "tv",
          title: item.title,
          poster: item.poster || "",
          backdrop: item.backdrop || "",
          videoKey: trailer.key,
          overview: item.overview || "",
          rating: item.rating,
          media: item,
        };
        return short;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((s): s is Short => s !== null);
}

function ShortsPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [filter, setFilter] = useState<FilterId>("trending");
  const [showFilters, setShowFilters] = useState(false);
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const update = () => {
      setWatchlistIds(new Set(getWatchlist().map((m) => `${m.type}-${m.id}`)));
    };
    update();
    window.addEventListener("watchlist-changed", update);
    return () => window.removeEventListener("watchlist-changed", update);
  }, []);

  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ["shorts-feed", filter],
    queryFn: ({ pageParam }) => loadPage(filter, pageParam as number, queryClient),
    initialPageParam: 1,
    // Stop paginating once a page comes back empty (TMDB ran out of pages,
    // or every item on it lacked a trailer) — previously this kept
    // incrementing forever and would hammer TMDB with empty requests
    // every time the user scrolled near the bottom of a short list.
    getNextPageParam: (lastPage, allPages) => (lastPage.length === 0 ? undefined : allPages.length + 1),
    staleTime: 10 * 60 * 1000,
  });

  // De-dupe across pages.
  const shorts = useMemo(() => {
    const seen = new Set<string>();
    const out: Short[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const s of page) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
    }
    return out;
  }, [query.data]);

  // Scroll snap detection.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const h = el.clientHeight;
        const idx = Math.round(el.scrollTop / h);
        if (idx !== currentIndex && idx >= 0 && idx < shorts.length) {
          setCurrentIndex(idx);
        }
        // Load more when nearing end.
        if (idx >= shorts.length - 5 && query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentIndex, shorts.length, query]);

  // Keyboard nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "j") {
        setCurrentIndex((i) => Math.min(i + 1, shorts.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        setCurrentIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "m") {
        setMuted((m) => !m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shorts.length]);

  const scrollToIndex = useCallback((i: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToIndex(currentIndex);
  }, [currentIndex, scrollToIndex]);

  const current = shorts[currentIndex];
  const isSaved = current ? watchlistIds.has(current.id) : false;

  return (
    <div className="fixed inset-0 z-30 bg-black">
      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-4 pt-3 pb-6 bg-gradient-to-b from-black/80 to-transparent">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
              showFilters ? "bg-primary text-primary-foreground" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            {FILTERS.find((f) => f.id === filter)?.label ?? "Filter"}
          </button>
        </div>
        <div className="pointer-events-auto rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur">
          {shorts.length ? `${currentIndex + 1} / ${shorts.length}` : "—"}
        </div>
      </div>

      {/* Filter dropdown */}
      {showFilters && (
        <div className="absolute left-4 top-14 z-50 flex flex-col gap-1 rounded-2xl border border-white/10 bg-zinc-900/95 p-2 shadow-xl backdrop-blur-xl">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id);
                setCurrentIndex(0);
                setShowFilters(false);
                containerRef.current?.scrollTo({ top: 0 });
              }}
              className={`rounded-lg px-3 py-1.5 text-left text-xs font-semibold transition ${
                filter === f.id ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Feed */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll no-scrollbar snap-y snap-mandatory overscroll-contain"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {query.isLoading && shorts.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!query.isLoading && shorts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-lg font-semibold text-white">No trailers found</p>
            <p className="text-sm text-white/60">Try a different filter.</p>
          </div>
        )}

        {shorts.map((s, idx) => (
          <ShortSlide
            key={s.id}
            short={s}
            active={idx === currentIndex}
            muted={muted}
            isSaved={watchlistIds.has(s.id)}
            onToggleSaved={() => toggleWatchlist(s.media)}
            onToggleMute={() => setMuted((m) => !m)}
            onWatch={() =>
              navigate({
                to: "/media/$type/$id",
                params: { type: s.mediaType, id: String(s.mediaId) },
              })
            }
          />
        ))}

        {query.isFetchingNextPage && (
          <div className="flex h-24 items-center justify-center text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {/* Global mute indicator (bottom-left) */}
      {current && (
        <button
          onClick={() => setMuted((m) => !m)}
          className="absolute bottom-6 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      )}

      {current && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-4" />}

      {/* Side actions */}
      {current && (
        <div className="absolute right-3 bottom-24 z-40 flex flex-col gap-3">
          <ActionButton
            label="Watch"
            onClick={() =>
              navigate({
                to: "/media/$type/$id",
                params: { type: current.mediaType, id: String(current.mediaId) },
              })
            }
            className="bg-primary text-primary-foreground"
          >
            <Play className="h-5 w-5" fill="currentColor" />
          </ActionButton>
          <ActionButton
            label={isSaved ? "Saved" : "Save"}
            onClick={() => toggleWatchlist(current.media)}
            className={isSaved ? "bg-primary text-primary-foreground" : "bg-white/15 text-white"}
          >
            {isSaved ? <Check className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
          </ActionButton>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition hover:brightness-110 active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

function ShortSlide({
  short,
  active,
  muted,
  isSaved,
  onToggleSaved,
  onToggleMute,
  onWatch,
}: {
  short: Short;
  active: boolean;
  muted: boolean;
  isSaved: boolean;
  onToggleSaved: () => void;
  onToggleMute: () => void;
  onWatch: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // YouTube params chosen to hide chrome as much as YT allows.
  // Always start muted (autoplay policies require it); mute/unmute after
  // load happens via postMessage below instead of remounting the iframe,
  // which used to restart the trailer from 0 on every tap.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const src = active
    ? `https://www.youtube-nocookie.com/embed/${short.videoKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&fs=0&disablekb=1&playsinline=1&loop=1&playlist=${short.videoKey}&enablejsapi=1&origin=${encodeURIComponent(origin)}`
    : "";

  useEffect(() => {
    if (!active) return;
    const post = (func: "mute" | "unMute") => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
    };
    // The player may not be listening yet right after the iframe mounts,
    // so retry briefly until it's had time to attach.
    const attempts = [0, 250, 800, 1500].map((delay) =>
      window.setTimeout(() => post(muted ? "mute" : "unMute"), delay),
    );
    return () => attempts.forEach((t) => window.clearTimeout(t));
  }, [muted, active, short.videoKey]);

  return (
    <div className="relative flex h-full w-full snap-start snap-always items-center justify-center">
      {/* Backdrop poster while inactive */}
      {short.backdrop && (
        <img src={short.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-2xl" />
      )}

      <div className="relative h-full w-full max-w-[min(100vw,calc(100vh*9/16))] overflow-hidden bg-black md:h-[min(100vh,900px)] md:aspect-[9/16] md:w-auto md:rounded-2xl md:my-4 md:max-h-[calc(100vh-2rem)]">
        {active ? (
          <>
            {/* Prevent iframe from capturing our tap so user gesture can bubble
                for mute toggle & navigation. Also visually hides YT hover chrome. */}
            <iframe
              key={short.id}
              ref={iframeRef}
              src={src}
              title={short.title}
              className="absolute inset-0 h-full w-full scale-[1.35]"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              frameBorder={0}
            />
            {/* Overlay to swallow clicks on the YouTube iframe (blocks pause on click,
                blocks YT hover UI, keeps our snap scrolling smooth). */}
            <div className="absolute inset-0 z-10" onClick={onToggleMute} role="button" aria-label="Toggle sound" />
          </>
        ) : (
          short.poster && (
            <img src={short.poster} alt={short.title} className="absolute inset-0 h-full w-full object-cover" />
          )
        )}

        {/* Top + bottom gradients */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        {/* Text info */}
        <div className="absolute bottom-24 left-4 right-16 z-30">
          <div className="mb-1 inline-flex items-center gap-2">
            <span className="rounded-full bg-primary/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              {short.mediaType === "tv" ? "TV" : "Movie"}
            </span>
            {short.rating ? (
              <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                ★ {short.rating.toFixed(1)}
              </span>
            ) : null}
          </div>
          <h3 className="text-lg font-bold text-white drop-shadow md:text-xl">{short.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-white/80 drop-shadow md:text-sm">{short.overview}</p>
        </div>
      </div>

      {/* Unused, but keep dep on isSaved / onToggleSaved to satisfy TS */}
      <span className="hidden" data-saved={isSaved ? "1" : "0"} onClick={onToggleSaved} />
    </div>
  );
}

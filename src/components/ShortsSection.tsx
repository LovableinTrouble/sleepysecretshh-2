import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Play,
  Bookmark,
  Volume2,
  VolumeX,
  Check,
  ChevronUp,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { fetchTrendingPage, fetchPopularPage, fetchMovieVideos, fetchTVVideos } from "@/lib/tmdb";
import type { Media } from "@/lib/catalog";
import { addToFolder, removeFromFolder, getFolders, isInAnyFolder } from "@/lib/store";
import { stashWatchMedia } from "@/lib/watch-stash";

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
  { id: "trending", label: "Trending" },
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

/** Shorts saves into the real folder-based watchlist so it shows on /watchlist. */
function toggleWatchlist(m: Media) {
  if (isInAnyFolder(m.id)) {
    for (const f of getFolders()) {
      if (f.mediaIds.includes(m.id)) removeFromFolder(f.id, m.id);
    }
  } else {
    stashWatchMedia(m);
    addToFolder("default", m.id);
  }
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
      const [m, t] = await Promise.all([
        fetchPopularPage("movie", page),
        fetchPopularPage("tv", page),
      ]);
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
  items = items.filter((i) => i.type === "movie" || i.type === "tv");

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

export function ShortsSection() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [filter, setFilter] = useState<FilterId>("trending");
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const update = () => {
      const ids = new Set<number>(getFolders().flatMap((f) => f.mediaIds));
      setWatchlistIds(new Set([...ids].flatMap((id) => [`movie-${id}`, `tv-${id}`])));
    };
    update();
    window.addEventListener("watchlist-changed", update);
    const t = setInterval(update, 1500);
    return () => {
      window.removeEventListener("watchlist-changed", update);
      clearInterval(t);
    };
  }, []);

  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ["shorts-feed", filter],
    queryFn: ({ pageParam }) => loadPage(filter, pageParam as number, queryClient),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 0 ? undefined : allPages.length + 1,
    staleTime: 10 * 60 * 1000,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

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

  const scrollToIndex = useCallback((i: number) => {
    const el = containerRef.current;
    if (!el) return;
    const clamped = Math.max(0, i);
    el.scrollTo({ top: clamped * el.clientHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            setCurrentIndex(idx);
            if (idx >= shorts.length - 5 && hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }
        }
      },
      { root, threshold: 0.6 },
    );
    slideRefs.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [shorts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section className={full ? "pt-20 pb-10" : "mx-auto max-w-7xl px-5 pt-10 md:px-10"}>
      <div className={`mb-3 flex flex-wrap items-center gap-3 ${full ? "mx-auto max-w-7xl px-5 md:px-10" : ""}`}>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.4em] text-primary/80">Trailers</div>
          <h2 className="text-2xl font-black tracking-tight md:text-3xl">Shorts</h2>
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-full bg-foreground/8 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id);
                setCurrentIndex(0);
                containerRef.current?.scrollTo({ top: 0 });
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === f.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`relative overflow-hidden bg-black ${
          full ? "mx-auto max-w-7xl rounded-3xl ring-1 ring-white/10" : "rounded-3xl ring-1 ring-white/10"
        }`}
      >
        {shorts.length > 0 && (
          <div className="pointer-events-none absolute right-4 top-4 z-40 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur">
            {currentIndex + 1} / {shorts.length}
          </div>
        )}

        <div
          ref={containerRef}
          className={`w-full overflow-y-scroll no-scrollbar snap-y snap-mandatory overscroll-y-contain ${
            full ? "h-[calc(100vh-11rem)]" : "h-[70vh] max-h-[720px]"
          }`}

          style={{
            scrollSnapType: "y mandatory",
            scrollBehavior: "smooth",
            scrollSnapStop: "always",
            WebkitOverflowScrolling: "touch",
          }}
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
              index={idx}
              short={s}
              active={idx === currentIndex}
              muted={muted}
              isSaved={watchlistIds.has(s.id)}
              isFirst={idx === 0}
              isLast={idx === shorts.length - 1}
              registerRef={(el) => {
                if (el) slideRefs.current.set(idx, el);
                else slideRefs.current.delete(idx);
              }}
              onToggleSaved={() => toggleWatchlist(s.media)}
              onToggleMute={() => setMuted((m) => !m)}
              onPrev={() => scrollToIndex(idx - 1)}
              onNext={() => scrollToIndex(idx + 1)}
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
      </div>
    </section>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  disabled,
  className = "",
  size = "lg",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  size?: "lg" | "sm";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex items-center justify-center rounded-full backdrop-blur transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:hover:brightness-100 ${
        size === "lg" ? "h-12 w-12" : "h-9 w-9"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function ShortSlide({
  short,
  index,
  active,
  muted,
  isSaved,
  isFirst,
  isLast,
  registerRef,
  onToggleSaved,
  onToggleMute,
  onPrev,
  onNext,
  onWatch,
}: {
  short: Short;
  index: number;
  active: boolean;
  muted: boolean;
  isSaved: boolean;
  isFirst: boolean;
  isLast: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  onToggleSaved: () => void;
  onToggleMute: () => void;
  onPrev: () => void;
  onNext: () => void;
  onWatch: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const src = active
    ? `https://www.youtube-nocookie.com/embed/${short.videoKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&fs=0&disablekb=1&playsinline=1&loop=1&playlist=${short.videoKey}&enablejsapi=1&origin=${encodeURIComponent(origin)}`
    : "";

  useEffect(() => {
    if (!active) return;
    const post = (func: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args: [] }),
        "*",
      );
    };
    const attempts = [0, 250, 800, 1500].map((delay) =>
      window.setTimeout(() => {
        post(muted ? "mute" : "unMute");
        post("playVideo");
      }, delay),
    );
    return () => attempts.forEach((t) => window.clearTimeout(t));
  }, [muted, active, short.videoKey]);

  return (
    <div
      ref={registerRef}
      data-index={index}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center gap-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 70vh" }}
    >
      {short.backdrop && (
        <img
          src={short.backdrop}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-40 blur-lg"
        />
      )}

      <div className="hidden w-12 shrink-0 md:block" />

      <div className="relative h-full w-full max-w-[min(100%,calc(70vh*9/16))] overflow-hidden bg-black md:my-4 md:h-[calc(100%-2rem)] md:w-auto md:aspect-[9/16] md:rounded-2xl">
        {active ? (
          <>
            <iframe
              key={short.id}
              ref={iframeRef}
              src={src}
              title={short.title}
              tabIndex={-1}
              className="pointer-events-none absolute inset-0 h-full w-full scale-[1.4]"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              frameBorder={0}
            />
            <div
              className="absolute inset-0 z-10"
              onClick={onToggleMute}
              role="button"
              aria-label="Toggle sound"
            />
          </>
        ) : (
          short.poster && (
            <img
              src={short.poster}
              alt={short.title}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        {active && (
          <button
            onClick={onToggleMute}
            className="absolute left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/10 backdrop-blur-md transition hover:bg-black/55"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

        <div className="absolute bottom-20 left-4 right-16 z-30">
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
          <p className="mt-1 line-clamp-2 text-xs text-white/80 drop-shadow md:text-sm">
            {short.overview}
          </p>
        </div>
      </div>

      <div className="absolute bottom-20 right-3 z-40 flex w-12 flex-col items-center gap-2.5 md:static md:bottom-auto md:right-auto md:self-center">
        {active && (
          <>
            <ActionButton
              label="Previous"
              size="sm"
              disabled={isFirst}
              onClick={onPrev}
              className="bg-white/15 text-white"
            >
              <ChevronUp className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              label="Next"
              size="sm"
              disabled={isLast}
              onClick={onNext}
              className="bg-white/15 text-white"
            >
              <ChevronDown className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              label="Watch"
              onClick={onWatch}
              className="bg-primary text-primary-foreground"
            >
              <Play className="h-5 w-5" fill="currentColor" />
            </ActionButton>
            <ActionButton
              label={isSaved ? "Saved" : "Save"}
              onClick={onToggleSaved}
              className={isSaved ? "bg-primary text-primary-foreground" : "bg-white/15 text-white"}
            >
              {isSaved ? <Check className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}

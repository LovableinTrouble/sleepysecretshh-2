import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Bookmark, Volume2, VolumeX, Check, ListFilter as Filter } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { fetchTrending, fetchPopular, fetchTopRated, fetchAnime, fetchMovieVideos, fetchTVVideos } from "@/lib/tmdb";
import type { Media } from "@/lib/catalog";

export const Route = createFileRoute("/shorts")({
  head: () => ({
    meta: [
      { title: "Shorts — Sleepy" },
      { name: "description", content: "Watch trailers in a vertical scroll format." },
    ],
  }),
  component: ShortsPage,
});

type TrailerShort = {
  id: string;
  mediaId: number;
  mediaType: "movie" | "tv";
  title: string;
  poster: string;
  backdrop: string;
  videoKey: string;
  overview: string;
  rating?: number;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV Shows" },
  { id: "anime", label: "Anime" },
  { id: "trending", label: "Trending" },
  { id: "top", label: "Top Rated" },
];

const WATCHLIST_KEY = "sleepy:watchlist.v1";

function getWatchlist(): Media[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Media[];
  } catch {
    return [];
  }
}

function isInWatchlist(mediaId: number, mediaType: string): boolean {
  return getWatchlist().some((m) => m.id === mediaId && m.type === mediaType);
}

function toggleWatchlist(media: Media) {
  const list = getWatchlist();
  const exists = list.some((m) => m.id === media.id && m.type === media.type);
  if (exists) {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list.filter((m) => !(m.id === media.id && m.type === media.type))));
  } else {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([media, ...list.slice(0, 199)]));
  }
  window.dispatchEvent(new CustomEvent("watchlist-changed"));
}

function ShortsPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"phone" | "full">("phone");
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  // Update watchlist state
  useEffect(() => {
    const update = () => {
      const list = getWatchlist();
      setWatchlistIds(new Set(list.map((m) => `${m.type}-${m.id}`)));
    };
    update();
    window.addEventListener("watchlist-changed", update);
    return () => window.removeEventListener("watchlist-changed", update);
  }, []);

  // Fetch content with trailers
  const { data: shorts = [], isLoading } = useQuery({
    queryKey: ["shorts", filter],
    queryFn: async () => {
      let items: Media[] = [];

      if (filter === "trending") {
        items = await fetchTrending("all");
      } else if (filter === "anime") {
        items = await fetchAnime(2);
      } else if (filter === "movie") {
        items = await fetchPopular("movie", 2);
      } else if (filter === "tv") {
        items = await fetchPopular("tv", 2);
      } else if (filter === "top") {
        items = await fetchTopRated("movie", 1);
      } else {
        const [trending, movies, tv] = await Promise.all([
          fetchTrending("all"),
          fetchPopular("movie", 1),
          fetchPopular("tv", 1),
        ]);
        items = [...trending, ...movies, ...tv];
      }

      // Get trailers for each item
      const shortsData: TrailerShort[] = [];
      for (const item of items.slice(0, 50)) {
        try {
          const videos = item.type === "tv"
            ? await fetchTVVideos(item.id)
            : await fetchMovieVideos(item.id);
          const trailer = videos?.find((v: any) => v.type === "Trailer" && v.site === "YouTube");
          if (trailer) {
            shortsData.push({
              id: `${item.type}-${item.id}`,
              mediaId: item.id,
              mediaType: item.type,
              title: item.title,
              poster: item.poster || "",
              backdrop: item.backdrop || "",
              videoKey: trailer.key,
              overview: item.overview || "",
              rating: item.rating,
            });
          }
        } catch {}
      }

      return shortsData;
    },
    staleTime: 10 * 60 * 1000,
  });

  const currentShort = shorts[currentIndex];

  // Handle scroll for snap detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      const scroll = container.scrollTop;
      const height = container.clientHeight;
      const index = Math.round(scroll / height);
      if (index !== currentIndex && index >= 0 && index < shorts.length) {
        setCurrentIndex(index);
      }
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [currentIndex, shorts.length]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "j") {
        setCurrentIndex((i) => Math.min(i + 1, shorts.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        setCurrentIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shorts.length]);

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const height = container.clientHeight;
    container.scrollTo({ top: index * height, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToIndex(currentIndex);
  }, [currentIndex, scrollToIndex]);

  const handleAddToWatchlist = () => {
    if (!currentShort) return;
    const media: Media = {
      id: currentShort.mediaId,
      type: currentShort.mediaType,
      title: currentShort.title,
      poster: currentShort.poster,
      backdrop: currentShort.backdrop,
      overview: currentShort.overview,
    };
    toggleWatchlist(media);
  };

  const handleWatch = () => {
    if (!currentShort) return;
    navigate({
      to: "/media/$type/$id",
      params: { type: currentShort.mediaType, id: String(currentShort.mediaId) },
    });
  };

  const isCurrentInWatchlist = currentShort ? watchlistIds.has(`${currentShort.mediaType}-${currentShort.mediaId}`) : false;

  return (
    <div className="fixed inset-0 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              showFilters ? "bg-primary text-primary-foreground" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>
          <button
            onClick={() => setViewMode((v) => (v === "phone" ? "full" : "phone"))}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            {viewMode === "phone" ? "Fullscreen" : "Phone"}
          </button>
        </div>
        <div className="text-sm font-semibold text-white">
          {currentIndex + 1} / {shorts.length || 0}
        </div>
      </div>

      {/* Filter dropdown */}
      {showFilters && (
        <div className="absolute top-14 left-4 z-50 rounded-xl border border-white/10 bg-card/95 p-2 backdrop-blur-xl">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFilter(f.id); setShowFilters(false); setCurrentIndex(0); }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                filter === f.id ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Shorts container */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
          </div>
        ) : shorts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <p className="text-lg font-semibold text-white">No trailers found</p>
            <p className="mt-1 text-sm text-white/60">Try a different filter</p>
          </div>
        ) : (
          shorts.map((short, index) => (
            <div
              key={short.id}
              className="flex h-full w-full snap-start snap-always items-center justify-center p-4"
            >
              <div
                className={`relative overflow-hidden rounded-2xl bg-zinc-900 ${
                  viewMode === "phone" ? "aspect-[9/16] h-[80vh] max-h-[700px]" : "h-full w-full"
                }`}
              >
                {/* YouTube embed */}
                <iframe
                  src={`https://www.youtube.com/embed/${short.videoKey}?autoplay=${index === currentIndex ? 1 : 0}&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${short.videoKey}`}
                  className="absolute inset-0 h-full w-full"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />

                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
                  <h3 className="text-lg font-bold text-white md:text-xl">{short.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-white/70 md:text-sm">{short.overview}</p>
                  {short.rating && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-400">
                      ★ {short.rating.toFixed(1)}
                    </div>
                  )}
                </div>

                {/* Action buttons (right side) */}
                {index === currentIndex && currentShort && (
                  <div className="absolute right-3 bottom-20 flex flex-col gap-3">
                    <button
                      onClick={handleWatch}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110"
                    >
                      <Play className="h-5 w-5" fill="currentColor" />
                    </button>
                    <button
                      onClick={handleAddToWatchlist}
                      className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                        isCurrentInWatchlist
                          ? "bg-primary text-primary-foreground"
                          : "bg-white/20 text-white hover:bg-white/30"
                      }`}
                    >
                      {isCurrentInWatchlist ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Bookmark className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => setMuted(!muted)}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                    >
                      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

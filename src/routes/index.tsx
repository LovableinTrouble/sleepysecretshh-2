import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Hero } from "@/components/Hero";
import { MediaRow } from "@/components/MediaRow";
import { ContinueWatchingRow } from "@/components/ContinueWatching";
import { fetchTrending, fetchPopular, fetchTopRated, fetchAnime } from "@/lib/tmdb";
import { stashWatchMedia } from "@/lib/watch-stash";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sleepy — Home" },
      { name: "description", content: "Discover trending movies, TV shows and anime — beautifully curated on Sleepy. Continue watching across devices with a single account number." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  // Fetch online count once on mount
  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const res = await fetch("https://api.countapi.xyz/hit/sleepy-stream/online");
        if (res.ok) {
          const data = await res.json();
          setOnlineCount(data.value);
        }
      } catch {
        // Fallback to simulated count
        setOnlineCount(Math.floor(Math.random() * 500) + 800);
      }
    };
    fetchOnline();
  }, []);

  const trending = useQuery({ queryKey: ["trending"], queryFn: () => fetchTrending("all"), staleTime: 5 * 60_000 });
  const movies = useQuery({ queryKey: ["popular-movies"], queryFn: () => fetchPopular("movie", 2), staleTime: 5 * 60_000 });
  const tv = useQuery({ queryKey: ["popular-tv"], queryFn: () => fetchPopular("tv", 2), staleTime: 5 * 60_000 });
  const top = useQuery({ queryKey: ["top-movies"], queryFn: () => fetchTopRated("movie", 1), staleTime: 5 * 60_000 });
  const anime = useQuery({ queryKey: ["anime-trending-week-v2"], queryFn: () => fetchAnime(2), staleTime: 30 * 60_000 });

  const featured = (trending.data ?? []).slice(0, 6);

  const openDetails = (m: any) => { stashWatchMedia(m); navigate({ to: "/media/$type/$id", params: { type: m.type, id: String(m.id) } }); };
  const play = (m: any) => { stashWatchMedia(m); navigate({ to: "/watch/$id", params: { id: String(m.id) }, search: { t: m.type } }); };

  return (
    <div className="relative min-h-screen pb-20 md:pb-8 animate-page-in">

      {/* Online user count - top right, home page only */}
      {onlineCount !== null && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/10">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span>{onlineCount.toLocaleString()} online</span>
        </div>
      )}

      {featured.length ? (
        <Hero items={featured} onPlay={play} onMore={openDetails} />
      ) : (
        <div className="h-[80vh] min-h-[560px] w-full animate-shimmer" />
      )}

      <main className="relative -mt-20 animate-soft-rise space-y-12">
        <ContinueWatchingRow />
        <Row title="Trending This Week" q={trending} />
        <Row title="Popular Movies" q={movies} />
        <Row title="Top TV Shows" q={tv} />
        <Row title="Top Rated Movies" q={top} />
        <Row title="Anime — Trending This Week" q={anime} />
      </main>
    </div>
  );
}

function Row({ title, q }: { title: string; q: ReturnType<typeof useQuery<any>> }) {
  if (q.isLoading) {
    return (
      <section className="px-4 md:px-8">
        <div className="mb-3 h-5 w-48 rounded-md animate-shimmer" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 w-40 shrink-0 rounded-2xl animate-shimmer md:w-44" />
          ))}
        </div>
      </section>
    );
  }
  if (q.isError || !q.data?.length) return null;
  return <MediaRow title={title} items={q.data} />;
}

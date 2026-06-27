import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Hero } from "@/components/Hero";
import { MediaRow } from "@/components/MediaRow";
import { ContinueWatchingRow } from "@/components/ContinueWatching";
import { useSettings } from "@/lib/store";
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
  const [s] = useSettings();

  const trending = useQuery({ queryKey: ["trending"], queryFn: () => fetchTrending("all"), staleTime: 5 * 60_000 });
  const movies = useQuery({ queryKey: ["popular-movies"], queryFn: () => fetchPopular("movie", 2), staleTime: 5 * 60_000 });
  const tv = useQuery({ queryKey: ["popular-tv"], queryFn: () => fetchPopular("tv", 2), staleTime: 5 * 60_000 });
  const top = useQuery({ queryKey: ["top-movies"], queryFn: () => fetchTopRated("movie", 1), staleTime: 5 * 60_000 });
  const anime = useQuery({ queryKey: ["anime-trending-week-v2"], queryFn: () => fetchAnime(2), staleTime: 30 * 60_000 });

  const featured = (trending.data ?? []).slice(0, 6);
  const rowSpacing = s.homepageDensity === "compact" ? "space-y-6" : s.homepageDensity === "cinematic" ? "space-y-16" : "space-y-12";

  const surprisePool = [
    ...(trending.data ?? []),
    ...(movies.data ?? []),
    ...(tv.data ?? []),
    ...(top.data ?? []),
    ...(anime.data ?? []),
  ];
  const surprise = () => {
    if (!surprisePool.length) return;
    const pick = surprisePool[Math.floor(Math.random() * surprisePool.length)];
    openDetails(pick);
  };

  const openDetails = (m: any) => { stashWatchMedia(m); navigate({ to: "/media/$type/$id", params: { type: m.type, id: String(m.id) } }); };
  const play = (m: any) => { stashWatchMedia(m); navigate({ to: "/watch/$id", params: { id: String(m.id) }, search: { t: m.type } }); };

  return (
    <div className="relative min-h-screen pb-20 md:pb-8 animate-page-in">

      {featured.length ? (
        <Hero items={featured} onPlay={play} onMore={openDetails} />
      ) : (
        <div className="h-[80vh] min-h-[560px] w-full animate-shimmer" />
      )}

      <main className={`relative -mt-20 animate-soft-rise ${rowSpacing}`}>
        <ContinueWatchingRow />
        <Row title="Trending This Week" q={trending} />
        <Row title="Popular Movies" q={movies} />
        <Row title="Top TV Shows" q={tv} />
        <Row title="Top Rated Movies" q={top} />
        <Row title="Anime — Trending This Week" q={anime} />
      </main>

      <button
        type="button"
        onClick={surprise}
        disabled={!surprisePool.length}
        className="group fixed bottom-24 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_30px_color-mix(in_oklab,var(--primary)_35%,transparent)] backdrop-blur-xl transition hover:scale-[1.03] hover:bg-primary/25 disabled:opacity-40 md:bottom-8 md:right-8"
        aria-label="Surprise me with a random title"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 transition group-hover:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7M16 21h5v-5M14 14l7 7M8 3H3v5M3 3l7 7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Surprise me
      </button>
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { MediaCard } from "@/components/MediaCard";
import { Shuffle, Sparkles } from "lucide-react";
import {
  fetchPopular,
  fetchTrending,
  fetchAnime,
  fetchAnimeByGenre,
  fetchByGenre,
  fetchUpcoming,
  fetchByProvider,
  fetchTopRated,
  STREAMING_SERVICES,
} from "@/lib/tmdb";
import type { Media } from "@/lib/catalog";
import { stashWatchMedia } from "@/lib/watch-stash";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore — Sleepy" },
      { name: "description", content: "Browse movies, TV series, and anime in one place. Filter by genre, year, and rating." },
    ],
  }),
  component: ExplorePage,
});

type ContentType = "all" | "movie" | "tv" | "anime" | "upcoming";
type SortKey = "popularity" | "rating" | "year";

const MOVIE_GENRES: { id: number; name: string }[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 27, name: "Horror" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" },
];

const TV_GENRES: { id: number; name: string }[] = [
  { id: 10759, name: "Action" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 9648, name: "Mystery" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10764, name: "Reality" },
];

function ExplorePage() {
  const navigate = useNavigate();
  const [type, setType] = useState<ContentType>("all");
  const [genreId, setGenreId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("popularity");
  const [minRating, setMinRating] = useState(0);
  const [providerId, setProviderId] = useState<number | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);

  useEffect(() => {
    setGenreId(null);
  }, [type]);

  const genres = useMemo(() => {
    if (type === "movie") return MOVIE_GENRES;
    if (type === "tv" || type === "anime") return TV_GENRES;
    return [...MOVIE_GENRES.filter((g) => TV_GENRES.some((t) => t.name === g.name))];
  }, [type]);

  const query = useQuery<Media[]>({
    queryKey: ["explore", type, genreId, providerId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const results: Media[] = [];
      if (providerId != null) {
        results.push(...(await fetchByProvider(providerId, 2)));
        const filtered = type === "movie" ? results.filter((m) => m.type === "movie")
          : type === "tv" || type === "anime" ? results.filter((m) => m.type === "tv")
          : results;
        return dedup(filtered);
      } else {
        if (type === "movie" || type === "all") {
          results.push(...(genreId != null ? await fetchByGenre("movie", genreId, 2) : await fetchTrending("movie")));
          if (type === "all" && genreId == null) results.push(...(await fetchPopular("movie", 1)));
        }
        if (type === "tv" || type === "all") {
          results.push(...(genreId != null ? await fetchByGenre("tv", genreId, 2) : await fetchTrending("tv")));
          if (type === "all" && genreId == null) results.push(...(await fetchPopular("tv", 1)));
        }
        if (type === "anime") {
          results.push(...(genreId != null ? await fetchAnimeByGenre(genreId, 2) : await fetchAnime(3)));
        }
        if (type === "upcoming") {
          results.push(...(await fetchUpcoming(3)));
        }
      }
      return dedup(results);
    },
  });

  const activeService = providerId != null
    ? STREAMING_SERVICES.find((s) => s.id === providerId) ?? null
    : null;

  const filtered = useMemo(() => {
    const items = (query.data ?? []).filter((m) => m.rating >= minRating);
    return [...items].sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "year") return Number(b.year) - Number(a.year);
      return 0;
    });
  }, [query.data, minRating, sort]);

  const pickRandomMovie = async () => {
    setRandomLoading(true);
    try {
      // Fetch more data to have a bigger pool
      const [trending, popular, topRated] = await Promise.all([
        fetchTrending("all"),
        fetchPopular("movie", 2),
        fetchTopRated("movie", 1),
      ]);
      const all = dedup([...trending, ...popular, ...topRated]);
      const pool = all.filter((m) => {
        if (type !== "all" && m.type !== type) return false;
        if (genreId != null) {
          // Genre filter is approximate since we don't have genre data on media
          return true;
        }
        if (m.rating < minRating) return false;
        return true;
      });

      if (pool.length > 0) {
        const random = pool[Math.floor(Math.random() * pool.length)];
        stashWatchMedia(random);
        navigate({ to: "/media/$type/$id", params: { type: random.type, id: String(random.id) } });
      }
    } finally {
      setRandomLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-32 pt-16 animate-page-in md:pt-20">
      <header className="px-6 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-2 text-xs uppercase tracking-[0.4em] text-primary/80">Discover</div>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">Explore</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Movies, series, and anime — all in one library. Filter by type, genre, provider, rating, and sort.
          </p>
        </div>
      </header>

      <div className="sticky top-0 z-30 mt-8 border-y border-white/5 bg-background/90 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-10">
          <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(560px,620px)] xl:items-center">
              <div className="grid w-full grid-cols-5 gap-1 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/10">
              {([
                ["all", "All"],
                ["movie", "Movies"],
                ["tv", "TV"],
                ["anime", "Anime"],
                ["upcoming", "Upcoming"],
              ] as [ContentType, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setType(k)}
                  className={`h-9 min-w-0 rounded-xl px-2 text-center text-xs font-semibold transition md:text-[13px] ${
                    type === k
                      ? "bg-primary text-primary-foreground shadow-[0_8px_22px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
                      : "text-muted-foreground hover:bg-white/7 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <ProviderButton active={activeService} onOpen={() => setProviderOpen(true)} onClear={() => setProviderId(null)} />
                <SortSelect value={sort} onChange={setSort} />
                <div className="flex h-11 min-w-0 items-center gap-2 rounded-2xl bg-white/[0.04] px-3 text-xs ring-1 ring-white/10">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Rating</span>
                  <input
                    type="range"
                    min={0}
                    max={9}
                    step={0.5}
                    value={minRating}
                    onChange={(e) => setMinRating(Number(e.target.value))}
                    className="range-clean h-2 min-w-0 flex-1"
                  />
                  <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">{minRating.toFixed(1)}</span>
                </div>
              </div>
            </div>

            <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl bg-white/[0.025] p-2 ring-1 ring-white/8 no-scrollbar">
                <button
                  onClick={() => setGenreId(null)}
                  className={`h-9 shrink-0 rounded-xl px-3.5 text-xs font-semibold transition ${
                    genreId == null ? "bg-white/12 text-foreground ring-1 ring-white/14" : "text-muted-foreground hover:bg-white/7 hover:text-foreground"
                  }`}
                >
                  All genres
                </button>
                {genres.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGenreId(g.id === genreId ? null : g.id)}
                    className={`h-9 shrink-0 rounded-xl px-3.5 text-xs font-semibold transition ${
                      genreId === g.id ? "bg-white/12 text-foreground ring-1 ring-white/14" : "text-muted-foreground hover:bg-white/7 hover:text-foreground"
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
                {/* Random movie button */}
                <button
                  onClick={pickRandomMovie}
                  disabled={randomLoading}
                  className="ml-2 flex h-9 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-primary/80 to-accent/80 px-4 text-xs font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
                >
                  {randomLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Shuffle className="h-4 w-4" />
                  )}
                  <span>I'm feeling lucky</span>
                </button>
              </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pt-8 md:px-10">
        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-2xl animate-shimmer" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-3xl border border-white/10 bg-white/[0.03] py-20 text-center text-muted-foreground">
            <div>
              <div className="text-base font-medium text-foreground">No matches</div>
              <div className="mt-1 text-sm">Try widening your filters.</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 animate-soft-rise">
            {filtered.map((m) => (
              <MediaCard key={`${m.type}-${m.id}`} media={m} fill />
            ))}
          </div>
        )}
      </main>

      {providerOpen && (
        <ProviderPicker
          current={providerId}
          onClose={() => setProviderOpen(false)}
          onPick={(id) => { setProviderId(id); setProviderOpen(false); }}
        />
      )}
    </div>
  );
}

function ProviderButton({ active, onOpen, onClear }: { active: { name: string; logo: string; accent: string } | null; onOpen: () => void; onClear: () => void }) {
  return (
    <div className="flex h-11 min-w-0 items-center rounded-2xl bg-white/[0.04] text-xs font-semibold ring-1 ring-white/10 transition hover:bg-white/[0.07]">
      <button onClick={onOpen} className="inline-flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-foreground">
        <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/8 ring-1 ring-white/12" style={active ? { background: active.accent } : undefined}>
          {active ? (
            <img src={active.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
          )}
        </span>
        <span className="min-w-0 truncate">{active?.name ?? "Provider"}</span>
      </button>
      {active && (
        <button
          onClick={onClear}
          aria-label="Clear provider"
          className="mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      )}
    </div>
  );
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "popularity", label: "Popular" },
  { key: "rating", label: "Top rated" },
  { key: "year", label: "Newest" },
];

function SortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = SORT_OPTIONS.find((o) => o.key === value) ?? SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 text-xs font-semibold text-foreground ring-1 ring-white/10 transition hover:bg-white/[0.07]"
        aria-expanded={open}
      >
        <span className="truncate">{active.label}</span>
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div className={`absolute right-0 top-12 z-40 w-40 overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.16_0.02_280)] p-1.5 text-white shadow-2xl transition duration-150 ${open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}>
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => { onChange(option.key); setOpen(false); }}
            className={`flex h-9 w-full items-center justify-between rounded-xl px-3 text-left text-xs font-semibold transition ${value === option.key ? "bg-primary/20 text-white ring-1 ring-primary/35" : "text-white/65 hover:bg-white/8 hover:text-white"}`}
          >
            {option.label}
            {value === option.key && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-primary" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>}
          </button>
        ))}
      </div>
    </div>
  );
}

function dedup(items: Media[]): Media[] {
  const seen = new Set<string>();
  return items.filter((m) => {
    const k = `${m.type}-${m.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ProviderPicker({ current, onClose, onPick }: { current: number | null; onClose: () => void; onPick: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return STREAMING_SERVICES;
    return STREAMING_SERVICES.filter((s) => s.name.toLowerCase().includes(term) || s.blurb.toLowerCase().includes(term));
  }, [q]);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] grid h-dvh w-dvw place-items-center overflow-hidden bg-black/72 px-4 py-6 backdrop-blur-md animate-fade-in">
      <button onClick={onClose} aria-label="Close" className="absolute inset-0" />
      <div className="relative z-10 flex h-[min(620px,calc(100dvh-48px))] w-full max-w-[430px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[oklch(0.15_0.02_280)] text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)] animate-soft-rise">
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/18 ring-1 ring-primary/30">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">Provider</div>
              <div className="truncate text-base font-semibold">Choose service</div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="shrink-0 px-5 pt-4">
          <div className="flex h-11 items-center gap-2.5 rounded-2xl bg-black/35 px-3.5 ring-1 ring-white/10 transition focus-within:ring-primary/45">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white/45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search services…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </div>
        </div>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto px-3 pb-4 pt-1">
          {filtered.length === 0 && (
            <div className="grid place-items-center py-10 text-sm text-white/55">No services match "{q}"</div>
          )}
          {filtered.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              style={{ animationDelay: `${i * 14}ms` }}
              className={`flex h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition animate-fade-in ${current === s.id ? "bg-primary/20 text-white ring-1 ring-primary/40" : "text-white/80 hover:bg-white/8 hover:text-white"}`}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-white/10" style={{ background: s.accent }}>
                <img src={s.logo} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.name}</div>
                <div className="truncate text-xs text-white/45">{s.blurb}</div>
              </div>
              {current === s.id && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

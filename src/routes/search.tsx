import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaCard } from "@/components/MediaCard";
import { searchMulti, fetchTrending } from "@/lib/tmdb";
import {
  addRecentSearch,
  clearRecentSearches,
  removeRecentSearch,
  useRecentSearches,
} from "@/lib/recent-searches";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — VOID" }, { name: "description", content: "Search the VOID catalog." }] }),
  component: Search,
});

type FilterType = "all" | "movie" | "tv" | "anime";
type SortKey = "relevance" | "rating" | "year";

function Search() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortKey>("relevance");
  const recents = useRecentSearches();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) return;
    const t = setTimeout(() => addRecentSearch(debounced), 1200);
    return () => clearTimeout(t);
  }, [debounced]);

  const trend = useQuery({ queryKey: ["search-trending"], queryFn: () => fetchTrending("all"), staleTime: 5 * 60_000 });
  const res = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchMulti(debounced),
    enabled: debounced.length > 0,
  });

  const rawResults = debounced ? (res.data ?? []) : (trend.data ?? []);
  const loading = debounced ? res.isLoading : trend.isLoading;
  const showRecents = !debounced && recents.length > 0;

  const results = useMemo(() => {
    let items = rawResults;
    if (filter !== "all") items = items.filter((m) => m.type === filter);
    if (sort === "rating") items = [...items].sort((a, b) => b.rating - a.rating);
    else if (sort === "year") items = [...items].sort((a, b) => Number(b.year) - Number(a.year));
    return items;
  }, [rawResults, filter, sort]);

  return (
    <div className="min-h-screen px-5 pb-32 pt-16 md:px-10 md:pt-20 animate-page-in">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7">
          <div className="text-xs uppercase tracking-[0.32em] text-primary/80">Search</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            Find something to watch
          </h1>
        </div>

        {/* Clean search bar */}
        <div className="sticky top-3 z-20 md:top-4">
          <div className="group relative flex items-center gap-3 rounded-2xl border border-white/10 bg-background/80 pl-5 pr-2 py-2 backdrop-blur-2xl shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)] transition-all duration-200 focus-within:border-primary/60 focus-within:shadow-[0_10px_40px_-15px_color-mix(in_oklab,var(--primary)_45%,transparent)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted-foreground transition group-focus-within:text-primary" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) addRecentSearch(q.trim()); }}
              placeholder="Movies, TV, anime, people…"
              className="h-10 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                aria-label="Clear search"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2 animate-fade-in">
            <div className="flex items-center gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10">
              {([
                ["all", "All"],
                ["movie", "Movies"],
                ["tv", "TV"],
                ["anime", "Anime"],
              ] as [FilterType, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <SearchSortSelect value={sort} onChange={setSort} />
          </div>
        </div>

        {showRecents && (
          <section className="mt-7 animate-fade-in">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Recent</h2>
              <button
                onClick={clearRecentSearches}
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recents.map((term, i) => (
                <div
                  key={term}
                  style={{ animationDelay: `${i * 25}ms` }}
                  className="group/chip flex items-center gap-1 rounded-full bg-white/[0.04] pl-3 pr-1 ring-1 ring-white/10 transition hover:bg-white/[0.08] animate-fade-in"
                >
                  <button
                    onClick={() => setQ(term)}
                    className="flex items-center gap-2 py-1.5 text-sm font-medium text-foreground"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/></svg>
                    {term}
                  </button>
                  <button
                    onClick={() => removeRecentSearch(term)}
                    aria-label={`Remove ${term}`}
                    className="rounded-full p-1.5 text-muted-foreground opacity-0 transition group-hover/chip:opacity-100 hover:bg-white/10 hover:text-foreground"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 flex items-baseline justify-between border-b border-white/10 pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {debounced ? `Results for "${debounced}"` : "Trending now"}
          </h2>
          {!loading && <div className="text-xs text-muted-foreground">{results.length} title{results.length === 1 ? "" : "s"}</div>}
        </div>

        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (<div key={i} className="aspect-[2/3] rounded-xl animate-shimmer" />))}
          </div>
        ) : results.length === 0 && debounced ? (
          <div className="mt-16 flex flex-col items-center text-center text-muted-foreground animate-fade-in">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-white/5 ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </div>
            <p className="mt-4 text-sm">No matches for <span className="font-semibold text-foreground">"{debounced}"</span></p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 overflow-visible sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map((m, i) => (
              <div key={`${m.type}-${m.id}`} style={{ animationDelay: `${Math.min(i, 18) * 25}ms` }} className="animate-soft-rise">
                <MediaCard media={m} fill />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SEARCH_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "relevance", label: "Most relevant" },
  { key: "rating", label: "Top rated" },
  { key: "year", label: "Newest" },
];

function SearchSortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = SEARCH_SORT_OPTIONS.find((o) => o.key === value) ?? SEARCH_SORT_OPTIONS[0];

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
        className="flex h-8 min-w-36 items-center justify-between gap-3 rounded-full bg-white/5 px-3 text-xs font-semibold text-foreground ring-1 ring-white/10 transition hover:bg-white/10"
        aria-expanded={open}
      >
        <span className="truncate">{active.label}</span>
        <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div className={`absolute left-0 top-10 z-40 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.16_0.02_280)] p-1.5 text-white shadow-2xl transition duration-150 ${open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}>
        {SEARCH_SORT_OPTIONS.map((option) => (
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import type { Media } from "@/lib/catalog";

export const Route = createFileRoute("/ai-search")({
  head: () => ({
    meta: [
      { title: "AI Search — Sleepy" },
      { name: "description", content: "AI-powered movie and TV show search." },
    ],
  }),
  component: AiSearch,
});

type AiSource = "ai" | "fallback-no-ai" | "fallback-error";

type AiSearchResponse = {
  results: Media[];
  source: AiSource;
  aiError: string | null;
};

function AiSearch() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const aiSearchResults = useQuery({
    queryKey: ["ai-search", debounced],
    queryFn: async (): Promise<AiSearchResponse> => {
      const response = await fetch(`/api/ai-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: debounced }),
      });
      if (!response.ok) {
        throw new Error("AI search failed");
      }
      return response.json();
    },
    enabled: debounced.length > 0,
    retry: 1,
  });

  const rawResults = aiSearchResults.data?.results ?? [];
  const loading = aiSearchResults.isLoading;
  const source = aiSearchResults.data?.source;
  const aiError = aiSearchResults.data?.aiError;
  const queryError = aiSearchResults.error as Error | null;

  const results = useMemo(() => rawResults, [rawResults]);
  const aiUsed = source === "ai" && results.length > 0;
  const fellBack = !!source && source !== "ai";

  return (
    <div className="min-h-screen px-5 pb-32 pt-16 md:px-10 md:pt-20 animate-page-in">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7">
          <div className="text-xs uppercase tracking-[0.32em] text-primary/80">AI Search</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            Find something with AI
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Ask for genres, moods, actors, or themes — we'll turn your idea into a movie and TV
            shortlist.
          </p>
        </div>

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
              placeholder="Ask AI about movies, genres, actors..."
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
        </div>

        {/* AI source badge / fallback notice — sits above results */}
        {!loading && debounced && results.length > 0 && aiUsed && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary animate-fade-in">
            <Sparkles className="h-3 w-3" /> AI recommended picks for "{debounced}"
          </div>
        )}
        {!loading && debounced && results.length > 0 && fellBack && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 animate-fade-in dark:text-amber-300">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01" strokeLinecap="round"/></svg>
            AI unavailable — showing direct search results
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (<div key={i} className="aspect-[2/3] rounded-xl animate-shimmer" />))}
          </div>
        ) : queryError ? (
          <div className="mt-16 flex flex-col items-center text-center text-muted-foreground animate-fade-in">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-white/5 ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <p className="mt-4 text-sm">AI search failed. Try again in a moment.</p>
          </div>
        ) : results.length === 0 && debounced ? (
          <div className="mt-16 flex flex-col items-center text-center text-muted-foreground animate-fade-in">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-white/5 ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </div>
            <p className="mt-4 text-sm">
              No AI matches for <span className="font-semibold text-foreground">"{debounced}"</span>
            </p>
            {aiError && (
              <p className="mt-2 max-w-md text-[11px] text-muted-foreground/70">{aiError}</p>
            )}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7 overflow-visible sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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

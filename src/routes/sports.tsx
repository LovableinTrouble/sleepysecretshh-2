import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ArrowLeft, Search, Users } from "lucide-react";
import { fetchPpvAll, flattenEvents, isEventLive, type FlatEvent } from "@/lib/sports";
import { SportIcon } from "@/components/SportIcon";

export const Route = createFileRoute("/sports")({
  head: () => ({
    meta: [
      { title: "Live Sports — SLEEPY" },
      { name: "description", content: "Watch every live sports match — football, NBA, NFL, MLB, UFC and more, free." },
    ],
  }),
  component: SportsPage,
});

function SportsPage() {
  const [tab, setTab] = useState<"live" | "upcoming">("live");
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["ppv", "all"],
    queryFn: fetchPpvAll,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const all = useMemo(
    () => (data ? flattenEvents(data).filter((e) => e.category !== "24/7 Streams") : []),
    [data],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now() / 1000;
    return all
      .filter((e) => {
        const live = isEventLive(e, now);
        if (tab === "live" && !live) return false;
        if (tab === "upcoming" && (live || e.starts_at <= now)) return false;
        if (cat !== "all" && e.category !== cat) return false;
        if (q && !e.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.starts_at - b.starts_at);
  }, [all, cat, query, tab]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const e of all) s.add(e.category);
    return ["all", ...Array.from(s).sort()];
  }, [all]);

  const liveCount = useMemo(() => {
    const now = Date.now() / 1000;
    return all.filter((e) => isEventLive(e, now)).length;
  }, [all]);

  return (
    <div className="relative min-h-screen pb-32 pt-20 md:pb-12 md:pt-12 animate-page-in">
      <header className="mx-auto max-w-7xl px-6 md:px-10">
        <Link to="/iptv" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Live TV
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
            <Trophy className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-amber-300/80">Live · Free</div>
            <h1 className="text-3xl font-black md:text-5xl">Sports</h1>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-glass-border bg-card/40 p-2 backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="inline-flex shrink-0 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
              {(["live", "upcoming"] as const).map((t) => {
                const count = t === "live" ? liveCount : all.length - liveCount;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      tab === t ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white"
                    }`}
                  >
                    {t === "live" ? "Live now" : "Upcoming"}
                    <span className={`rounded px-1 text-[10px] ${tab === t ? "bg-black/20" : "bg-white/10"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search matches, teams…"
                className="w-full rounded-xl bg-background/40 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
            {categories.map((c) => {
              const active = cat === c;
              return (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition ${
                    active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {c !== "all" && <SportIcon category={c} className="h-3 w-3" />}
                  <span>{c === "all" ? "All" : c}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl px-6 md:px-10">
        {isLoading && !all.length && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-card/40" />
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/80">
            Couldn't load matches. Try again in a moment.
          </div>
        )}
        {!!visible.length && (
          <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((e) => <BigMatchCard key={e.id} e={e} />)}
          </div>
        )}
        {!isLoading && !!all.length && visible.length === 0 && (
          <div className="py-20 text-center text-sm text-muted-foreground">No matches match your filters.</div>
        )}
      </main>
    </div>
  );
}

function BigMatchCard({ e }: { e: FlatEvent }) {
  const live = isEventLive(e);
  const startsIn = (e.starts_at * 1000 - Date.now()) / 60000;
  const viewers = typeof e.viewers === "string" ? parseInt(e.viewers, 10) || 0 : e.viewers ?? 0;

  const inner = (
    <div className="group relative h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-card/40 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:border-primary/50">
      {e.poster ? (
        <img
          src={e.poster}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-60 transition group-hover:opacity-80"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: e.colors?.length
              ? `linear-gradient(135deg, ${e.colors[0]} 0%, #000 70%)`
              : "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(0,0,0,0.6))",
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30" />
      <div className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
        live ? "bg-red-500/90 text-white ring-red-300/40" : "bg-white/10 text-white/80 ring-white/15"
      }`}>
        {live ? (<><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE</>) : (<>SOON</>)}
      </div>
      {live && viewers > 50 && (
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/15 backdrop-blur">
          <Users className="h-3 w-3" /> {viewers.toLocaleString()}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/75">
          <SportIcon category={e.category} className="h-3 w-3" />
          <span>{e.category}</span>
          {!live && startsIn > 0 && (
            <span>· in {startsIn < 60 ? `${Math.round(startsIn)}m` : `${Math.round(startsIn / 60)}h`}</span>
          )}
          {e.tag && <span className="rounded bg-white/10 px-1 text-[9px]">{e.tag}</span>}
        </div>
        <div className="mt-1 line-clamp-2 text-sm font-bold leading-tight text-white">{e.name}</div>
      </div>
    </div>
  );

  return (
    <Link to="/sports/$id" params={{ id: String(e.id) }}>
      {inner}
    </Link>
  );
}

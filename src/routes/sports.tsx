import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ArrowLeft, Search, Users } from "lucide-react";
import {
  fetchLiveMatches,
  fetchTodayMatches,
  sportsImage,
  SPORT_ICONS,
  type SportsMatch,
} from "@/lib/sports";

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
  const [tab, setTab] = useState<"live" | "today">("live");
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const { data: live } = useQuery({
    queryKey: ["sports", "live"],
    queryFn: fetchLiveMatches,
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
  const { data: today } = useQuery({
    queryKey: ["sports", "today"],
    queryFn: fetchTodayMatches,
    staleTime: 5 * 60_000,
    enabled: tab === "today",
  });

  const all = (tab === "live" ? live : today) ?? [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((m) => {
      if (tab === "live" && (!m.sources || m.sources.length === 0)) return false;
      if (cat !== "all" && m.category !== cat) return false;
      if (q && !m.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, cat, query, tab]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const m of all) s.add(m.category);
    return ["all", ...Array.from(s).sort()];
  }, [all]);

  return (
    <div className="relative min-h-screen pb-32 pt-20 md:pb-12 md:pt-12 animate-page-in">
      <header className="px-6 md:px-10">
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

        <div className="mt-5 inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
          {(["live", "today"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
                tab === t ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white"
              }`}
            >
              {t === "live" ? "Live now" : "Today's schedule"}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-glass-border bg-card/40 p-2 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search matches, teams…"
              className="w-full rounded-xl bg-background/40 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
            {categories.map((c) => {
              const active = cat === c;
              return (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition ${
                    active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {c === "all" ? "All" : `${SPORT_ICONS[c] ?? "🏅"} ${c.replace(/-/g, " ")}`}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mt-6 px-6 md:px-10">
        {!all.length && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-card/40" />
            ))}
          </div>
        )}
        {!!visible.length && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((m) => <BigMatchCard key={m.id} m={m} />)}
          </div>
        )}
        {!!all.length && visible.length === 0 && (
          <div className="py-20 text-center text-sm text-muted-foreground">No matches match your filters.</div>
        )}
      </main>
    </div>
  );
}

function BigMatchCard({ m }: { m: SportsMatch }) {
  const src = m.sources[0];
  const icon = SPORT_ICONS[m.category] ?? "🏅";
  const poster = sportsImage(m.poster);
  const home = m.teams?.home?.name;
  const away = m.teams?.away?.name;
  const isLive = !!src;
  const startsIn = (m.date - Date.now()) / 60000;

  const inner = (
    <div className="group relative h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-card/40 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:border-primary/50">
      {poster ? (
        <img src={poster} alt="" loading="lazy" referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-60 transition group-hover:opacity-80" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-black/40 to-amber-500/10" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30" />
      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1
        ${isLive ? 'bg-red-500/90 text-white ring-red-300/40' : 'bg-white/10 text-white/80 ring-white/15'}"
        style={{}}
      >
        {isLive ? (
          <><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE</>
        ) : (
          <>SOON</>
        )}
      </div>
      {m.popular && (
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
          <Users className="h-3 w-3" /> Hot
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
          <span>{icon}</span>
          <span>{m.category.replace(/-/g, " ")}</span>
          {!isLive && startsIn > 0 && <span>· in {Math.round(startsIn)}m</span>}
        </div>
        <div className="mt-1 line-clamp-2 text-sm font-bold leading-tight text-white">
          {home && away ? `${home} vs ${away}` : m.title}
        </div>
      </div>
    </div>
  );

  if (!isLive) return <div className="opacity-70 cursor-not-allowed">{inner}</div>;
  return (
    <Link
      to="/sports/$source/$id"
      params={{ source: src.source, id: src.id }}
      search={{ title: m.title, category: m.category }}
    >
      {inner}
    </Link>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Tv2, RadioTower, Star, Trophy, ArrowRight } from "lucide-react";
import { CURATED_CHANNELS, CURATED_GROUPS } from "@/lib/iptv-curated";
import { fetchPpvAll, flattenEvents, isEventLive } from "@/lib/sports";

export const Route = createFileRoute("/iptv")({
  head: () => ({
    meta: [
      { title: "Live TV & Sports — SLEEPY" },
      { name: "description", content: "Watch live TV channels and real-time sports matches — free." },
      { property: "og:title", content: "Live TV & Sports — SLEEPY" },
      { property: "og:description", content: "Live news, sports games and entertainment — all free." },
    ],
  }),
  component: IptvPage,
});

function proxyLogo(url?: string): string | undefined {
  if (!url) return undefined;
  const clean = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=160&h=160&fit=contain&output=png&n=-1`;
}

function IptvPage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("All");
  const [favs, setFavs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("iptv:favs");
      if (raw) setFavs(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("iptv:favs", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const channels = CURATED_CHANNELS;

  const groups = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of channels) seen.set(c.group, (seen.get(c.group) ?? 0) + 1);
    const order = new Map(CURATED_GROUPS.map((g, i) => [g, i] as const));
    const entries = Array.from(seen.entries()).sort(
      (a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999),
    );
    const base = ["All", ...entries.map(([g]) => g)];
    return favs.size > 0 ? ["Favorites", ...base] : base;
  }, [channels, favs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = channels.filter((c) => {
      if (group === "Favorites") { if (!favs.has(c.id)) return false; }
      else if (group !== "All" && c.group !== group) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (group === "All" && favs.size > 0) {
      return [...list].sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));
    }
    return list;
  }, [channels, group, query, favs]);

  return (
    <div className="relative min-h-screen pb-32 pt-20 md:pb-12 md:pt-12 animate-page-in">
      <header className="px-6 md:px-10">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <RadioTower className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-primary/80">Live · Free</div>
            <h1 className="text-3xl font-black md:text-5xl">Live TV</h1>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="live-dot" aria-hidden="true" />
          <span><span className="font-semibold text-foreground">{channels.length}</span> channels + live sports right now.</span>
          {favs.size > 0 && <span className="text-foreground/70">· {favs.size} favorited</span>}
        </p>
      </header>

      {/* Live Sports section */}
      <LiveSportsRail />

      {/* Channels */}
      <section className="mt-10 px-6 md:px-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight md:text-2xl">Channels</h2>
            <p className="text-xs text-muted-foreground">Verified 24/7 broadcaster feeds.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-glass-border bg-card/40 p-2 backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search channels…"
                className="w-full rounded-xl bg-background/40 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
            {groups.map((g) => {
              const isActive = group === g;
              return (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((c) => {
            const isFav = favs.has(c.id);
            return (
              <div key={c.id} className="relative">
                <Link
                  to="/live/$id"
                  params={{ id: c.id }}
                  search={{ url: c.url, name: c.name, logo: c.logo, group: c.group }}
                  preload="intent"
                  className="group relative flex w-full aspect-[4/3] flex-col items-center justify-between gap-2 overflow-hidden rounded-2xl border border-glass-border bg-card/40 p-3 text-center transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card/70"
                >
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/10 backdrop-blur">
                    <span className="live-dot" style={{ width: 5, height: 5 }} aria-hidden="true" /> Live
                  </span>
                  <div className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-white/10 to-black/30 ring-1 ring-white/10">
                    <span className="absolute text-sm font-black tracking-wide text-white/55">
                      {c.name
                        .replace(/\b(the|hd|tv|channel|live|sd|fhd|uhd|\d+)\b/gi, "")
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase() || <Tv2 className="h-6 w-6 text-white/40" />}
                    </span>
                    {c.logo && (
                      <img
                        src={proxyLogo(c.logo)}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.dataset.fallback !== "1" && c.logo) {
                            img.dataset.fallback = "1";
                            img.src = c.logo;
                            return;
                          }
                          img.style.display = "none";
                        }}
                        className="relative h-full w-full object-contain"
                      />
                    )}
                  </div>
                  <span className="line-clamp-2 text-xs font-semibold text-foreground/90 group-hover:text-foreground">
                    {c.name}
                  </span>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(c.id); }}
                  aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                  className={`absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${
                    isFav
                      ? "bg-primary/90 text-primary-foreground ring-1 ring-primary/60"
                      : "bg-black/55 text-white/70 ring-1 ring-white/15 hover:bg-black/80 hover:text-white"
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
              No channels match your filters.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function LiveSportsRail() {
  const { data } = useQuery({
    queryKey: ["ppv", "all"],
    queryFn: fetchPpvAll,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const events = useMemo(() => {
    if (!data) return { live: 0, upcoming: 0 };
    const flat = flattenEvents(data);
    const now = Date.now() / 1000;
    let live = 0;
    let upcoming = 0;
    for (const e of flat) {
      if (isEventLive(e, now)) live++;
      else if (e.starts_at > now && e.starts_at - now < 24 * 3600) upcoming++;
    }
    return { live, upcoming };
  }, [data]);

  return (
    <section className="mt-8 px-6 md:px-10">
      <Link
        to="/sports"
        className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.08] via-card/40 to-card/40 p-4 ring-1 ring-white/5 transition hover:border-amber-500/40 hover:bg-amber-500/[0.06] md:p-5"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
          <Trophy className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black tracking-tight md:text-lg">Live Sports</h2>
            {events.live > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                {events.live} live
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {events.live > 0
              ? `${events.live} match${events.live === 1 ? "" : "es"} airing now`
              : "Football, NFL, UFC, MMA, NBA, F1 and more"}
            {events.upcoming > 0 && ` · ${events.upcoming} upcoming today`}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition group-hover:bg-white/15">
          View matches <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </Link>
    </section>
  );
}

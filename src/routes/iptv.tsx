import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Tv2, RadioTower, Star } from "lucide-react";
import { CURATED_CHANNELS, CURATED_GROUPS, type CuratedChannel } from "@/lib/iptv-curated";

export const Route = createFileRoute("/iptv")({
  head: () => ({
    meta: [
      { title: "Free IPTV — SLEEPY" },
      { name: "description", content: "Watch live TV — hand-picked mainstream news, sports, entertainment and kids channels streamed free." },
      { property: "og:title", content: "Free IPTV — SLEEPY" },
      { property: "og:description", content: "Live news, sports and entertainment — all free." },
    ],
  }),
  component: IptvPage,
});

// Route logos through images.weserv.nl — a free image proxy that re-encodes
// the source, sidesteps hotlink blocks and gives us a uniform thumbnail.
function proxyLogo(url?: string): string | undefined {
  if (!url) return undefined;
  const clean = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=160&h=160&fit=contain&output=png&n=-1`;
}

function IptvPage() {
  const navigate = useNavigate();
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

  const channels = useMemo<CuratedChannel[]>(() => CURATED_CHANNELS, []);

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
    // Pin favorites to top in "All" view
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
            <h1 className="text-3xl font-black md:text-5xl">IPTV</h1>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="live-dot" aria-hidden="true" />
          <span><span className="font-semibold text-foreground">{channels.length}</span> channels streaming live now.</span>
          {favs.size > 0 && <span className="text-foreground/70">· {favs.size} favorited</span>}
        </p>

        <div className="mt-6 rounded-2xl border border-glass-border bg-card/40 p-2 backdrop-blur">
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
      </header>

      <main className="mt-8 px-6 md:px-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((c) => {
            const isFav = favs.has(c.id);
            return (
            <div key={c.id} className="relative">
            <button
              onClick={() =>
                navigate({
                  to: "/live/$id",
                  params: { id: c.id },
                  search: { url: c.url, name: c.name, logo: c.logo, group: c.group },
                })
              }
              className="group relative flex w-full aspect-[4/3] flex-col items-center justify-between gap-2 overflow-hidden rounded-2xl border border-glass-border bg-card/40 p-3 text-center transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card/70"
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
            </button>
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
          );})}
          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
              No channels match your filters.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  ArrowLeft,
  Search,
  Users,
  RadioTower,
  Clock,
  CalendarDays,
  Bell,
  BellRing,
} from "lucide-react";
import { fetchPpvAll, flattenEvents, flattenUpcoming, type FlatEvent } from "@/lib/sports";
import { SportIcon } from "@/components/SportIcon";

export const Route = createFileRoute("/sports")({
  head: () => ({
    meta: [
      { title: "Live Sports — Sleepy" },
      { name: "description", content: "Watch live sports matches airing right now." },
    ],
  }),
  component: SportsRoute,
});

function SportsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPlayer = pathname.replace(/\/+$/, "") !== "/sports";

  return (
    <>
      {!isPlayer && <SportsPage />}
      <Outlet />
    </>
  );
}

function SportsPage() {
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"live" | "upcoming">("live");

  const { data, isLoading, error } = useQuery({
    queryKey: ["ppv", "all"],
    queryFn: fetchPpvAll,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const all = useMemo(() => (data ? flattenEvents(data) : []), [data]);
  const upcoming = useMemo(() => (data ? flattenUpcoming(data, 72) : []), [data]);

  const source = tab === "live" ? all : upcoming;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source
      .filter((e) => {
        if (cat !== "all" && e.category !== cat) return false;
        if (q && !`${e.name} ${e.category} ${e.tag || ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) =>
        tab === "live"
          ? Number(b.viewers || 0) - Number(a.viewers || 0) || a.starts_at - b.starts_at
          : a.starts_at - b.starts_at,
      );
  }, [source, cat, query, tab]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const e of source) s.add(e.category);
    return ["all", ...Array.from(s).sort()];
  }, [source]);

  return (
    <div className="relative min-h-screen pb-32 pt-20 md:pb-12 md:pt-12 animate-page-in">
      <header className="mx-auto max-w-7xl px-6 md:px-10">
        <Link
          to="/iptv"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white"
        >
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
            <div className="inline-flex shrink-0 rounded-xl bg-background/40 p-1 ring-1 ring-white/10">
              <button
                onClick={() => setTab("live")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
                  tab === "live" ? "bg-red-500/90 text-white" : "text-white/60 hover:text-white"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${tab === "live" ? "bg-white animate-pulse" : "bg-red-400"}`}
                />
                Live <span className="opacity-70">{all.length}</span>
              </button>
              <button
                onClick={() => setTab("upcoming")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
                  tab === "upcoming"
                    ? "bg-primary text-primary-foreground"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                Upcoming <span className="opacity-70">{upcoming.length}</span>
              </button>
            </div>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  tab === "live" ? "Search live matches, teams…" : "Search upcoming matches…"
                }
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
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
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
            Couldn't load live matches. Try again in a moment.
          </div>
        )}
        {!!visible.length && (
          <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((e) =>
              tab === "live" ? (
                <BigMatchCard key={e.id} e={e} />
              ) : (
                <UpcomingCard key={e.id} e={e} />
              ),
            )}
          </div>
        )}
        {!isLoading && !error && source.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-glass-border bg-card/30 px-6 py-16 text-center">
            <RadioTower className="h-9 w-9 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              {tab === "live"
                ? "No live sports streams right now."
                : "Nothing scheduled in the next 72 hours."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tab === "live"
                ? "Check the Upcoming tab for what's next."
                : "Check back soon — new events are added daily."}
            </p>
          </div>
        )}
        {!isLoading && !!source.length && visible.length === 0 && (
          <div className="py-20 text-center text-sm text-muted-foreground">
            No live matches match your filters.
          </div>
        )}
      </main>
    </div>
  );
}

function BigMatchCard({ e }: { e: FlatEvent }) {
  const viewers = typeof e.viewers === "string" ? parseInt(e.viewers, 10) || 0 : (e.viewers ?? 0);

  return (
    <Link to="/sports/$id" params={{ id: String(e.id) }} preload="intent" className="block">
      <div className="group relative h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-card/40 ring-1 ring-white/5 transition active:scale-[0.99] hover:-translate-y-0.5 hover:border-primary/50">
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
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ring-1 ring-red-300/40">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </div>
        {viewers > 0 && (
          <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/15 backdrop-blur">
            <Users className="h-3 w-3" /> {viewers.toLocaleString()}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/75">
            <SportIcon category={e.category} className="h-3 w-3" />
            <span>{e.category}</span>
            {e.tag && <span className="rounded bg-white/10 px-1 text-[9px]">{e.tag}</span>}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-bold leading-tight text-white">
            {e.name}
          </div>
        </div>
      </div>
    </Link>
  );
}

const REMIND_KEY = "sleepy:sports-reminders";

function readReminders(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(REMIND_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeReminders(v: Record<string, number>) {
  try {
    localStorage.setItem(REMIND_KEY, JSON.stringify(v));
  } catch {
    /* no-op */
  }
}

function formatStart(ts: number): { day: string; time: string; rel: string } {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const day = sameDay
    ? "Today"
    : isTomorrow
      ? "Tomorrow"
      : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const diffMin = Math.max(0, Math.round((ts * 1000 - Date.now()) / 60000));
  const rel =
    diffMin < 60
      ? `in ${diffMin}m`
      : diffMin < 1440
        ? `in ${Math.round(diffMin / 60)}h`
        : `in ${Math.round(diffMin / 1440)}d`;
  return { day, time, rel };
}

function UpcomingCard({ e }: { e: FlatEvent }) {
  const [reminders, setReminders] = useState<Record<string, number>>(() => readReminders());
  const key = String(e.id);
  const reminded = !!reminders[key];
  const { day, time, rel } = formatStart(e.starts_at);

  const toggle = () => {
    const next = { ...reminders };
    if (reminded) delete next[key];
    else next[key] = e.starts_at;
    writeReminders(next);
    setReminders(next);
  };

  return (
    <div className="group relative flex h-44 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/40 ring-1 ring-white/5 transition hover:border-primary/40">
      {e.poster ? (
        <img
          src={e.poster}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: e.colors?.length
              ? `linear-gradient(135deg, ${e.colors[0]} 0%, #000 70%)`
              : "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(0,0,0,0.6))",
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/30" />

      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ring-1 ring-white/15 backdrop-blur">
        <Clock className="h-3 w-3" /> {rel}
      </div>
      <button
        onClick={toggle}
        aria-label={reminded ? "Remove reminder" : "Set reminder"}
        className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full ring-1 backdrop-blur transition ${
          reminded
            ? "bg-primary text-primary-foreground ring-primary/40"
            : "bg-black/55 text-white/85 ring-white/15 hover:bg-white/15"
        }`}
      >
        {reminded ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </button>

      <div className="relative mt-auto p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/75">
          <SportIcon category={e.category} className="h-3 w-3" />
          <span>{e.category}</span>
          {e.tag && <span className="rounded bg-white/10 px-1 text-[9px]">{e.tag}</span>}
        </div>
        <div className="mt-1 line-clamp-2 text-sm font-bold leading-tight text-white">{e.name}</div>
        <div className="mt-1.5 text-[11px] font-semibold text-white/80">
          {day} · {time}
        </div>
      </div>
    </div>
  );
}

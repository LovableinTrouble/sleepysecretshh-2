import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, RefreshCw, Maximize2, Users, Trophy } from "lucide-react";
import { fetchStreams, type SportsStream } from "@/lib/sports";

export const Route = createFileRoute("/sports/$source/$id")({
  head: () => ({
    meta: [
      { title: "Live Match — SLEEPY" },
      { name: "description", content: "Watch this live sports match free." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    title: typeof s.title === "string" ? s.title : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    sources: typeof s.sources === "string" ? s.sources : undefined,
  }),
  component: SportsMatchPage,
});

function SportsMatchPage() {
  const { source, id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [pick, setPick] = useState<number>(0);
  const [reload, setReload] = useState(0);

  // The primary source may have no active streams. We also try any extra
  // sources passed via search so the player can fall back automatically.
  const allSources = useMemo(() => {
    const list: { source: string; id: string }[] = [{ source, id }];
    try {
      const extra = search.sources ? (JSON.parse(search.sources) as { source: string; id: string }[]) : [];
      for (const s of extra) {
        if (!list.find((x) => x.source === s.source && x.id === s.id)) list.push(s);
      }
    } catch {}
    return list;
  }, [source, id, search.sources]);

  const results = useQueries({
    queries: allSources.map((s) => ({
      queryKey: ["sports", "stream", s.source, s.id],
      queryFn: () => fetchStreams(s.source, s.id),
      staleTime: 60_000,
    })),
  });
  const isLoading = results.some((r) => r.isLoading);
  const error = results.every((r) => r.isError) ? results[0]?.error : undefined;
  const streams: SportsStream[] = results.flatMap((r) => r.data ?? []);
  const active = streams.length > 0 ? streams[Math.min(pick, streams.length - 1)] : undefined;

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else navigate({ to: "/sports" });
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/15">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <Trophy className="h-5 w-5 text-amber-300" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{search.title || "Live match"}</div>
            <div className="truncate text-[11px] uppercase tracking-[0.16em] text-white/45">
              {search.category?.replace(/-/g, " ") || "Sports"} · Live
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setReload((k) => k + 1)} aria-label="Reload" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/15">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const el = document.getElementById("sports-frame");
              if (!el) return;
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
              else el.requestFullscreen().catch(() => {});
            }}
            aria-label="Fullscreen"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/15"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div id="sports-frame" className="relative flex-1 bg-black">
        {isLoading && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/60">Finding streams…</p>
            </div>
          </div>
        )}

        {!isLoading && (error || !active) && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="max-w-md">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-3 text-sm text-white">
                No live streams available for this match right now.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button onClick={() => setReload((k) => k + 1)} className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
                  Try again
                </button>
                <Link to="/sports" className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15">
                  Browse matches
                </Link>
              </div>
            </div>
          </div>
        )}

        {active && (
          <iframe
            key={`${active.embedUrl}-${reload}`}
            src={active.embedUrl}
            title={search.title || "Live match"}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className="h-full w-full border-0"
          />
        )}
      </div>

      {streams && streams.length > 1 && (
        <div className="border-t border-white/10 bg-black/60 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/45">Streams</span>
            {streams.map((s, i) => (
              <StreamPill key={`${s.source}-${s.streamNo}`} s={s} active={i === pick} onClick={() => setPick(i)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StreamPill({ s, active, onClick }: { s: SportsStream; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
        active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span>#{s.streamNo}</span>
      {s.hd && <span className="rounded bg-white/15 px-1 text-[9px]">HD</span>}
      <span className="opacity-80">{s.language || s.source}</span>
      {typeof s.viewers === "number" && (
        <span className="inline-flex items-center gap-0.5 opacity-70"><Users className="h-3 w-3" />{s.viewers}</span>
      )}
    </button>
  );
}

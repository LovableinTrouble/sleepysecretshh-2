import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, RefreshCw, Maximize2, Users, ShieldAlert } from "lucide-react";
import {
  fetchPpvAll,
  findEvent,
  hasPlayableIframe,
  isEventLive,
  normalizeIframeSrc,
} from "@/lib/sports";
import { SportIcon } from "@/components/SportIcon";

export const Route = createFileRoute("/sports/$id")({
  head: () => ({
    meta: [
      { title: "Live Match — Sleepy" },
      { name: "description", content: "Watch this live sports match free." },
    ],
  }),
  component: SportsMatchPage,
});

function SportsMatchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [reload, setReload] = useState(0);
  const [pick, setPick] = useState(0);
  const [showPopupWarn, setShowPopupWarn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!sessionStorage.getItem("sleepy:popup-warn-dismissed")) setShowPopupWarn(true);
    } catch {
      setShowPopupWarn(true);
    }
  }, []);

  const dismissWarn = () => {
    setShowPopupWarn(false);
    try {
      sessionStorage.setItem("sleepy:popup-warn-dismissed", "1");
    } catch {
      /* no-op */
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["ppv", "all"],
    queryFn: fetchPpvAll,
    staleTime: 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const event = useMemo(() => (data ? findEvent(data, Number(id)) : undefined), [data, id]);
  const live = event ? isEventLive(event) : false;

  const streams = useMemo(() => {
    if (!event) return [];
    const subs = (event.substreams ?? [])
      .map((s, i) => ({
        key: `sub-${s.id ?? i}`,
        name: s.name || `Stream ${i + 2}`,
        iframe: normalizeIframeSrc(s.iframe),
      }))
      .filter((s) => /^https?:\/\//i.test(s.iframe));
    return [
      {
        key: "main",
        name: event.source_tag || event.tag || "Main",
        iframe: normalizeIframeSrc(event.iframe),
      },
      ...subs,
    ].filter((s) => /^https?:\/\//i.test(s.iframe));
  }, [event]);

  const active = streams[Math.min(pick, streams.length - 1)];
  const viewers = event
    ? typeof event.viewers === "string"
      ? parseInt(event.viewers, 10) || 0
      : (event.viewers ?? 0)
    : 0;

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else navigate({ to: "/sports" });
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/15"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex min-w-0 items-center gap-3">
          {event && <SportIcon category={event.category} className="h-5 w-5 text-amber-300" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{event?.name || "Live match"}</div>
            <div className="flex items-center gap-2 truncate text-[11px] uppercase tracking-[0.16em] text-white/45">
              <span>{event?.category || "Sports"}</span>
              {live && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-1.5 py-0 text-[9px] font-bold tracking-wider text-white">
                  <span className="h-1 w-1 rounded-full bg-white animate-pulse" /> LIVE
                </span>
              )}
              {viewers > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Users className="h-3 w-3" />
                  {viewers.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReload((k) => k + 1)}
            aria-label="Reload"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/15"
          >
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
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/60">
                Loading stream…
              </p>
            </div>
          </div>
        )}

        {!isLoading && (!active || (event && !hasPlayableIframe(event))) && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="max-w-md">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-3 text-sm text-white">This match isn't available right now.</p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  onClick={() => setReload((k) => k + 1)}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Try again
                </button>
                <Link
                  to="/sports"
                  className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Browse matches
                </Link>
              </div>
            </div>
          </div>
        )}

        {active && (
          <iframe
            key={`${active.iframe}-${reload}`}
            src={active.iframe}
            title={event?.name || "Live match"}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="eager"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full border-0 bg-black"
          />
        )}
      </div>

      {streams.length > 1 && (
        <div className="border-t border-white/10 bg-black/60 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/45">
              Streams
            </span>
            {streams.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setPick(i)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                  i === pick
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showPopupWarn && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 px-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center px-6 pb-2 pt-7 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-white">Before you watch</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/65">
                Live sports are served from third-party embeds. Ads and pop-ups may appear on first
                interaction — this is normal and outside our control.
              </p>
            </div>
            <div className="mx-6 mt-4 space-y-2 rounded-2xl bg-white/[0.04] p-3 text-[12px] text-white/70 ring-1 ring-white/5">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>An ad-blocker (e.g. uBlock Origin) will significantly improve your experience.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>New tabs or redirects? Just close them — the stream stays here.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>Do not enter credentials or install anything a pop-up requests.</span>
              </div>
            </div>
            <div className="flex gap-2 p-5">
              <Link
                to="/sports"
                className="flex-1 rounded-xl bg-white/8 px-4 py-2.5 text-center text-xs font-semibold text-white/85 transition hover:bg-white/12"
              >
                Go back
              </Link>
              <button
                onClick={dismissWarn}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

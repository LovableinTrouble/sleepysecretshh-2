/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Check, X, Loader2, Radar } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";
import { resolveProvider, type DirectSource, type ProviderId, type StreamQuality, type StreamSubtitle } from "@/lib/streams";
import { PROVIDER_LIST } from "@/lib/provider-list";
import { useSettings } from "@/lib/store";
import { CustomPlayer } from "./CustomPlayer";
import { DownloadsDialog } from "./DownloadsDialog";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  const navigate = useNavigate();
  const [settings] = useSettings();
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position, bodyTop: body.style.top, bodyWidth: body.style.width,
    };
    html.style.overflow = "hidden"; body.style.overflow = "hidden";
    body.style.position = "fixed"; body.style.top = `-${scrollY}px`; body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow; body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition; body.style.top = prev.bodyTop; body.style.width = prev.bodyWidth;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  type ProviderStatus = "pending" | "checking" | "ready" | "failed";
  const [statuses, setStatuses] = useState<Record<ProviderId, { state: ProviderStatus; count: number }>>(
    () => Object.fromEntries(PROVIDER_LIST.map((p) => [p.id, { state: "pending", count: 0 }])) as any
  );
  const [qualities, setQualities] = useState<StreamQuality[]>([]);
  const [subtitles, setSubtitles] = useState<StreamSubtitle[]>([]);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);

  const input = useMemo(() => ({
    tmdbId: String(media.id), title: media.title,
    type: (media.type === "movie" ? "movie" : "show") as "movie" | "show",
    season, episode,
  }), [media.id, media.title, media.type, season, episode]);

  useEffect(() => {
    let dead = false;
    setStatuses(Object.fromEntries(PROVIDER_LIST.map((p) => [p.id, { state: "pending", count: 0 }])) as any);
    setQualities([]); setSubtitles([]); setScanning(true); setError(null); setActiveProvider(null);

    (async () => {
      for (const p of PROVIDER_LIST) {
        if (dead) return;
        setStatuses((s) => ({ ...s, [p.id]: { ...s[p.id], state: "checking" } }));
        try {
          const res = await resolveProvider({ data: { provider: p.id, ...input, fast: true } });
          if (dead) return;
          if (res.qualities.length > 0) {
            setStatuses((s) => ({ ...s, [p.id]: { state: "ready", count: res.qualities.length } }));
            setActiveProvider(p.id);
            setQualities(res.qualities);
            if (res.subtitles.length) setSubtitles(res.subtitles);
            setScanning(false);
            // Background: fetch full qualities for the winning provider only.
            resolveProvider({ data: { provider: p.id, ...input } }).then((full) => {
              if (dead || !full.qualities.length) return;
              setQualities(full.qualities);
              if (full.subtitles.length) setSubtitles((prev) => (prev.length ? prev : full.subtitles));
              setStatuses((s) => ({ ...s, [p.id]: { state: "ready", count: full.qualities.length } }));
            }).catch(() => {});
            return;
          }
          setStatuses((s) => ({ ...s, [p.id]: { state: "failed", count: 0 } }));
        } catch {
          if (!dead) setStatuses((s) => ({ ...s, [p.id]: { state: "failed", count: 0 } }));
        }
      }
      if (!dead) { setScanning(false); setError("No working streams found across providers. Try again in a moment."); }
    })();

    return () => { dead = true; };
  }, [input, scanKey]);

  const switchProvider = useCallback(async (id: ProviderId) => {
    if (id === activeProvider) return;
    const prevQualities = qualities;
    const prevActive = activeProvider;
    setActiveProvider(id);
    setStatuses((s) => ({ ...s, [id]: { ...s[id], state: "checking" } }));
    try {
      const res = await resolveProvider({ data: { provider: id, ...input, fast: true } });
      if (res.qualities.length === 0) {
        setStatuses((s) => ({ ...s, [id]: { state: "failed", count: 0 } }));
        setActiveProvider(prevActive);
        return;
      }
      setQualities(res.qualities);
      if (res.subtitles.length) setSubtitles((prev) => (prev.length ? prev : res.subtitles));
      setStatuses((s) => ({ ...s, [id]: { state: "ready", count: res.qualities.length } }));
      resolveProvider({ data: { provider: id, ...input } }).then((full) => {
        if (!full.qualities.length) return;
        setQualities(full.qualities);
        if (full.subtitles.length) setSubtitles((prev) => (prev.length ? prev : full.subtitles));
        setStatuses((s) => ({ ...s, [id]: { state: "ready", count: full.qualities.length } }));
      }).catch(() => {});
    } catch {
      setStatuses((s) => ({ ...s, [id]: { state: "failed", count: 0 } }));
      setActiveProvider(prevActive);
      setQualities(prevQualities);
    }
  }, [activeProvider, input, qualities]);

  const active: DirectSource | null = useMemo(() => {
    if (qualities.length === 0) return null;
    return { kind: "direct", id: "merged", name: "Sleepy", badge: "HLS", qualities, subtitles };
  }, [qualities, subtitles]);

  const servers = useMemo(() => PROVIDER_LIST.map((p) => ({
    id: p.id, name: p.name,
    status: statuses[p.id]?.state ?? "pending",
    count: statuses[p.id]?.count ?? 0,
  })), [statuses]);

  const readyCount = Object.values(statuses).filter((s) => s.state === "ready").length;
  const settledCount = Object.values(statuses).filter((s) => s.state === "ready" || s.state === "failed").length;

  const savedProgress = useMemo(() => getLocalProgressFor(media.id, season ?? null, episode ?? null), [media.id, season, episode]);
  const startAt = savedProgress && savedProgress.positionSeconds > 10 ? savedProgress.positionSeconds : 0;

  const handleNextEpisode = useCallback(() => {
    if (!season || !episode) return;
    const nextEp = episode + 1;
    const seasons = media.seasons;
    if (seasons) {
      const currentSeason = seasons.find((s) => s.number === season);
      if (currentSeason && nextEp > currentSeason.episodes.length) {
        const nextSeason = seasons.find((s) => s.number === season + 1);
        if (nextSeason) { navigate({ to: "/watch/$id", params: { id: String(media.id) }, search: { t: media.type as any, s: season + 1, e: 1, party: undefined }, replace: true }); return; }
        return;
      }
    }
    navigate({ to: "/watch/$id", params: { id: String(media.id) }, search: { t: media.type as any, s: season, e: nextEp, party: undefined }, replace: true });
  }, [navigate, media.id, media.type, media.seasons, season, episode]);

  const hasNext = !!(season && episode);
  const onProgress = useCallback((t: number, d: number, ended: boolean) => {
    recordProgress(media, season, episode, t, d, ended, "sleepy");
  }, [media, season, episode]);

  const player = (
    <div className="fixed inset-0 z-[2147483000] flex flex-col bg-black" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, height: "100dvh", width: "100vw" }}>
      <div className="relative flex-1 bg-black overflow-hidden">
        {scanning && !active && !error && (
          <ScanOverlay title={media.title} statuses={statuses} readyCount={readyCount} settledCount={settledCount} total={PROVIDER_LIST.length} onClose={onClose} />
        )}
        {error && !active && <ErrorOverlay error={error} onClose={onClose} onRetry={() => { setError(null); setQualities([]); setScanKey((key) => key + 1); }} />}
        {active && (
          <CustomPlayer source={active} title={media.title} season={season} episode={episode}
            startAt={startAt} onProgress={onProgress} onClose={onClose}
            onSelectSource={() => {}}
            onDownload={() => setDownloadsOpen(true)}
            servers={servers}
            activeServer={activeProvider ?? undefined}
            onSwitchServer={switchProvider}
            onNextEpisode={hasNext ? handleNextEpisode : undefined} hasNext={hasNext} autoplay={settings.player.autoplay} autoNext={settings.player.autoNext} />
        )}
      </div>
      <DownloadsDialog open={downloadsOpen} media={media} season={season} episode={episode} onClose={() => setDownloadsOpen(false)} />
    </div>
  );
  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

function recordProgress(media: Media, season: number | undefined, episode: number | undefined, currentTime: number, duration: number, completed: boolean, sourceId: string) {
  if (!Number.isFinite(currentTime)) return;
  const dur = Number.isFinite(duration) ? duration : 0;
  if (dur <= 0 && !completed) { const saved = getLocalProgressFor(media.id, season ?? null, episode ?? null); if (!saved?.durationSeconds) return; }
  saveProgressLocal({
    mediaId: media.id, mediaType: media.type, season: season ?? null, episode: episode ?? null,
    positionSeconds: Math.max(0, Math.floor(currentTime)), durationSeconds: Math.max(0, Math.floor(dur)),
    title: media.title, poster: media.poster ?? null, backdrop: media.backdrop ?? null, completed, updatedAt: Date.now(), source: sourceId,
  });
  void syncProgressUp({
    mediaId: media.id, mediaType: media.type, season: season ?? null, episode: episode ?? null,
    positionSeconds: Math.max(0, Math.floor(currentTime)), durationSeconds: Math.max(0, Math.floor(dur)),
    title: media.title, poster: media.poster ?? null, backdrop: media.backdrop ?? null, completed, updatedAt: Date.now(), source: sourceId,
  });
}

function ScanOverlay({
  title, statuses, readyCount, settledCount, total, onClose,
}: {
  title: string;
  statuses: Record<ProviderId, { state: "pending" | "checking" | "ready" | "failed"; count: number }>;
  readyCount: number; settledCount: number; total: number; onClose: () => void;
}) {
  const pct = Math.round((settledCount / total) * 100);
  const active = PROVIDER_LIST.find((p) => statuses[p.id]?.state === "checking")?.name;
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-black px-6 overflow-hidden">
      {/* Ambient gradient wash */}
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 50% 40%, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 55%)" }} />

      {/* Radar */}
      <div className="relative h-28 w-28">
        <div className="absolute inset-0 rounded-full border border-white/10" />
        <div className="absolute inset-3 rounded-full border border-white/8" />
        <div className="absolute inset-6 rounded-full border border-white/6" />
        <div className="absolute inset-0 animate-ping rounded-full border border-white/20" style={{ animationDuration: "2.4s" }} />
        {/* Sweeping conic gradient */}
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            animationDuration: "2.2s",
            background: "conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.35) 90deg, rgba(255,255,255,0) 180deg)",
            mask: "radial-gradient(circle, transparent 22%, black 23%, black 100%)",
            WebkitMask: "radial-gradient(circle, transparent 22%, black 23%, black 100%)",
          }}
        />
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-md">
            <Radar className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>

      <div className="relative text-center">
        <p className="text-base font-bold tracking-tight text-white">{title}</p>
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40">
          {active ? `Scanning · ${active}` : `${settledCount}/${total} Servers`}
        </p>
      </div>

      {/* Provider list */}
      <div className="relative w-full max-w-sm space-y-1.5">
        {PROVIDER_LIST.map((p, i) => {
          const s = statuses[p.id];
          const isChecking = s.state === "checking";
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 transition-all duration-500 ease-out ${
                s.state === "ready" ? "border-emerald-400/25 bg-emerald-400/[0.06] text-white"
                : s.state === "failed" ? "border-white/5 bg-white/[0.02] opacity-40"
                : isChecking ? "border-white/15 bg-white/[0.06]"
                : "border-white/5 bg-white/[0.02]"
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-3">
                <StatusDot state={s.state} />
                <span className="text-[13px] font-semibold tracking-tight text-white/90">{p.name}</span>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/40">
                {s.state === "ready" && "Ready"}
                {isChecking && "Scanning"}
                {s.state === "pending" && "Queued"}
                {s.state === "failed" && "Miss"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="relative h-1 w-full max-w-sm overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-gradient-to-r from-white/60 via-white to-white/60 transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <button onClick={onClose} className="relative text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40 transition hover:text-white/80">Cancel</button>
    </div>
  );
}

function StatusDot({ state }: { state: "pending" | "checking" | "ready" | "failed" }) {
  if (state === "ready") return <div className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20 text-emerald-300"><Check className="h-3 w-3" /></div>;
  if (state === "failed") return <div className="grid h-5 w-5 place-items-center rounded-full bg-white/5 text-white/30"><X className="h-3 w-3" /></div>;
  if (state === "checking") return <div className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-white"><Loader2 className="h-3 w-3 animate-spin" /></div>;
  return <div className="h-5 w-5 rounded-full border border-white/10" />;
}

function ErrorOverlay({ error, onClose, onRetry }: { error: string; onClose: () => void; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/95 backdrop-blur-md">
      <div className="max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm text-white/70">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={onRetry} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"><RefreshCw className="h-3 w-3" /> Retry</button>
          <button onClick={onClose} className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white">Close</button>
        </div>
      </div>
    </div>
  );
}


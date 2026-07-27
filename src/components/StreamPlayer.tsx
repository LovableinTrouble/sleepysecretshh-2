/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Check, X, Loader2 } from "lucide-react";
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

  const mergeQualities = useCallback((incoming: StreamQuality[]) => {
    setQualities((current) => {
      const next = [...current];
      const seen = new Set(next.map((item) => `${item.sourceId ?? item.label}:${item.quality.toLowerCase()}:${item.url}`));
      for (const item of incoming) {
        const key = `${item.sourceId ?? item.label}:${item.quality.toLowerCase()}:${item.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(item);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let dead = false;
    setStatuses(Object.fromEntries(PROVIDER_LIST.map((p) => [p.id, { state: "pending", count: 0 }])) as any);
    setQualities([]); setSubtitles([]); setScanning(true); setError(null);

    const input = { tmdbId: String(media.id), title: media.title, type: media.type === "movie" ? "movie" as const : "show" as const, season, episode };

    const promises = PROVIDER_LIST.map((p) => {
      if (dead) return Promise.resolve();
      setStatuses((s) => ({ ...s, [p.id]: { ...s[p.id], state: "checking" } }));
      const updateFromResult = (res: { qualities: StreamQuality[]; subtitles: StreamSubtitle[] }) => {
        if (dead) return;
        const count = res.qualities.length;
        if (count > 0) {
          setStatuses((s) => ({ ...s, [p.id]: { state: "ready", count: Math.max(s[p.id]?.count ?? 0, count) } }));
          mergeQualities(res.qualities);
          if (res.subtitles.length) setSubtitles((prev) => (prev.length ? prev : res.subtitles));
        }
      };

      const fastPass = resolveProvider({ data: { provider: p.id, ...input, fast: true } })
        .then(updateFromResult)
        .catch(() => undefined);

      return fastPass
        .then(() => resolveProvider({ data: { provider: p.id, ...input } }))
        .then((res) => {
          if (dead) return;
          const count = res.qualities.length;
          setStatuses((s) => {
            const previous = s[p.id];
            if (count === 0 && previous?.state === "ready") return s;
            return { ...s, [p.id]: { state: count > 0 ? "ready" : "failed", count: count || previous?.count || 0 } };
          });
          updateFromResult(res);
        })
        .catch(() => { if (!dead) setStatuses((s) => ({ ...s, [p.id]: { state: "failed", count: 0 } })); });
    });

    Promise.all(promises).then(() => {
      if (dead) return;
      setScanning(false);
      setQualities((q) => {
        if (q.length === 0) setError("No working streams found across providers. Try again in a moment.");
        return q;
      });
    });

    return () => { dead = true; };
  }, [media.id, media.title, media.type, season, episode, scanKey, mergeQualities]);

  const active: DirectSource | null = useMemo(() => {
    if (qualities.length === 0) return null;
    return { kind: "direct", id: "merged", name: "Sleepy", badge: "HLS", qualities, subtitles };
  }, [qualities, subtitles]);

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
        if (nextSeason) { navigate({ to: "/watch/$id", params: { id: String(media.id) }, search: { t: media.type as any, s: season + 1, e: 1 }, replace: true }); return; }
        return;
      }
    }
    navigate({ to: "/watch/$id", params: { id: String(media.id) }, search: { t: media.type as any, s: season, e: nextEp }, replace: true });
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
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black px-6">
      {/* Pulse mark */}
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-ping rounded-full bg-white/10" style={{ animationDuration: "1.8s" }} />
        <div className="absolute inset-2 rounded-full bg-white/5 ring-1 ring-white/15" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.7)]" />
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-white/40">
          Fast source scan · {readyCount}/{total}
        </p>
      </div>

      {/* Provider list */}
      <div className="w-full max-w-xs space-y-1">
        {PROVIDER_LIST.map((p) => {
          const s = statuses[p.id];
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl px-3 py-2 transition-all duration-500 ease-out ${
                s.state === "ready" ? "bg-white/10 text-white"
                : s.state === "failed" ? "bg-white/[0.02] opacity-40"
                : s.state === "checking" ? "bg-white/[0.06]"
                : "bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <StatusDot state={s.state} />
                <span className="text-[12px] font-medium text-white/85">{p.name}</span>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-white/35">
                {s.state === "ready" && `${s.count} q`}
                {s.state === "checking" && "Scan"}
                {s.state === "pending" && ""}
                {s.state === "failed" && "Miss"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-[2px] w-full max-w-xs overflow-hidden rounded-full bg-white/8">
        <div className="h-full bg-white transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <button onClick={onClose} className="text-[11px] uppercase tracking-[0.3em] text-white/40 transition hover:text-white/70">Cancel</button>
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


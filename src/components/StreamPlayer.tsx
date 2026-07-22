/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";
import { resolveStreams, type ResolvedSource } from "@/lib/streams";
import { CustomPlayer } from "./CustomPlayer";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  const navigate = useNavigate();

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

  const [sources, setSources] = useState<ResolvedSource[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState("Scanning sources…");

  const msgTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (sources || error) return;
    const msgs = ["Scanning sources…", "Connecting to streams…", "Finding best quality…", "Almost there…"];
    let idx = 0;
    msgTimerRef.current = window.setInterval(() => { idx = (idx + 1) % msgs.length; setLoadMsg(msgs[idx]); }, 2200);
    return () => { if (msgTimerRef.current) clearInterval(msgTimerRef.current); };
  }, [sources, error]);

  useEffect(() => {
    let dead = false;
    setSources(null); setError(null); setLoadMsg("Scanning sources…");
    resolveStreams({
      data: { tmdbId: String(media.id), title: media.title, type: media.type === "movie" ? "movie" : "show", season, episode },
    })
      .then((res) => {
        if (dead) return;
        setSources(res.sources);
        setActiveId(res.primary ?? res.sources[0]?.id ?? null);
      })
      .catch((e) => { if (!dead) setError(e?.message || "Failed to resolve sources"); });
    return () => { dead = true; };
  }, [media.id, media.title, media.type, season, episode]);

  const active = useMemo(() => sources?.find((s) => s.id === activeId), [sources, activeId]);

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
    recordProgress(media, season, episode, t, d, ended, active?.id ?? "unknown");
  }, [media, season, episode, active?.id]);

  const player = (
    <div className="fixed inset-0 z-[2147483000] flex flex-col bg-black" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, height: "100dvh", width: "100vw" }}>
      <div className="relative flex-1 bg-black overflow-hidden">
        {!sources && !error && <LoadingOverlay message={loadMsg} onClose={onClose} title={media.title} />}
        {error && <ErrorOverlay error={error} onClose={onClose} onRetry={() => { setError(null); setSources(null); }} />}
        {active?.kind === "direct" && (
          <CustomPlayer source={active} title={media.title} season={season} episode={episode}
            startAt={startAt} onProgress={onProgress} onClose={onClose}
            onSelectSource={() => {}}
            onNextEpisode={hasNext ? handleNextEpisode : undefined} hasNext={hasNext} autoplay autoNext />
        )}
        {active?.kind === "embed" && <EmbedFrame source={active} media={media} onProgress={onProgress} onClose={onClose} />}
      </div>
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

function LoadingOverlay({ message, onClose, title }: { message: string; onClose: () => void; title: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white/40 animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
        </div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40 transition-all duration-500">{message}</p>
      </div>
      <button onClick={onClose} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs text-white/50 transition hover:border-white/30 hover:text-white/80">Cancel</button>
    </div>
  );
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

function EmbedFrame({ source, media, onProgress, onClose }: { source: Extract<ResolvedSource, { kind: "embed" }>; media: Media; onProgress: (t: number, d: number, ended: boolean) => void; onClose: () => void; }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Progress messages (Viduki/VidGod post MEDIA_DATA style payloads).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "MEDIA_DATA" && payload.data) {
        try {
          const store = payload.data as Record<string, any>;
          const entry = Object.values(store)[0] as any;
          if (!entry) return;
          if (entry.type === "tv" && entry.show_progress) {
            const key = `s${entry.last_season_watched}e${entry.last_episode_watched}`;
            const ep = entry.show_progress[key];
            if (ep?.progress) {
              const w = Number(ep.progress.watched) || 0;
              const d = Number(ep.progress.duration) || 0;
              if (d > 0) onProgress(w, d, false);
            }
          } else if (entry.progress) {
            const w = Number(entry.progress.watched) || 0;
            const d = Number(entry.progress.duration) || 0;
            if (d > 0) onProgress(w, d, false);
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onProgress]);

  return (
    <div className="relative h-full w-full bg-black">
      <iframe
        ref={iframeRef}
        id="target-iframe"
        src={source.url}
        title={media.title}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
      <button
        onClick={onClose}
        aria-label="Back"
        className="fixed left-4 top-4 z-40 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-2 text-sm text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/90"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
    </div>
  );
}


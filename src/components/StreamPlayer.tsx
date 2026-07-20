/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";
import { resolveStreams, type ResolvedSource } from "@/lib/streams";

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
    recordProgress(media, season, episode, t, d, ended, active?.id ?? "videasy");
  }, [media, season, episode, active?.id]);

  const player = (
    <div className="fixed inset-0 z-[2147483000] flex flex-col bg-black" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, height: "100dvh", width: "100vw" }}>
      <div className="relative flex-1 bg-black overflow-hidden">
        {!sources && !error && <LoadingOverlay message={loadMsg} onClose={onClose} title={media.title} />}
        {error && <ErrorOverlay error={error} onClose={onClose} onRetry={() => { setError(null); setSources(null); }} />}
        {active?.kind === "embed" && (
          <EmbedFrame
            source={active}
            media={media}
            onClose={onClose}
            onProgress={onProgress}
            onNextEpisode={hasNext ? handleNextEpisode : undefined}
          />
        )}
      </div>
    </div>
  );
  // Silence unused var warning from previous multi-source picker.
  void startAt;
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

function EmbedFrame({ source, media, onClose, onProgress, onNextEpisode }: { source: Extract<ResolvedSource, { kind: "embed" }>; media: Media; onClose: () => void; onProgress: (t: number, d: number, ended: boolean) => void; onNextEpisode?: () => void; }) {
  useEffect(() => {
    const BLOCKED = [
      "sentrygabiescloes.qpon",
      "devilyquondam.cyou",
      "jivingafrithm.cyou",
      "guarriancha.qpon",
    ];
    const isAd = (u: string) => {
      try {
        return BLOCKED.some((d) => {
          const host = new URL(u, location.href).hostname;
          return host === d || host.endsWith("." + d);
        });
      } catch {
        return false;
      }
    };

    // Kill popups the embed fires via top.open() / parent.open().
    const origOpen = window.open;
    window.open = function (url?: string | URL, target?: string, features?: string) {
      if (url && isAd(String(url))) return null;
      return origOpen.call(window, url as string, target, features);
    } as typeof window.open;

    // Block clicks that navigate to ad domains.
    const onClickCapture = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const a = t?.closest?.("a");
      if (a && a.href && isAd(a.href)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);

    // Strip ad elements injected into our DOM.
    const stripAds = () => {
      document
        .querySelectorAll("iframe[src],script[src],img[src]")
        .forEach((el) => {
          const src = el.getAttribute("src");
          if (src && isAd(src)) el.remove();
        });
    };
    const stripInterval = setInterval(stripAds, 1000);

    return () => {
      window.open = origOpen;
      document.removeEventListener("click", onClickCapture, true);
      clearInterval(stripInterval);
    };
  }, []);

  // Videasy postMessage → progress + ended events.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      try {
        const origin = ev.origin || "";
        if (!/videasy\.net$/.test(new URL(origin).hostname)) return;
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (!data || typeof data !== "object") return;
        const type = (data.type || data.event || "").toString();
        const t = Number(data.currentTime ?? data.time ?? data.progress ?? 0);
        const d = Number(data.duration ?? 0);
        if (type.includes("ended")) onProgress(t || d, d, true);
        else if (type.includes("time") || type.includes("progress")) onProgress(t, d, false);
        else if (type.includes("next") && onNextEpisode) onNextEpisode();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onProgress, onNextEpisode]);

  return (
    <div className="relative h-full w-full bg-black">
      <iframe src={source.url} title={media.title} className="h-full w-full border-0" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <button onClick={onClose} className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-black/80 transition" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

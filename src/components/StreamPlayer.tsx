/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X, RefreshCw } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";
import { resolveStreams, type ResolvedSource, type DirectSource } from "@/lib/streams";
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
            onSelectSource={() => setPickerOpen(true)}
            onNextEpisode={hasNext ? handleNextEpisode : undefined} hasNext={hasNext} autoplay autoNext />
        )}
        {active?.kind === "embed" && <EmbedFrame source={active} media={media} onClose={onClose} onSelectSource={() => setPickerOpen(true)} />}
        {pickerOpen && sources && <SourcePicker sources={sources} active={activeId} onPick={(id) => { setActiveId(id); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} />}
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

function EmbedFrame({ source, media, onClose, onSelectSource }: { source: Extract<ResolvedSource, { kind: "embed" }>; media: Media; onClose: () => void; onSelectSource: () => void; }) {
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

  return (
    <div className="relative h-full w-full bg-black">
      <iframe src={source.url} title={media.title} className="h-full w-full border-0" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <button onClick={onClose} className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-black/80 transition" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={onSelectSource} className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-black/80 transition"><span className="h-1.5 w-1.5 rounded-full bg-white" />{source.name}<span className="text-white/40">·</span>{source.badge}</button>
      </div>
    </div>
  );
}

function SourcePicker({ sources, active, onPick, onClose }: { sources: ResolvedSource[]; active: string | null; onPick: (id: string) => void; onClose: () => void; }) {
  const direct = sources.filter((s) => s.kind === "direct");
  const embeds = sources.filter((s) => s.kind === "embed");
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 backdrop-blur-md" onClick={onClose}>
      <div className="w-[min(92vw,500px)] rounded-2xl border border-white/10 bg-black/95 p-4 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div><p className="text-sm font-bold text-white">Select source</p><p className="text-[10px] text-white/40">{sources.length} sources available</p></div>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto">
          {direct.length > 0 && (
            <div>
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-white/50">Direct HLS</p>
              <ul className="space-y-1">
                {direct.map((s) => { const ds = s as DirectSource; const topQ = ds.qualities[0]; return (
                  <li key={s.id}><SourceButton source={s} active={active === s.id} onPick={onPick}>{topQ && <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">{topQ.label} · {topQ.format.toUpperCase()}</span>}</SourceButton></li>
                ); })}
              </ul>
            </div>
          )}
          {embeds.length > 0 && (
            <div>
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-white/30">Embed Sources</p>
              <ul className="space-y-1">{embeds.map((s) => (<li key={s.id}><SourceButton source={s} active={active === s.id} onPick={onPick} /></li>))}</ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceButton({ source, active, onPick, children }: { source: ResolvedSource; active: boolean; onPick: (id: string) => void; children?: React.ReactNode; }) {
  return (
    <button onClick={() => onPick(source.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-white/40 bg-white/10" : "border-white/8 bg-white/4 hover:bg-white/8"}`}>
      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${active ? "bg-white" : "bg-white/20"}`} />
      <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white">{source.name}</p><p className="text-[10px] uppercase tracking-widest text-white/40">{source.kind === "direct" ? "Direct HLS" : "Embed"} · {source.badge}</p></div>
      {children}
    </button>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Loader2, X } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { getSettings } from "@/lib/store";
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, [onClose]);

  const settings = getSettings();
  const febbox = settings.integrations.febboxToken?.trim() || undefined;

  const [sources, setSources] = useState<ResolvedSource[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let dead = false;
    setSources(null);
    setError(null);
    resolveStreams({
      data: {
        tmdbId: String(media.id),
        title: media.title,
        type: media.type === "movie" ? "movie" : "show",
        season,
        episode,
        febboxCookie: febbox,
      },
    })
      .then((res) => {
        if (dead) return;
        setSources(res.sources);
        setActiveId(res.primary ?? res.sources[0]?.id ?? null);
      })
      .catch((e) => !dead && setError(e?.message || "Failed to resolve sources"));
    return () => { dead = true; };
  }, [media.id, media.title, media.type, season, episode, febbox]);

  const active: ResolvedSource | undefined = useMemo(
    () => sources?.find((s) => s.id === activeId),
    [sources, activeId],
  );

  const player = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black animate-fade-in"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: "100dvh",
        width: "100vw",
        zIndex: 2147483000,
      }}
    >
      <div className="relative flex-1 bg-black">
        {!sources && !error && (
          <div className="grid h-full w-full place-items-center text-white/70">
            <div className="text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <p className="mt-3 text-xs uppercase tracking-widest text-white/40">Scanning sources…</p>
            </div>
          </div>
        )}
        {error && (
          <div className="grid h-full w-full place-items-center text-white/70">
            <div className="text-center">
              <p className="text-sm">{error}</p>
              <button onClick={onClose} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Close</button>
            </div>
          </div>
        )}
        {active?.kind === "direct" && (
          <CustomPlayer
            source={active}
            title={media.title}
            season={season}
            episode={episode}
            onClose={onClose}
            onSelectSource={() => setPickerOpen(true)}
            onProgress={(t, d, ended) => recordProgress(media, season, episode, t, d, ended, active)}
          />
        )}
        {active?.kind === "embed" && (
          <EmbedFrame source={active} media={media} onClose={onClose} onSelectSource={() => setPickerOpen(true)} />
        )}
        {pickerOpen && sources && (
          <SourcePicker
            sources={sources}
            active={activeId}
            onPick={(id) => { setActiveId(id); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

function recordProgress(
  media: Media,
  season: number | undefined,
  episode: number | undefined,
  currentTime: number,
  duration: number,
  completed: boolean,
  source: ResolvedSource,
) {
  if (!Number.isFinite(currentTime)) return;
  const dur = Number.isFinite(duration) ? duration : 0;
  if (dur <= 0 && !completed) {
    const saved = getLocalProgressFor(media.id, season ?? null, episode ?? null);
    if (!saved?.durationSeconds) return;
  }
  const entry = {
    mediaId: media.id,
    mediaType: media.type,
    season: season ?? null,
    episode: episode ?? null,
    positionSeconds: Math.max(0, Math.floor(currentTime)),
    durationSeconds: Math.max(0, Math.floor(dur)),
    title: media.title,
    poster: media.poster ?? null,
    backdrop: media.backdrop ?? null,
    completed,
    updatedAt: Date.now(),
    source: source.id,
  };
  saveProgressLocal(entry);
  void syncProgressUp(entry);
}

function EmbedFrame({
  source, media, onClose, onSelectSource,
}: {
  source: Extract<ResolvedSource, { kind: "embed" }>;
  media: Media;
  onClose: () => void;
  onSelectSource: () => void;
}) {
  return (
    <div className="relative h-full w-full bg-black">
      <iframe
        src={source.url}
        title={media.title}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <button
          onClick={onClose}
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-black/80"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onSelectSource}
          className="pointer-events-auto rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-black/80"
        >
          {source.name} · {source.badge}
        </button>
      </div>
    </div>
  );
}

function SourcePicker({
  sources, active, onPick, onClose,
}: {
  sources: ResolvedSource[];
  active: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="w-[min(92vw,480px)] rounded-2xl border border-white/10 bg-card/95 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Select source</p>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {sources.map((s) => {
            const q = s.kind === "direct" ? (s as DirectSource).qualities[0] : null;
            return (
              <li key={s.id}>
                <button
                  onClick={() => onPick(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    active === s.id ? "border-primary bg-primary/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{s.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-white/50">
                      {s.kind === "direct" ? "Direct HLS" : "Embed"} · {s.badge}
                    </p>
                  </div>
                  {q && (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {q.label} · {q.format.toUpperCase()}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

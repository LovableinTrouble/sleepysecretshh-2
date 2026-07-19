/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { sourceForKey } from "@/lib/sources";
import { getLocalProgressFor, saveProgressLocal } from "@/lib/progress";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  const isShow = media.type !== "movie";

  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedProgress = useMemo(
    () => getLocalProgressFor(media.id, season ?? null, episode ?? null),
    [media.id, season, episode],
  );

  // Videasy URL — all features on, resumes from local progress.
  const url = sourceForKey("videasy").build(
    media,
    season,
    episode,
    savedProgress?.positionSeconds,
  );

  // Seed a Continue Watching entry on open; real position comes from
  // ZXCStream's postMessage stream below.
  useEffect(() => {
    saveProgressLocal({
      mediaId: media.id,
      mediaType: media.type,
      season: season ?? null,
      episode: episode ?? null,
      positionSeconds: 0,
      durationSeconds: 0,
      title: media.title,
      poster: media.poster ?? null,
      backdrop: media.backdrop ?? null,
      completed: false,
      updatedAt: Date.now(),
    });
  }, [media.id, media.type, media.title, media.poster, media.backdrop, season, episode]);

  // Videasy posts progress as a JSON string on window.message.
  // Payload example: { id, type: 'movie'|'tv', progress: { watched, duration },
  //                    timestamp, season?, episode? }
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const raw = event.data;
      let data: any = raw;
      if (typeof raw === "string") {
        try { data = JSON.parse(raw); } catch { return; }
      }
      if (!data || typeof data !== "object") return;
      const progress = data.progress;
      if (!progress || typeof progress !== "object") return;
      const position = Number(progress.watched);
      const duration = Number(progress.duration);
      const hasProgress = Number.isFinite(position) && position >= 0;
      const hasDuration = Number.isFinite(duration) && duration > 0;
      if (!hasProgress) return;

      const percent = hasDuration ? (position / duration) * 100 : 0;
      saveProgressLocal({
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: Math.max(0, Math.floor(position)),
        durationSeconds: hasDuration ? Math.max(0, Math.floor(duration)) : 0,
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed: percent >= 90,
        updatedAt: Date.now(),
      });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [media.id, media.type, media.title, media.poster, media.backdrop, season, episode]);

  const resetControlsTimer = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  };

  // Block right-click context menu while the player is mounted so the
  // iframe source can't be inspected via "View frame source" etc.
  useEffect(() => {
    const onContext = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onContext);
    return () => window.removeEventListener("contextmenu", onContext);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      resetControlsTimer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // Body scroll lock.
  useEffect(() => {
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
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, []);

  const player = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black select-none"
      style={{ height: "100dvh", width: "100vw" }}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      <div className="relative flex-1 bg-black">
        <iframe
          src={url}
          title={media.title}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; display-capture"
          allowFullScreen
        />
      </div>

      {/* Top bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4 transition-all duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/70"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="pointer-events-none flex flex-col items-center">
          <p className="text-sm font-semibold text-white drop-shadow-md">{media.title}</p>
          {isShow && season && episode && (
            <p className="text-[11px] text-white/60">S{season} · E{episode}</p>
          )}
        </div>

        <div className="w-10" />
      </div>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

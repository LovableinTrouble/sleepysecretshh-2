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

// Hidden sandbox toggle — flip ENABLE_SANDBOX to true to isolate the iframe.
// Off by default (ZXCStream needs same-origin access for postMessage events).
const ENABLE_SANDBOX = false;
const SANDBOX_ATTR = ENABLE_SANDBOX
  ? "allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
  : undefined;

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  const isShow = media.type !== "movie";

  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedProgress = useMemo(
    () => getLocalProgressFor(media.id, season ?? null, episode ?? null),
    [media.id, season, episode],
  );

  // ZXC[STREAM] URL — autoplay on, no in-player back button.
  const url = sourceForKey("zxc").build(
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

  // Listen for ZXC[STREAM] postMessage events and persist real playback progress.
  // Events: VIDEO_PLAY, VIDEO_PAUSE, VIDEO_PROGRESS (every 60s after 60s),
  //         VIDEO_NINETY_PERCENT, VIDEO_ENDED
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const type = data.type as string | undefined;
      if (!type || !type.startsWith("VIDEO_")) return;

      const payload = data.payload || {};
      const position = Number(payload.currentTime);
      const duration = Number(payload.duration);
      const percent = Number(payload.percent);

      // VIDEO_PROGRESS carries currentTime/duration; VIDEO_ENDED/PLAY/PAUSE may not.
      const hasProgress = Number.isFinite(position) && position >= 0;
      const hasDuration = Number.isFinite(duration) && duration > 0;

      // Don't spam localStorage on every play/pause if there's no progress info.
      if (!hasProgress && type !== "VIDEO_ENDED") return;

      saveProgressLocal({
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: hasProgress ? Math.max(0, Math.floor(position)) : 0,
        durationSeconds: hasDuration ? Math.max(0, Math.floor(duration)) : 0,
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed: type === "VIDEO_ENDED" || percent >= 90,
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
          referrerPolicy="no-referrer"
          {...(SANDBOX_ATTR ? { sandbox: SANDBOX_ATTR } : {})}
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

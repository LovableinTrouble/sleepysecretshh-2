/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X, List } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import type { Media, Episode } from "@/lib/catalog";
import { sourceForKey } from "@/lib/sources";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  const navigate = useNavigate();
  const isShow = media.type !== "movie";
  const hasEpisodes = isShow && !!(season && episode);

  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedProgress = useMemo(
    () => getLocalProgressFor(media.id, season ?? null, episode ?? null),
    [media.id, season, episode],
  );

  // VidSuper URL — all features enabled.
  const url = sourceForKey("vidsuper").build(media, season, episode, savedProgress?.positionSeconds);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showEpisodeList) onClose();
      resetControlsTimer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, resetControlsTimer, showEpisodeList]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [resetControlsTimer]);

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

  const currentEpisodes: Episode[] = useMemo(() => {
    if (!media.seasons || !season) return [];
    return media.seasons.find((s) => s.number === season)?.episodes || [];
  }, [media.seasons, season]);

  const player = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black select-none"
      style={{ height: "100dvh", width: "100vw" }}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      <div className="relative flex-1 bg-black">
        <EmbedVideo
          url={url}
          media={media}
          season={season}
          episode={episode}
          onClose={onClose}
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

        <div className="pointer-events-auto flex gap-2">
          {hasEpisodes && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowEpisodeList((v) => !v); }}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/70"
              aria-label="Episodes"
            >
              <List className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Episode selector drawer */}
      {showEpisodeList && hasEpisodes && (
        <div className="absolute right-0 top-0 z-30 h-full w-80 max-w-[85vw] overflow-y-auto border-l border-white/10 bg-black/90 backdrop-blur-xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-black/80 p-4 backdrop-blur-md">
            <div>
              <p className="text-sm font-semibold text-white">Episodes</p>
              <p className="text-[11px] text-white/40">Season {season}</p>
            </div>
            <button
              onClick={() => setShowEpisodeList(false)}
              className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-2">
            {currentEpisodes.map((ep) => (
              <button
                key={ep.number}
                onClick={() => {
                  setShowEpisodeList(false);
                  navigate({
                    to: "/watch/$id",
                    params: { id: String(media.id) },
                    search: { t: media.type as any, s: season, e: ep.number, party: undefined } as any,
                    replace: true,
                  });
                }}
                className={`flex w-full gap-3 rounded-lg p-2 text-left transition hover:bg-white/5 ${
                  ep.number === episode ? "bg-white/10" : ""
                }`}
              >
                <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-white/5">
                  {ep.still && <img src={ep.still} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  <div className="absolute bottom-0.5 left-1 text-[10px] font-bold text-white drop-shadow">E{ep.number}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{ep.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-white/40">{ep.overview}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

/* ============================================================
 * VidSuper iframe embed + postMessage API (vidsuper.net)
 *
 * The player streams playback events to the parent window:
 *   { id, type, progress, duration, season, episode }
 *   type ∈ "play" | "pause" | "timeupdate" | "ended"
 *   progress / duration are in seconds.
 * ============================================================ */

type VidSuperMessage = {
  type: "play" | "pause" | "timeupdate" | "ended";
  id?: number | string;
  progress?: number;
  duration?: number;
  season?: number;
  episode?: number;
};

function EmbedVideo({
  url,
  media,
  season,
  episode,
  onClose,
}: {
  url: string;
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const seasonKey = season ?? null;
  const epKey = episode ?? null;

  const recordProgress = useCallback(
    (currentTime: number, duration: number, completed: boolean) => {
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return;
      const entry = {
        mediaId: media.id,
        mediaType: media.type,
        season: seasonKey,
        episode: epKey,
        positionSeconds: Math.max(0, Math.floor(currentTime)),
        durationSeconds: Math.max(0, Math.floor(duration)),
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed,
        updatedAt: Date.now(),
      };
      saveProgressLocal(entry);
      void syncProgressUp(entry);
    },
    [media.id, media.type, media.title, media.poster, media.backdrop, seasonKey, epKey],
  );

  // Foolproof postMessage listener: validate origin loosely (sandboxed
  // iframes report origin "null"), parse defensively, ignore anything that
  // doesn't look like a VidSuper playback event.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const raw = event.data;
      if (!raw) return;

      let msg: any;
      if (typeof raw === "string") {
        try { msg = JSON.parse(raw); } catch { return; }
      } else if (typeof raw === "object" && raw !== null) {
        msg = raw;
      } else {
        return;
      }

      const t = msg?.type;
      if (t !== "play" && t !== "pause" && t !== "timeupdate" && t !== "ended") return;

      const data = msg as VidSuperMessage;
      const currentTime = Number(data.progress) || 0;
      const duration = Number(data.duration) || 0;

      if (t === "ended") {
        const saved = getLocalProgressFor(media.id, seasonKey, epKey);
        recordProgress(
          saved?.durationSeconds ?? duration,
          saved?.durationSeconds ?? duration,
          true,
        );
        return;
      }

      if (t === "timeupdate" && currentTime > 0) {
        const completed = duration > 0 && currentTime >= duration - 30;
        recordProgress(currentTime, duration, completed);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [media.id, seasonKey, epKey, recordProgress]);

  return (
    <div className="relative h-full w-full bg-black">
      <iframe
        ref={iframeRef}
        src={url}
        title={media.title}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        // Sandboxed to block ad popups while keeping every player feature:
        // allow-scripts (player JS), allow-same-origin (autoplay/fullscreen),
        // allow-presentation (fullscreen), allow-popups (picture-in-picture).
        // NOT set: allow-popups-to-escape-sandbox — so any window opened from
        // inside inherits the sandbox restrictions, blocking ad popups.
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <button
          onClick={onClose}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur hover:bg-black/70"
          aria-label="Close player"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

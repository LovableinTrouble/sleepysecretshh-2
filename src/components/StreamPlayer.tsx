/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { sourceForKey } from "@/lib/sources";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

/* ============================================================
 * Prionix iframe embed + postMessage API (backed by zxcstream.xyz)
 * ============================================================ */

type CineSrcMessage = {
  type: string;
  currentTime?: number;
  duration?: number;
  season?: number;
  episode?: number;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  time?: number;
  sourceId?: string;
  error?: any;
  internalNavigation?: boolean;
  source?: string;
};

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

  const url = sourceForKey("prionix").build(media, season, episode);

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
        <EmbedVideo url={url} media={media} season={season} episode={episode} onClose={onClose} />
      </div>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let isAllowedOrigin: boolean;
      if (event.origin === "null") {
        isAllowedOrigin = true;
      } else {
        try {
          const originHost = new URL(event.origin).hostname.toLowerCase();
          isAllowedOrigin = originHost === "cinesrc.st" || originHost.endsWith(".cinesrc.st");
        } catch {
          isAllowedOrigin = true;
        }
      }
      if (!isAllowedOrigin) return;

      let data: CineSrcMessage | undefined;
      if (typeof event.data === "string") {
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
      } else {
        data = event.data as CineSrcMessage | undefined;
      }
      if (!data || typeof (data as { type?: any }).type !== "string") return;

      const t = data.type;
      switch (t) {
        case "cinesrc:ready":
        case "cinesrc:play":
        case "cinesrc:pause":
        case "cinesrc:seeking":
        case "cinesrc:seeked":
          break;
        case "cinesrc:timeupdate": {
          if (typeof data.currentTime === "number" && typeof data.duration === "number") {
            recordProgress(data.currentTime, data.duration, false);
          }
          break;
        }
        case "cinesrc:ended": {
          const saved = getLocalProgressFor(media.id, seasonKey, epKey);
          recordProgress(saved?.durationSeconds ?? 0, saved?.durationSeconds ?? 0, true);
          break;
        }
        case "cinesrc:close":
          onClose();
          break;
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
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock"
      />
      {/* Opaque cover over the CineSrc watermark on the player control bar.
       * Matches the near-black control-bar background so it blends in and the
       * watermark is not visible or clickable. */}
      <div
        aria-hidden="true"
        className="absolute bottom-2 right-[110px] h-10 w-28 md:bottom-3 md:right-[135px] md:h-11 md:w-32"
        style={{
          pointerEvents: "auto",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0) 100%)",
        }}
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

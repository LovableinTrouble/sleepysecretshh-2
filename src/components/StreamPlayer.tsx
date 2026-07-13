/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { sourceForKey } from "@/lib/sources";
import { getSettings } from "@/lib/store";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";

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
  const febbox = settings.integrations.febboxToken?.trim();
  const source = sourceForKey(settings.preferredSource as any);
  const url = source.build(media, season, episode, febbox);

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
        <EmbedPlayer url={url} useFebbox={!!febbox} media={media} season={season} episode={episode} onClose={onClose} />
      </div>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

function EmbedPlayer({
  url,
  useFebbox,
  media,
  season,
  episode,
  onClose,
}: {
  url: string;
  useFebbox: boolean;
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
      // --- CineSrc events (cinesrc.st) ---
      if (event.origin === "https://cinesrc.st") {
        const d = event.data as { type?: string; currentTime?: number; duration?: number } | undefined;
        if (!d || typeof d.type !== "string") return;
        if (d.type === "cinesrc:timeupdate") {
          if (typeof d.currentTime === "number" && typeof d.duration === "number") {
            recordProgress(d.currentTime, d.duration, false);
          }
        } else if (d.type === "cinesrc:ended") {
          const saved = getLocalProgressFor(media.id, seasonKey, epKey);
          recordProgress(saved?.durationSeconds ?? 0, saved?.durationSeconds ?? 0, true);
        } else if (d.type === "cinesrc:close") {
          onClose();
        }
        return;
      }

      // --- Cinezo WATCH_PROGRESS events (player.cinezo.live) ---
      if (event.origin === "https://player.cinezo.live") {
        const d = event.data as { type?: string; data?: { mediaId?: string; currentTime?: number; duration?: number; eventType?: string } } | undefined;
        if (d?.type === "WATCH_PROGRESS" && d.data) {
          const { currentTime, duration, eventType } = d.data;
          if (typeof currentTime === "number" && typeof duration === "number") {
            const completed = eventType === "ended";
            recordProgress(currentTime, duration, completed);
          }
        }
        return;
      }

      // --- Legacy / fallback: any trusted origin ---
      let isAllowedOrigin: boolean;
      if (event.origin === "null") {
        isAllowedOrigin = true;
      } else {
        try {
          const h = new URL(event.origin).hostname.toLowerCase();
          isAllowedOrigin = h === "cinezo.live" || h.endsWith(".cinezo.live");
        } catch {
          isAllowedOrigin = true;
        }
      }
      if (!isAllowedOrigin) return;

      let data: { type?: string; currentTime?: number; duration?: number } | undefined;
      if (typeof event.data === "string") {
        try { data = JSON.parse(event.data); } catch { return; }
      } else {
        data = event.data;
      }
      if (!data || typeof data.type !== "string") return;

      const t = data.type;
      if (/timeupdate|time-update|progress/i.test(t)) {
        if (typeof data.currentTime === "number" && typeof data.duration === "number") {
          recordProgress(data.currentTime, data.duration, false);
        }
      } else if (/ended|complete/i.test(t)) {
        const saved = getLocalProgressFor(media.id, seasonKey, epKey);
        recordProgress(saved?.durationSeconds ?? 0, saved?.durationSeconds ?? 0, true);
      } else if (/close|exit/i.test(t)) {
        onClose();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [media.id, seasonKey, epKey, recordProgress, onClose]);

  return (
    <div className="relative h-full w-full bg-black">
      <iframe
        ref={iframeRef}
        src={url}
        title={media.title}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy={useFebbox ? "origin" : "no-referrer"}
      />
      {/* Back button — positioned low enough to clear the in-player server icon row */}
      <div className="pointer-events-none absolute inset-x-0 top-14 flex items-center px-3">
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

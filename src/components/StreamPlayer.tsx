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
  const febbox = settings.integrations.febboxToken?.trim() || undefined;
  const source = sourceForKey(settings.preferredSource as any);
  const url = source.build(media, season, episode, febbox);
  const useFebbox = !!febbox;

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
        <EmbedPlayer
          url={url}
          useFebbox={useFebbox}
          media={media}
          season={season}
          episode={episode}
          onClose={onClose}
        />
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
    (currentTime: number, duration: number, completed: boolean, src: "cinesrc" | "cinezo") => {
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return;
      // Throttle: only write every 5 s unless it's a completion
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
        source: src,
      };
      saveProgressLocal(entry);
      void syncProgressUp(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media.id, media.type, media.title, media.poster, media.backdrop, seasonKey, epKey],
  );

  // Throttle ref so timeupdate doesn't spam storage every frame
  const lastSaveRef = useRef<number>(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // ── CineSrc (cinesrc.st) ────────────────────────────────────────────────
      if (event.origin === "https://cinesrc.st") {
        const d = event.data as {
          type?: string;
          currentTime?: number;
          duration?: number;
        } | null;
        if (!d || typeof d.type !== "string") return;

        switch (d.type) {
          case "cinesrc:timeupdate": {
            const now = Date.now();
            if (now - lastSaveRef.current < 5000) return; // throttle to 5 s
            lastSaveRef.current = now;
            const ct = typeof d.currentTime === "number" ? d.currentTime : NaN;
            const dur = typeof d.duration === "number" ? d.duration : NaN;
            recordProgress(ct, dur, false, "cinesrc");
            break;
          }
          case "cinesrc:seeked": {
            const ct = typeof d.currentTime === "number" ? d.currentTime : NaN;
            const dur = typeof d.duration === "number" ? d.duration : NaN;
            recordProgress(ct, dur, false, "cinesrc");
            break;
          }
          case "cinesrc:ended": {
            const saved = getLocalProgressFor(media.id, seasonKey, epKey);
            recordProgress(
              saved?.durationSeconds ?? 0,
              saved?.durationSeconds ?? 0,
              true,
              "cinesrc",
            );
            break;
          }
          case "cinesrc:close":
            onClose();
            break;
        }
        return;
      }

      // ── Cinezo (player.cinezo.live) — PLAYER_EVENT ────────────────────────
      // Actual structure from the Cinezo bundle:
      //   parent.postMessage({ type: "PLAYER_EVENT", data: {
      //     event: "timeupdate"|"play"|"pause"|"seeked"|"ended",
      //     currentTime, duration, tmdbId, mediaType, season, episode
      //   } }, "*")
      if (
        event.origin === "https://player.cinezo.live" ||
        event.origin === "https://cinezo.live"
      ) {
        const d = event.data as {
          type?: string;
          data?: {
            event?: string;
            currentTime?: number;
            duration?: number;
            tmdbId?: number;
            mediaType?: string;
            season?: number;
            episode?: number;
          };
        } | null;
        if (!d || d.type !== "PLAYER_EVENT" || !d.data) return;

        const { currentTime, duration, event: evt } = d.data;
        const ct = typeof currentTime === "number" ? currentTime : NaN;
        const dur = typeof duration === "number" ? duration : NaN;

        if (evt === "timeupdate") {
          const now = Date.now();
          if (now - lastSaveRef.current < 5000) return;
          lastSaveRef.current = now;
          recordProgress(ct, dur, false, "cinezo");
        } else if (evt === "ended") {
          recordProgress(ct, dur, true, "cinezo");
        } else if (evt === "pause" || evt === "seeked") {
          recordProgress(ct, dur, false, "cinezo");
        }
        return;
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
        // Sandbox CineSrc to block popups — no allow-popups means window.open is blocked
        sandbox={useFebbox ? "allow-scripts allow-same-origin allow-presentation" : undefined}
      />

      {/* Back button — only shown for Cinezo (CineSrc has its own via back=close) */}
      {!useFebbox && (
        <div
          className="pointer-events-none absolute inset-x-0 flex items-start px-3"
          style={{ top: "56px" }}
        >
          <button
            onClick={onClose}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/80"
            aria-label="Close player"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

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

type PrionixMessage =
  | { type: "VIDEO_PLAY" }
  | { type: "VIDEO_PAUSE" }
  | {
      type: "VIDEO_PROGRESS";
      payload: { progressKey: string; currentTime: number; duration: number; percent: number };
    }
  | {
      type: "VIDEO_NINETY_PERCENT";
      payload: { progressKey: string; currentTime: number; duration: number };
    }
  | { type: "VIDEO_ENDED"; payload: { progressKey: string } };

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
      let isZxcstreamOrigin: boolean;
      if (event.origin === "null") {
        isZxcstreamOrigin = true;
      } else {
        try {
          const originHost = new URL(event.origin).hostname.toLowerCase();
          isZxcstreamOrigin = originHost === "zxcstream.xyz" || originHost.endsWith(".zxcstream.xyz");
        } catch {
          isZxcstreamOrigin = true;
        }
      }
      if (!isZxcstreamOrigin) return;

      let data: PrionixMessage | undefined;
      if (typeof event.data === "string") {
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
      } else {
        data = event.data as PrionixMessage | undefined;
      }
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "VIDEO_PLAY":
        case "VIDEO_PAUSE":
          break;
        case "VIDEO_PROGRESS":
        case "VIDEO_NINETY_PERCENT": {
          const { currentTime, duration } = data.payload;
          recordProgress(currentTime, duration, false);
          break;
        }
        case "VIDEO_ENDED": {
          const saved = getLocalProgressFor(media.id, seasonKey, epKey);
          recordProgress(saved?.durationSeconds ?? 0, saved?.durationSeconds ?? 0, true);
          break;
        }
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
        {...({
          // Restrict what the embed can load: only zxcstream + its known origins.
          // Strips ad iframes, pop-under scripts, and overlay banners injected
          // from third-party ad networks. `csp` is a valid HTML attribute but
          // not yet in React's typings, so spread it in.
          csp:
            "default-src 'self' https://zxcstream.xyz https://*.zxcstream.xyz blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://zxcstream.xyz https://*.zxcstream.xyz; style-src 'self' 'unsafe-inline' https://zxcstream.xyz https://*.zxcstream.xyz; img-src 'self' data: blob: https://zxcstream.xyz https://*.zxcstream.xyz; media-src 'self' blob: data: https://zxcstream.xyz https://*.zxcstream.xyz; connect-src 'self' https://zxcstream.xyz https://*.zxcstream.xyz wss://zxcstream.xyz wss://*.zxcstream.xyz; frame-src 'self' https://zxcstream.xyz https://*.zxcstream.xyz; child-src 'self' https://zxcstream.xyz https://*.zxcstream.xyz; worker-src 'self' blob:; font-src 'self' data: https://zxcstream.xyz https://*.zxcstream.xyz",
        } as Record<string, string>)}
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

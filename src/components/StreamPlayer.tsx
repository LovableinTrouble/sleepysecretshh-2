import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

const EMBED_BASE = "https://vidgod.site";

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  const src = useMemo(() => {
    const isShow = media.type !== "movie";
    return isShow
      ? `${EMBED_BASE}/tv/${media.id}/${season ?? 1}/${episode ?? 1}`
      : `${EMBED_BASE}/movie/${media.id}`;
  }, [media.id, media.type, season, episode]);

  // Lock page scroll while the player is open.
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

  // Keep the last known position so Continue Watching still works.
  useEffect(() => {
    const saved = getLocalProgressFor(media.id, season ?? null, episode ?? null);
    recordProgress(media, season, episode, saved?.positionSeconds ?? 0, saved?.durationSeconds ?? 0, false);
  }, [media, season, episode]);

  const player = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black"
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, height: "100dvh", width: "100vw" }}
    >
      <div className="relative flex-1 overflow-hidden bg-black">
        <iframe
          key={src}
          src={src}
          title={media.title}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="origin"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock"
        />

        <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between gap-3 p-3 sm:p-4">
          <button
            onClick={onClose}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/80"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

function recordProgress(
  media: Media, season: number | undefined, episode: number | undefined,
  currentTime: number, duration: number, completed: boolean,
) {
  if (!Number.isFinite(currentTime) || currentTime <= 0) return;
  const payload = {
    mediaId: media.id, mediaType: media.type, season: season ?? null, episode: episode ?? null,
    positionSeconds: Math.max(0, Math.floor(currentTime)),
    durationSeconds: Math.max(0, Math.floor(Number.isFinite(duration) ? duration : 0)),
    title: media.title, poster: media.poster ?? null, backdrop: media.backdrop ?? null,
    completed, updatedAt: Date.now(), source: "vidgod",
  };
  saveProgressLocal(payload);
  void syncProgressUp(payload);
}

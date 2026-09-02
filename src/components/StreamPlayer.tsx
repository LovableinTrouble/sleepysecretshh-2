import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";
import { serverById, type ServerId } from "@/lib/embed-servers";
import { getSettings } from "@/lib/store";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  server: ServerId;
  onClose: () => void;
}

export function StreamPlayer({ media, season, episode, server, onClose }: Props) {
  const src = useMemo(() => {
    const s = serverById(server);
    const febbox = s.supportsFebbox
      ? getSettings().integrations.febboxCookie?.trim() || undefined
      : undefined;
    const saved = getLocalProgressFor(media.id, season ?? null, episode ?? null);
    return s.build(media, season, episode, {
      febbox,
      startSeconds: saved?.completed ? 0 : (saved?.positionSeconds ?? 0),
    });
  }, [media, season, episode, server]);

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

  // postMessage progress from either embed.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      try {
        if (ev.origin === window.location.origin) return;
        const raw = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (!raw || typeof raw !== "object") return;
        const d = raw?.data ?? raw;
        const time = Number(d?.currentTime ?? d?.progress ?? d?.timestamp);
        const duration = Number(d?.duration ?? 0);
        if (Number.isFinite(time) && time > 0) {
          recordProgress(media, season, episode, time, duration, duration > 0 && time / duration > 0.95);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [media, season, episode]);

  // Ask the embed to resume where the user left off (belt and braces with the URL param).
  useEffect(() => {
    const saved = getLocalProgressFor(media.id, season ?? null, episode ?? null);
    const start = saved && !saved.completed ? Math.floor(saved.positionSeconds) : 0;
    if (start <= 10) return;
    let sent = 0;
    const timer = window.setInterval(() => {
      const frame = document.querySelector<HTMLIFrameElement>("iframe[data-sleepy-player]");
      frame?.contentWindow?.postMessage({ type: "SEEK", time: start, currentTime: start }, "*");
      if (++sent >= 6) window.clearInterval(timer);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [media, season, episode, src]);

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
          data-sleepy-player
          src={src}
          title={media.title}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="origin"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock"
        />

        <button
          onClick={onClose}
          aria-label="Back"
          className="group absolute left-0 top-1/2 z-10 flex -translate-y-1/2 items-center overflow-hidden rounded-r-2xl border border-l-0 border-white/15 bg-black/45 py-5 pl-1 pr-2 text-white/80 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-white/25 hover:bg-black/75 hover:pr-3.5 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:-translate-x-0.5" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold tracking-wide opacity-0 transition-all duration-300 group-hover:max-w-[64px] group-hover:opacity-100">
            Back
          </span>
        </button>
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

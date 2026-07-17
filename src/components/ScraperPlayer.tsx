/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Play, Pause, Loader2, List, X } from "lucide-react";
import Hls from "hls.js";

import type { Media } from "@/lib/catalog";
import { scrapeStreams, type ScraperStream } from "@/lib/scraper";
import { getLocalProgressFor, saveProgressLocal } from "@/lib/progress";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

// Hidden sandbox toggle — flip to true to isolate the iframe (unused here, but
// kept for parity with the embed player).
const ENABLE_SANDBOX = false;

function fmtTime(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function ScraperPlayer({ media, season, episode, onClose }: Props) {
  const isShow = media.type !== "movie";

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<ScraperStream[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const savedProgress = useMemo(
    () => getLocalProgressFor(media.id, season ?? null, episode ?? null),
    [media.id, season, episode],
  );

  // Scrape streams on mount.
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    scrapeStreams({
      data: {
        tmdbId: media.id,
        title: media.title,
        releaseYear: media.year ? Number(media.year) : undefined,
        type: media.type === "movie" ? "movie" : "tv",
        season: isShow ? season : undefined,
        episode: isShow ? episode : undefined,
      },
    })
      .then((res) => {
        if (dead) return;
        if (res.ok && res.streams.length > 0) {
          setStreams(res.streams);
          setActiveIdx(0);
        } else {
          setError(res.error || "No streams found for this title.");
        }
      })
      .catch((err: any) => !dead && setError(err?.message || "Failed to scrape streams."))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [media.id, media.title, media.year, media.type, isShow, season, episode]);

  const activeStream = streams[activeIdx];

  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Load the active stream into the <video> element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStream) return;

    cleanupHls();
    video.removeAttribute("src");
    video.load();

    const startTime = savedProgress?.positionSeconds || 0;

    if (activeStream.type === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(activeStream.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (startTime > 0) video.currentTime = startTime;
          video.play().catch(() => {});
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = activeStream.url;
        video.addEventListener("loadedmetadata", () => {
          if (startTime > 0) video.currentTime = startTime;
          video.play().catch(() => {});
        }, { once: true });
      }
    } else {
      video.src = activeStream.url;
      video.addEventListener("loadedmetadata", () => {
        if (startTime > 0) video.currentTime = startTime;
        video.play().catch(() => {});
      }, { once: true });
    }

    return () => cleanupHls();
  }, [activeStream, cleanupHls, savedProgress?.positionSeconds]);

  // Video event listeners.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(video.currentTime);
    const onDur = () => setDuration(video.duration || 0);
    const onEnded = () => {
      saveProgressLocal({
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: 0,
        durationSeconds: duration,
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed: true,
        updatedAt: Date.now(),
      });
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("ended", onEnded);
    };
  }, [media.id, media.type, media.title, media.poster, media.backdrop, season, episode, duration]);

  // Persist progress every 15s.
  useEffect(() => {
    if (!playing) return;
    progressTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      saveProgressLocal({
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: Math.floor(video.currentTime),
        durationSeconds: video.duration || 0,
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed: false,
        updatedAt: Date.now(),
      });
    }, 15000);
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [playing, media.id, media.type, media.title, media.poster, media.backdrop, season, episode]);

  // Auto-hide controls.
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  }, []);
  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [resetControlsTimer]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        const video = videoRef.current;
        if (video) { video.paused ? video.play() : video.pause(); }
      }
      resetControlsTimer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, resetControlsTimer]);

  // Body scroll lock.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = { htmlO: html.style.overflow, bodyO: body.style.overflow, bodyP: body.style.position, bodyT: body.style.top, bodyW: body.style.width };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlO;
      body.style.overflow = prev.bodyO;
      body.style.position = prev.bodyP;
      body.style.top = prev.bodyT;
      body.style.width = prev.bodyW;
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  };

  const selectSource = (idx: number) => {
    setActiveIdx(idx);
    setShowSources(false);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    video.currentTime = ratio * duration;
  };

  const player = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black select-none"
      style={{ height: "100dvh", width: "100vw" }}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      <div className="relative flex-1 bg-black">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-white/70" />
              <p className="mt-4 text-sm text-white/60">Scraping sources…</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <div className="text-center">
              <p className="text-sm text-white/70">{error}</p>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="mt-6 rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          className="h-full w-full bg-black"
          playsInline
          {...(ENABLE_SANDBOX ? {} : {})}
        />

        {/* Center play/pause */}
        {!loading && !error && (
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="absolute inset-0 z-[5] grid place-items-center"
            aria-label={playing ? "Pause" : "Play"}
          >
            <div className={`grid h-16 w-16 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/20 backdrop-blur-md transition-all ${playing ? "opacity-0" : "opacity-100"}`}>
              {playing ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
            </div>
          </button>
        )}

        {/* Top bar */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4 transition-all duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
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

        {/* Bottom bar: controls + source picker */}
        {!loading && !error && (
          <div
            className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-4 pb-4 pt-12 transition-all duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
          >
            {/* Progress bar */}
            <div
              className="group mb-3 h-1.5 cursor-pointer rounded-full bg-white/20"
              onClick={(e) => { e.stopPropagation(); seek(e); }}
            >
              <div
                className="relative h-full rounded-full bg-white transition-all group-hover:bg-white/80"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  className="text-white transition hover:text-white/80"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                </button>
                <span className="text-xs font-medium text-white/80 tabular-nums">
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); setShowSources((v) => !v); }}
                className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20"
              >
                <List className="h-4 w-4" />
                {activeStream ? activeStream.sourceName : "Sources"}
                {streams.length > 0 && (
                  <span className="rounded-full bg-white/15 px-1.5 text-[10px]">{streams.length}</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Source picker panel */}
        {showSources && (
          <div className="absolute bottom-24 right-4 z-30 w-72 rounded-2xl border border-white/10 bg-card/95 p-2 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">Sources</p>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSources(false); }}
                className="grid h-6 w-6 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="max-h-60 overflow-y-auto">
              {streams.map((s, i) => (
                <li key={s.id}>
                  <button
                    onClick={(e) => { e.stopPropagation(); selectSource(i); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${i === activeIdx ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/5"}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{s.sourceName}</p>
                      <p className="text-[10px] uppercase text-white/40">
                        {s.type}{s.quality ? ` · ${s.quality}` : ""}
                      </p>
                    </div>
                    {i === activeIdx && <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

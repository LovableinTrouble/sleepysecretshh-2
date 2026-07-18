/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import {
  ChevronLeft,
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings as SettingsIcon,
  Check,
  AlertCircle,
  RotateCw,
} from "lucide-react";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal } from "@/lib/progress";
import { scrapeVyla, type VylaSource } from "@/lib/vyla-scraper";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

type Status = "scraping" | "playing" | "paused" | "error";

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function qualityLabel(h: number): string {
  if (h >= 1800) return "4K";
  if (h >= 800) return "1080p";
  if (h >= 600) return "720p";
  if (h >= 420) return "480p";
  return "360p";
}

export function VylaPlayer({ media, season, episode, onClose }: Props) {
  const isShow = media.type !== "movie";
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<Status>("scraping");
  const [scrapeMsg, setScrapeMsg] = useState("Finding streams…");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sources, setSources] = useState<VylaSource[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [sourceStatuses, setSourceStatuses] = useState<Record<number, "ok" | "failed">>({});
  const [qualities, setQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>("auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);

  const savedProgress = useMemo(
    () => getLocalProgressFor(media.id, season ?? null, episode ?? null),
    [media.id, season, episode],
  );

  // --- Scrape sources on mount ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("scraping");
      setScrapeMsg(`Searching providers for "${media.title}"…`);
      try {
        const kind = isShow ? "tv" : "movie";
        const result = await scrapeVyla(media.id, kind, season, episode);
        if (cancelled) return;
        if (result.sources.length === 0) {
          setErrorMsg("No playable sources found. Try another title or the ZXCStream source.");
          setStatus("error");
          return;
        }
        setSources(result.sources);
        setActiveIdx(0);
        setScrapeMsg(`Loading ${result.sources[0].label || result.sources[0].source}…`);
      } catch {
        if (!cancelled) {
          setErrorMsg("Failed to reach streaming providers. Please try again.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [media.id, media.title, isShow, season, episode]);

  // --- Load a source into hls.js / video element ---
  const loadSource = useCallback(
    (idx: number) => {
      const video = videoRef.current;
      if (!video) return;
      const src = sources[idx];
      if (!src) return;

      // Destroy previous hls instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Resume position
      const resumeAt = savedProgress?.positionSeconds ?? 0;

      if (src.type === "hls") {
        // Safari / iOS native HLS
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src.url;
          if (resumeAt > 5) video.currentTime = resumeAt;
          video.play().catch(() => {});
        } else if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            startFragPrefetch: true,
            testBandwidth: true,
            abrEwmaDefaultEstimate: 8_000_000,
            maxBufferLength: 120,
            maxMaxBufferLength: 300,
            maxStarvationDelay: 4,
            maxLoadingDelay: 4,
            backBufferLength: 90,
            fragLoadPolicy: {
              default: {
                maxLoadTimeMs: 30_000,
                maxTimeToFirstByteMs: 30_000,
                errorRetry: { maxNumRetry: 10, retryDelayMs: 1000, maxRetryDelayMs: 10_000 },
                timeoutRetry: { maxNumRetry: 10, retryDelayMs: 0, maxRetryDelayMs: 0 },
              },
            },
          });
          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setQualities(
              [...new Set(hls.levels.filter((l) => l.height > 0).map((l) => qualityLabel(l.height)))],
            );
            if (resumeAt > 5) video.currentTime = resumeAt;
            video.play().catch(() => {});
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            const level = hls.levels[data.level];
            if (level) setCurrentQuality(qualityLabel(level.height));
          });

          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                // Fatal — mark source failed, try next
                setSourceStatuses((p) => ({ ...p, [idx]: "failed" }));
                if (idx + 1 < sources.length) {
                  setActiveIdx(idx + 1);
                  setScrapeMsg(`Switching to ${sources[idx + 1].label || sources[idx + 1].source}…`);
                } else {
                  setErrorMsg("Playback failed on all sources. Please try another title.");
                  setStatus("error");
                }
              }
            }
          });

          hls.loadSource(src.url);
          hls.attachMedia(video);
        } else {
          setErrorMsg("Your browser doesn't support HLS playback.");
          setStatus("error");
        }
      } else {
        // Direct MP4/WebM
        video.src = src.url;
        if (resumeAt > 5) video.currentTime = resumeAt;
        video.play().catch(() => {});
        setQualities([]);
        setCurrentQuality("auto");
      }

      setSourceStatuses((p) => ({ ...p, [idx]: "ok" }));
    },
    [sources, savedProgress?.positionSeconds],
  );

  // Load when active source changes
  useEffect(() => {
    if (sources.length > 0 && status !== "error") {
      loadSource(activeIdx);
    }
  }, [activeIdx, sources, status, loadSource]);

  // --- Video element event listeners ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setStatus("playing");
      setIsLoading(false);
    };
    const onPause = () => {
      setIsPlaying(false);
      setStatus("paused");
    };
    const onTime = () => {
      if (!seeking) setCurrentTime(video.currentTime);
      if (video.duration > 0) {
        setDuration(video.duration);
        setBuffered(
          video.buffered.length > 0
            ? video.buffered.end(video.buffered.length - 1)
            : 0,
        );
      }
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onEnded = () => {
      saveProgressLocal({
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: video.duration,
        durationSeconds: video.duration,
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed: true,
        updatedAt: Date.now(),
      });
    };
    const onError = () => {
      if (sources.length > 0 && activeIdx + 1 < sources.length) {
        setActiveIdx(activeIdx + 1);
      } else {
        setErrorMsg("Playback error. Please try another source.");
        setStatus("error");
      }
    };
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("volumechange", onVolume);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("volumechange", onVolume);
    };
  }, [media.id, media.type, media.title, media.poster, media.backdrop, season, episode, activeIdx, sources.length, seeking]);

  // --- Progress heartbeat ---
  useEffect(() => {
    if (status !== "playing") return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.currentTime < 5) return;
      saveProgressLocal({
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: Math.floor(video.currentTime),
        durationSeconds: Math.floor(video.duration) || 0,
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed: false,
        updatedAt: Date.now(),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [status, media.id, media.type, media.title, media.poster, media.backdrop, season, episode]);

  // --- Cleanup hls on unmount ---
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // --- Controls ---
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [resetControlsTimer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          onClose();
        }
      } else if (e.key === " ") {
        e.preventDefault();
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      } else if (e.key === "ArrowLeft") {
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (e.key === "ArrowRight") {
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
      } else if (e.key === "f") {
        toggleFullscreen();
      } else if (e.key === "m") {
        video.muted = !video.muted;
      }
      resetControlsTimer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, resetControlsTimer]);

  // --- Fullscreen tracking ---
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // --- Body scroll lock ---
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

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, video.duration || Infinity));
    setCurrentTime(video.currentTime);
  };

  const setQualityLevel = (q: string) => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (q === "auto") {
      hls.currentLevel = -1;
    } else {
      const target = q === "4K" ? 2160 : q === "1080p" ? 1080 : q === "720p" ? 720 : q === "480p" ? 480 : 360;
      let best = -1;
      let bestDiff = Infinity;
      hls.levels.forEach((l, i) => {
        const diff = Math.abs((l.height || 0) - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      });
      if (best >= 0) hls.currentLevel = best;
    }
    setCurrentQuality(q);
    setShowSettings(false);
  };

  const switchSource = (idx: number) => {
    if (idx === activeIdx) return;
    setActiveIdx(idx);
    setShowSettings(false);
  };

  const retry = () => {
    setErrorMsg(null);
    setSources([]);
    setActiveIdx(0);
    setStatus("scraping");
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const displayTime = seeking ? seekTime : currentTime;

  // ===== Render =====
  const player = (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black select-none"
      style={{ height: "100dvh", width: "100vw" }}
      onMouseMove={resetControlsTimer}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "VIDEO") {
          togglePlay();
        }
        resetControlsTimer();
      }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black"
        autoPlay
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
      />

      {/* Loading / scraping overlay */}
      {(status === "scraping" || isLoading) && status !== "error" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-white/70" strokeWidth={1.5} />
          <p className="mt-4 text-sm font-medium text-white/80">{scrapeMsg}</p>
          <p className="mt-1 text-xs text-white/40">Finding the best stream for you</p>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
            <AlertCircle className="h-8 w-8 text-red-400" strokeWidth={1.5} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-white">Playback Failed</h1>
          <p className="mt-2 max-w-sm text-sm text-white/50">{errorMsg}</p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={retry}
              className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <RotateCw className="h-4 w-4" /> Retry
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4 transition-all duration-300 ${
          showControls && status !== "error" ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
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

      {/* Center play button when paused */}
      {status === "paused" && !isLoading && (
        <button
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
          aria-label="Play"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-xl transition hover:scale-105 hover:bg-white/20">
            <Play className="h-9 w-9 fill-white text-white" />
          </div>
        </button>
      )}

      {/* Bottom controls */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 transition-all duration-300 ${
          showControls && status !== "error" ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pb-4 pt-16">
          {/* Progress bar */}
          <div
            className="group relative mb-3 cursor-pointer py-2"
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              setSeekTime(pct * duration);
              setSeeking(true);
              const move = (ev: MouseEvent) => {
                const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                setSeekTime(p * duration);
              };
              const up = (ev: MouseEvent) => {
                const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                seekTo(p * duration);
                setSeeking(false);
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          >
            <div className="relative h-1 w-full rounded-full bg-white/15 transition-all group-hover:h-1.5">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/20"
                style={{ width: `${bufferedPct}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white"
                style={{ width: `${progressPct}%` }}
              >
                <div className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 scale-0 rounded-full bg-white shadow transition group-hover:scale-100" />
              </div>
            </div>
          </div>

          {/* Buttons row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-white">
              <button onClick={togglePlay} className="hover:text-white/80" aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </button>
              <button
                onClick={() => seekTo(currentTime - 10)}
                className="hover:text-white/80"
                aria-label="Back 10s"
              >
                <SkipBack className="h-5 w-5" />
              </button>
              <button
                onClick={() => seekTo(currentTime + 10)}
                className="hover:text-white/80"
                aria-label="Forward 10s"
              >
                <SkipForward className="h-5 w-5" />
              </button>
              <button onClick={toggleMute} className="hover:text-white/80" aria-label="Mute">
                {muted || volume === 0 ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
              </button>
              <span className="font-mono text-sm tabular-nums text-white/80">
                {fmtTime(displayTime)} <span className="text-white/30">/ {fmtTime(duration)}</span>
              </span>
            </div>

            <div className="flex items-center gap-3 text-white">
              {sources.length > 1 && (
                <span className="text-xs text-white/40">
                  {sources[activeIdx]?.label || sources[activeIdx]?.source}
                </span>
              )}
              <button
                onClick={() => setShowSettings((s) => !s)}
                className={`hover:text-white/80 ${showSettings ? "text-white" : "text-white/60"}`}
                aria-label="Settings"
              >
                <SettingsIcon className="h-6 w-6" />
              </button>
              <button onClick={toggleFullscreen} className="hover:text-white/80" aria-label="Fullscreen">
                {fullscreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && status !== "error" && (
        <>
          <div className="absolute inset-0 z-25" onClick={() => setShowSettings(false)} />
          <div className="absolute bottom-20 right-4 z-30 w-64 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
            {/* Quality */}
            {qualities.length > 0 && (
              <div className="border-b border-white/5 p-1">
                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">Quality</p>
                <button
                  onClick={() => setQualityLevel("auto")}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <Check className={`h-4 w-4 ${currentQuality === "auto" ? "text-white" : "opacity-0"}`} />
                  <span className={currentQuality === "auto" ? "text-white" : "text-white/60"}>Auto</span>
                </button>
                {qualities.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQualityLevel(q)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/5"
                  >
                    <Check className={`h-4 w-4 ${currentQuality === q ? "text-white" : "opacity-0"}`} />
                    <span className={currentQuality === q ? "text-white" : "text-white/60"}>{q}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Sources */}
            <div className="p-1">
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">Sources</p>
              {sources.map((s, i) => (
                <button
                  key={i}
                  onClick={() => switchSource(i)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <Check className={`h-4 w-4 ${i === activeIdx ? "text-white" : "opacity-0"}`} />
                  <span className={i === activeIdx ? "text-white" : "text-white/60"}>{s.label || s.source}</span>
                  {sourceStatuses[i] === "failed" && (
                    <span className="ml-auto text-xs text-red-400">failed</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

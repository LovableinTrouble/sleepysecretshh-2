/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  X,
  AlertCircle,
  RotateCw,
  Server,
  Gauge,
} from "lucide-react";

import type { Media } from "@/lib/catalog";
import { getLocalProgressFor, saveProgressLocal } from "@/lib/progress";
import { getProviders, getStreams, type ScrapedStream } from "@/lib/stream-api";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

type Status = "scraping" | "playing" | "paused" | "error";

interface SourceState {
  name: string;
  status: "untested" | "testing" | "available" | "failed";
  streams?: ScrapedStream[];
}

const SCRAPE_MESSAGES = [
  "Tuning in",
  "Dialing up",
  "Spinning up",
  "Warming up",
  "Contacting",
  "Reaching",
  "Hailing",
  "Pinging",
  "Firing up",
  "Booting",
  "Loading",
  "Summoning",
  "Connecting to",
  "Linking with",
  "Scanning",
  "Probing",
  "Handshaking with",
  "Querying",
  "Calling",
  "Fetching from",
];

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function qualityFromHeight(h: number): string {
  if (h >= 1800) return "4K";
  if (h >= 800) return "1080p";
  if (h >= 600) return "720p";
  if (h >= 420) return "480p";
  return "360p";
}

function inferStreamType(url: string): "hls" | "mp4" {
  const lower = url.split("?")[0].toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mkv")) return "mp4";
  return "hls";
}

export function ScraperPlayer({ media, season, episode, onClose }: Props) {
  const isShow = media.type !== "movie";
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeDone = useRef(false);

  const [status, setStatus] = useState<Status>("scraping");
  const [scrapeLog, setScrapeLog] = useState<string[]>(["Starting…"]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [streams, setStreams] = useState<ScrapedStream[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [sourceStates, setSourceStates] = useState<SourceState[]>([]);
  const [providers, setProviders] = useState<{ name: string; nickname: string }[]>([]);
  const [qualities, setQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState("auto");
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
  const [settingsView, setSettingsView] = useState<"main" | "quality" | "server" | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);

  const savedProgress = useMemo(
    () => getLocalProgressFor(media.id, season ?? null, episode ?? null),
    [media.id, season, episode],
  );

  // --- Fetch providers list ---
  useEffect(() => {
    getProviders().then((data) => {
      if (data?.providers?.length) {
        setProviders(data.providers);
        setSourceStates(data.providers.map((p) => ({ name: p.name, status: "untested" })));
      }
    }).catch(() => {});
  }, []);

  // --- Scrape all providers for streams ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("scraping");
      setScrapeLog(["Starting…"]);
      const mediaType = isShow ? "tv" : "movie";
      const providerList = providers.length > 0 ? providers : [
        { name: "vidlink", nickname: "Vidlink" },
        { name: "notorrent", nickname: "NoTorrent" },
        { name: "vixsrc", nickname: "Vixsrc" },
        { name: "videasy", nickname: "Videasy" },
        { name: "vidfast", nickname: "Vidfast" },
      ];

      const collected: ScrapedStream[] = [];
      for (const p of providerList) {
        if (cancelled) break;
        if (collected.length > 0) break;
        const verb = SCRAPE_MESSAGES[Math.floor(Math.random() * SCRAPE_MESSAGES.length)];
        setScrapeLog([`${verb} ${p.nickname}…`]);
        setSourceStates((prev) =>
          prev.map((s) => (s.name === p.name ? { ...s, status: "testing" } : s)),
        );
        try {
          const result = await getStreams({
            data: {
              type: mediaType,
              id: String(media.id),
              season,
              episode,
              provider: p.name,
            },
          });
          if (cancelled) return;
          if (result.ok && result.streams.length > 0) {
            for (const s of result.streams) collected.push(s);
            setScrapeLog([`${p.nickname} ready`]);
            setSourceStates((prev) =>
              prev.map((s) =>
                s.name === p.name ? { ...s, status: "available", streams: result.streams } : s,
              ),
            );
          } else {
            setScrapeLog([`${p.nickname} failed, trying next…`]);
            setSourceStates((prev) =>
              prev.map((s) => (s.name === p.name ? { ...s, status: "failed" } : s)),
            );
          }
        } catch {
          if (cancelled) return;
          setScrapeLog([`${p.nickname} failed, trying next…`]);
          setSourceStates((prev) =>
            prev.map((s) => (s.name === p.name ? { ...s, status: "failed" } : s)),
          );
        }
      }

      if (cancelled) return;
      if (collected.length === 0) {
        setErrorMsg("No playable sources found. Try another title or the ZXCStream source.");
        setStatus("error");
        return;
      }
      setStreams(collected);
      setActiveIdx(0);
      setStatus("playing");
    })();
    return () => {
      cancelled = true;
    };
  }, [media.id, media.title, isShow, season, episode, providers]);

  // --- Load a stream into hls.js ---
  const loadStream = useCallback(
    (idx: number) => {
      const video = videoRef.current;
      if (!video) return;
      const stream = streams[idx];
      if (!stream) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const resumeAt = resumeDone.current ? 0 : (savedProgress?.positionSeconds ?? 0);

      if (stream.type === "hls") {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = stream.url;
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
            const qs = [
              ...new Set(hls.levels.filter((l) => l.height > 0).map((l) => qualityFromHeight(l.height))),
            ];
            setQualities(qs);
            if (resumeAt > 5) video.currentTime = resumeAt;
            video.play().catch(() => {});
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            const level = hls.levels[data.level];
            if (level) setCurrentQuality(qualityFromHeight(level.height));
          });

          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                // Fatal — try next stream
                if (idx + 1 < streams.length) {
                  setActiveIdx(idx + 1);
                } else {
                  setErrorMsg("Playback failed on all sources.");
                  setStatus("error");
                }
              }
            }
          });

          if (stream.headers) {
            hls.config.xhrSetup = (xhr) => {
              for (const [k, v] of Object.entries(stream.headers!)) {
                try {
                  xhr.setRequestHeader(k, v);
                } catch {}
              }
            };
          }

          hls.loadSource(stream.url);
          hls.attachMedia(video);
        } else {
          setErrorMsg("Your browser doesn't support HLS playback.");
          setStatus("error");
        }
      } else {
        video.src = stream.url;
        if (resumeAt > 5) video.currentTime = resumeAt;
        video.play().catch(() => {});
        setQualities([]);
        setCurrentQuality("auto");
      }
      resumeDone.current = true;
    },
    [streams, savedProgress?.positionSeconds],
  );

  useEffect(() => {
    if (streams.length > 0 && status !== "error") {
      loadStream(activeIdx);
    }
  }, [activeIdx, streams, status, loadStream]);

  // --- Video event listeners ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { setIsPlaying(true); setStatus("playing"); setIsLoading(false); };
    const onPause = () => { setIsPlaying(false); setStatus("paused"); };
    const onTime = () => {
      if (!seeking) setCurrentTime(video.currentTime);
      if (video.duration > 0) {
        setDuration(video.duration);
        setBuffered(video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0);
      }
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onEnded = () => {
      saveProgressLocal({
        mediaId: media.id, mediaType: media.type, season: season ?? null, episode: episode ?? null,
        positionSeconds: video.duration, durationSeconds: video.duration,
        title: media.title, poster: media.poster ?? null, backdrop: media.backdrop ?? null,
        completed: true, updatedAt: Date.now(),
      });
    };
    const onError = () => {
      if (activeIdx + 1 < streams.length) setActiveIdx(activeIdx + 1);
      else { setErrorMsg("Playback error."); setStatus("error"); }
    };
    const onVol = () => { setVolume(video.volume); setMuted(video.muted); };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("volumechange", onVol);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("volumechange", onVol);
    };
  }, [media.id, media.type, media.title, media.poster, media.backdrop, season, episode, activeIdx, streams.length, seeking]);

  // --- Progress heartbeat ---
  useEffect(() => {
    if (status !== "playing") return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.currentTime < 5) return;
      saveProgressLocal({
        mediaId: media.id, mediaType: media.type, season: season ?? null, episode: episode ?? null,
        positionSeconds: Math.floor(video.currentTime), durationSeconds: Math.floor(video.duration) || 0,
        title: media.title, poster: media.poster ?? null, backdrop: media.backdrop ?? null,
        completed: false, updatedAt: Date.now(),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [status, media.id, media.type, media.title, media.poster, media.backdrop, season, episode]);

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, []);

  // --- Controls auto-hide ---
  const resetControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetControls();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [resetControls]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") { document.fullscreenElement ? document.exitFullscreen() : onClose(); }
      else if (e.key === " ") { e.preventDefault(); video.paused ? video.play().catch(() => {}) : video.pause(); }
      else if (e.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 10);
      else if (e.key === "ArrowRight") video.currentTime = Math.min(video.duration, video.currentTime + 10);
      else if (e.key === "f") toggleFullscreen();
      else if (e.key === "m") video.muted = !video.muted;
      resetControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, resetControls]);

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
    const prev = { ho: html.style.overflow, bo: body.style.overflow, bp: body.style.position, bt: body.style.top, bw: body.style.width };
    html.style.overflow = "hidden"; body.style.overflow = "hidden";
    body.style.position = "fixed"; body.style.top = `-${scrollY}px`; body.style.width = "100%";
    return () => {
      html.style.overflow = prev.ho; body.style.overflow = prev.bo;
      body.style.position = prev.bp; body.style.top = prev.bt; body.style.width = prev.bw;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, []);

  // --- Actions ---
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
  };
  const toggleFullscreen = () => {
    const el = containerRef.current; if (!el) return;
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.().catch(() => {});
  };
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return; v.muted = !v.muted;
  };
  const seekTo = (t: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || Infinity));
    setCurrentTime(v.currentTime);
  };
  const seekBy = (delta: number) => {
    const v = videoRef.current; if (!v) return;
    seekTo(v.currentTime + delta);
    setSeekFeedback(delta > 0 ? "fwd" : "back");
    setTimeout(() => setSeekFeedback(null), 650);
  };
  const setQuality = (q: string) => {
    const hls = hlsRef.current; if (!hls) return;
    if (q === "auto") { hls.currentLevel = -1; }
    else {
      const target = q === "4K" ? 2160 : q === "1080p" ? 1080 : q === "720p" ? 720 : q === "480p" ? 480 : 360;
      let best = -1, bestDiff = Infinity;
      hls.levels.forEach((l, i) => {
        const d = Math.abs((l.height || 0) - target);
        if (d < bestDiff) { bestDiff = d; best = i; }
      });
      if (best >= 0) hls.currentLevel = best;
    }
    setCurrentQuality(q);
    setSettingsView("main");
  };
  const switchStream = (idx: number) => {
    if (idx === activeIdx) return;
    resumeDone.current = true;
    setActiveIdx(idx);
    setShowSettings(false);
    setShowSourcePicker(false);
  };
  const retry = () => {
    setErrorMsg(null); setStreams([]); setActiveIdx(0);
    resumeDone.current = false; setStatus("scraping");
    setSourceStates((prev) => prev.map((s) => ({ ...s, status: "untested" })));
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const displayTime = seeking ? seekTime : currentTime;
  const activeStream = streams[activeIdx];
  const activeProviderName = activeStream?.source?.split(" ")[0] ?? "—";
  const uniqueQualities = [...new Set(streams.filter((s) => !activeProviderName || s.source.split(" ")[0] === activeProviderName).map((s) => s.quality))];

  const player = (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black select-none"
      style={{ height: "100dvh", width: "100vw", cursor: showControls ? "default" : "none" }}
      onMouseMove={resetControls}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "VIDEO") togglePlay();
        resetControls();
      }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black"
        autoPlay playsInline preload="metadata"
        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
      />

      {/* Scraping / Loading overlay */}
      <AnimatePresence>
        {(status === "scraping" || isLoading) && status !== "error" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/[0.06] blur-xl scale-150" />
              <Loader2 className="relative h-10 w-10 animate-spin text-white/40" strokeWidth={1.5} />
            </div>
            <motion.p
              key={scrapeLog[0]}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-5 text-[15px] font-semibold text-white/80"
            >
              {scrapeLog[0] || "Loading…"}
            </motion.p>
            <p className="mt-1.5 text-xs text-white/30">Finding the best stream for you</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      <AnimatePresence>
        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 px-6 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
              <AlertCircle className="h-8 w-8 text-red-400" strokeWidth={1.5} />
            </div>
            <h1 className="mt-4 text-xl font-bold text-white">Playback Failed</h1>
            <p className="mt-2 max-w-sm text-sm text-white/50">{errorMsg}</p>
            <div className="mt-6 flex gap-3">
              <button onClick={retry} className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-100">
                <RotateCw className="h-4 w-4" /> Retry
              </button>
              <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
                Go Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4 transition-all duration-300 ${
          showControls && status !== "error" ? "opacity-100" : "opacity-0"
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
          {isShow && season && episode && <p className="text-[11px] text-white/60">S{season} · E{episode}</p>}
        </div>
        <div className="w-10" />
      </div>

      {/* Center controls when paused */}
      <AnimatePresence>
        {status === "paused" && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-15 flex items-center justify-center gap-6 md:gap-10 pointer-events-none [&>*]:pointer-events-auto"
          >
            <button onClick={(e) => { e.stopPropagation(); seekBy(-10); }} className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-white/10 backdrop-blur-xl hover:bg-white/[0.14] active:scale-90 transition" aria-label="Back 10s">
              <SkipBack className="h-7 w-7 text-white/80" strokeWidth={2} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 shadow-2xl backdrop-blur-xl hover:bg-white/16 active:scale-95 transition" aria-label="Play">
              <Play className="h-9 w-9 fill-white text-white ml-1" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); seekBy(10); }} className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-white/10 backdrop-blur-xl hover:bg-white/[0.14] active:scale-90 transition" aria-label="Forward 10s">
              <SkipForward className="h-7 w-7 text-white/80" strokeWidth={2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seek feedback */}
      <AnimatePresence>
        {seekFeedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.82 }}
            className="absolute inset-0 z-25 flex items-center justify-center pointer-events-none"
          >
            <div className="flex items-center gap-3 rounded-2xl bg-black/60 px-6 py-3.5 backdrop-blur-2xl ring-1 ring-white/[0.09]">
              {seekFeedback === "fwd" ? <SkipForward className="h-6 w-6 text-white/75" /> : <SkipBack className="h-6 w-6 text-white/75" />}
              <span className="text-base font-semibold text-white">{seekFeedback === "fwd" ? "+10s" : "−10s"}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      <AnimatePresence>
        {showControls && status !== "error" && (
          <motion.div
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            className="absolute inset-x-0 bottom-0 z-20"
          >
            <div className="bg-gradient-to-t from-black/88 via-black/30 to-transparent px-4 pb-4 pt-16">
              {/* Progress bar */}
              <div
                className="group relative mb-3 cursor-pointer py-2"
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  setSeekTime(pct * duration); setSeeking(true);
                  const move = (ev: MouseEvent) => {
                    const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                    setSeekTime(p * duration);
                  };
                  const up = (ev: MouseEvent) => {
                    const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                    seekTo(p * duration); setSeeking(false);
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                  };
                  window.addEventListener("mousemove", move);
                  window.addEventListener("mouseup", up);
                }}
              >
                <div className={`relative h-1 w-full rounded-full bg-white/10 transition-all group-hover:h-1.5 ${seeking ? "h-1.5" : ""}`}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white/[0.18]" style={{ width: `${bufferedPct}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progressPct}%` }}>
                    <div className={`absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow transition group-hover:scale-100 ${seeking ? "scale-100" : "scale-0"}`} />
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                  <button onClick={togglePlay} className="hover:text-white/80" aria-label={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </button>
                  <button onClick={() => seekBy(-10)} className="hover:text-white/80" aria-label="Back 10s"><SkipBack className="h-5 w-5" /></button>
                  <button onClick={() => seekBy(10)} className="hover:text-white/80" aria-label="Forward 10s"><SkipForward className="h-5 w-5" /></button>
                  <button onClick={toggleMute} className="hover:text-white/80" aria-label="Mute">
                    {muted || volume === 0 ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                  </button>
                  <span className="font-mono text-sm tabular-nums text-white/80">
                    {fmtTime(displayTime)} <span className="text-white/30">/ {fmtTime(duration)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  {streams.length > 1 && <span className="text-xs text-white/40 hidden sm:inline">{activeStream?.label}</span>}
                  <button onClick={() => { setShowSourcePicker((s) => !s); setShowSettings(false); }} className={`hover:text-white/80 ${showSourcePicker ? "text-white" : "text-white/60"}`} aria-label="Choose source">
                    <Server className="h-6 w-6" />
                  </button>
                  <button onClick={() => { setShowSettings((s) => !s); setSettingsView("main"); setShowSourcePicker(false); }} className={`hover:text-white/80 ${showSettings ? "text-white" : "text-white/60"}`} aria-label="Settings">
                    <SettingsIcon className="h-6 w-6" />
                  </button>
                  <button onClick={toggleFullscreen} className="hover:text-white/80" aria-label="Fullscreen">
                    {fullscreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Source picker */}
      <AnimatePresence>
        {showSourcePicker && (
          <>
            <div className="absolute inset-0 z-35" onClick={() => setShowSourcePicker(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.93, y: 8 }}
              className="absolute bottom-20 right-4 z-36 w-56 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
            >
              <div className="border-b border-white/5 px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Sources</p>
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {sourceStates.map((s) => {
                  const idx = streams.findIndex((st) => st.source.split(" ")[0] === s.name || st.source.toLowerCase().includes(s.name));
                  const isActive = idx >= 0 && idx === activeIdx;
                  const available = s.status === "available" && idx >= 0;
                  const failed = s.status === "failed";
                  const testing = s.status === "testing";
                  return (
                    <button
                      key={s.name}
                      onClick={() => { if (available && idx >= 0) switchStream(idx); }}
                      disabled={testing || failed || !available}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                        isActive ? "bg-white/[0.08] text-white" : failed ? "text-white/28" : available ? "text-white/55 hover:bg-white/[0.05]" : "text-white/40"
                      } ${testing ? "cursor-wait" : ""}`}
                    >
                      <div className={`flex h-6 w-6 items-center justify-center rounded-lg flex-shrink-0 ${
                        isActive ? "bg-white/[0.18]" : testing ? "bg-white/[0.06]" : failed ? "bg-red-500/[0.12]" : "bg-white/[0.04]"
                      }`}>
                        {isActive ? <Check className="h-3 w-3 text-white" strokeWidth={2.5} /> :
                         testing ? <Loader2 className="h-2.5 w-2.5 animate-spin text-white/50" /> :
                         failed ? <X className="h-2.5 w-2.5 text-red-400" strokeWidth={2} /> :
                         <div className="h-2 w-2 rounded-full bg-white/30" />}
                      </div>
                      <span className="flex-1 truncate text-xs font-medium">{s.name}</span>
                    </button>
                  );
                })}
                {sourceStates.length === 0 && <p className="px-4 py-3 text-xs text-white/30">No sources found</p>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <>
            <div className="absolute inset-0 z-35" onClick={() => setShowSettings(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.93, y: 8 }}
              className="absolute bottom-20 right-4 z-36 w-64 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
                {settingsView !== "main" && (
                  <button onClick={() => setSettingsView("main")} className="text-white/40 hover:text-white/80"><ChevronLeft className="h-4 w-4" /></button>
                )}
                <p className="flex-1 text-sm font-semibold text-white">
                  {settingsView === "quality" ? "Quality" : settingsView === "server" ? "Select Source" : "Settings"}
                </p>
                <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto py-1.5">
                {settingsView === "main" && (
                  <>
                    <button onClick={() => setSettingsView("quality")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]">
                      <Gauge className="h-4 w-4 text-white/35" />
                      <span className="flex-1 text-sm font-medium text-white">Quality</span>
                      <span className="text-xs text-white/35">{currentQuality === "auto" ? "Auto" : currentQuality}</span>
                    </button>
                    <button onClick={() => setSettingsView("server")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]">
                      <Server className="h-4 w-4 text-white/35" />
                      <span className="flex-1 text-sm font-medium text-white">Server</span>
                      <span className="text-xs text-white/35">{activeProviderName}</span>
                    </button>
                  </>
                )}
                {settingsView === "quality" && (
                  <>
                    <button onClick={() => setQuality("auto")} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
                      <Check className={`h-4 w-4 ${currentQuality === "auto" ? "text-white" : "opacity-0"}`} />
                      <span className={currentQuality === "auto" ? "text-sm text-white" : "text-sm text-white/60"}>Auto</span>
                    </button>
                    {qualities.map((q) => (
                      <button key={q} onClick={() => setQuality(q)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
                        <Check className={`h-4 w-4 ${currentQuality === q ? "text-white" : "opacity-0"}`} />
                        <span className={currentQuality === q ? "text-sm text-white" : "text-sm text-white/60"}>{q}</span>
                      </button>
                    ))}
                    {qualities.length === 0 && uniqueQualities.map((q) => (
                      <button key={q} onClick={() => { const idx = streams.findIndex((s) => s.quality === q); if (idx >= 0) switchStream(idx); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
                        <Check className={`h-4 w-4 ${activeStream?.quality === q ? "text-white" : "opacity-0"}`} />
                        <span className={activeStream?.quality === q ? "text-sm text-white" : "text-sm text-white/60"}>{q}</span>
                      </button>
                    ))}
                  </>
                )}
                {settingsView === "server" && (
                  <>
                    {streams.map((s, i) => (
                      <button key={i} onClick={() => switchStream(i)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
                        <Check className={`h-4 w-4 ${i === activeIdx ? "text-white" : "opacity-0"}`} />
                        <span className={i === activeIdx ? "text-sm text-white" : "text-sm text-white/60"}>{s.label || s.source}</span>
                        {s.quality !== "Auto" && <span className="ml-auto text-xs text-white/30">{s.quality}</span>}
                      </button>
                    ))}
                    {streams.length === 0 && <p className="px-4 py-3 text-sm text-white/35">No streams available</p>}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

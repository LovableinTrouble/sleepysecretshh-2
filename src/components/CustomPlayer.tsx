/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  Maximize, Minimize, PictureInPicture, Download as DownloadIcon,
  Settings as SettingsIcon, Subtitles, ChevronLeft, ChevronRight,
  Loader2, SkipForward, Cast, X, List, RotateCcw,
} from "lucide-react";
import type { DirectSource, StreamQuality, StreamSubtitle } from "@/lib/streams";

interface Props {
  source: DirectSource;
  title: string;
  season?: number;
  episode?: number;
  startAt?: number;
  onProgress?: (currentTime: number, duration: number, ended: boolean) => void;
  onClose: () => void;
  onSelectSource?: () => void;
  onNextEpisode?: () => void;
  hasNext?: boolean;
  autoplay?: boolean;
  autoNext?: boolean;
}

type SubStyle = {
  fontSize: number;
  color: string;
  bg: number;      // 0-100 opacity for background box
  position: "bottom" | "middle" | "top";
  edge: "none" | "shadow" | "outline";
};

const DEFAULT_SUB: SubStyle = {
  fontSize: 22, color: "#ffffff", bg: 40, position: "bottom", edge: "shadow",
};

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function CustomPlayer({
  source, title, season, episode, startAt = 0,
  onProgress, onClose, onSelectSource, onNextEpisode, hasNext,
  autoplay = true, autoNext = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const currentQuality: StreamQuality | undefined = source.qualities[currentIdx];

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [rate, setRate] = useState(1);
  const [aspect, setAspect] = useState<"auto" | "16/9" | "4/3" | "cover">("auto");
  const [openPanel, setOpenPanel] = useState<null | "quality" | "speed" | "subs" | "sources" | "aspect">(null);
  const [subIdx, setSubIdx] = useState<number>(-1); // -1 = off
  const [subStyle, setSubStyle] = useState<SubStyle>(DEFAULT_SUB);
  const [hlsLevels, setHlsLevels] = useState<{ height: number; index: number }[]>([]);
  const [hlsLevel, setHlsLevel] = useState<number>(-1); // -1 = auto
  const [seekPreview, setSeekPreview] = useState<{ x: number; t: number } | null>(null);
  const [showNextToast, setShowNextToast] = useState(false);

  const hideTimer = useRef<number | null>(null);

  // Load stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentQuality) return;
    setLoading(true);
    setError(null);

    hlsRef.current?.destroy();
    hlsRef.current = null;

    const url = currentQuality.url;
    const isHls = currentQuality.format === "hls" || url.toLowerCase().includes(".m3u8");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsLevels(hls.levels.map((l, i) => ({ height: l.height, index: i })));
        if (startAt > 0) video.currentTime = startAt;
        if (autoplay) video.play().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => setHlsLevel(d.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setError("Playback error. Try switching quality or source.");
        }
      });
    } else {
      video.src = url;
      if (startAt > 0) video.currentTime = startAt;
      if (autoplay) video.play().catch(() => {});
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [currentIdx, currentQuality, autoplay, startAt]);

  // HLS level select
  useEffect(() => {
    if (hlsRef.current) hlsRef.current.currentLevel = hlsLevel;
  }, [hlsLevel]);

  // Video event listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setTime(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      onProgress?.(v.currentTime, v.duration, false);
    };
    const onDur = () => setDuration(v.duration);
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onEnded = () => {
      onProgress?.(v.duration, v.duration, true);
      if (autoNext && hasNext && onNextEpisode) {
        setShowNextToast(true);
        setTimeout(() => onNextEpisode(), 2500);
      }
    };
    const onErr = () => setError("Playback failed. Try another source.");
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onCanPlay);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onErr);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onCanPlay);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onErr);
    };
  }, [onProgress, autoNext, hasNext, onNextEpisode]);

  // Fullscreen tracking
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Auto-hide controls
  const kickHide = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => { kickHide(); }, [kickHide]);

  // Playback rate + volume/mute
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate]);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = muted;
    }
  }, [volume, muted]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((x) => Math.min(1, x + 0.1));
          setMuted(false);
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((x) => Math.max(0, x - 0.1));
          break;
        case "m":
          setMuted((x) => !x);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "p":
          togglePip();
          break;
        case "Escape":
          if (!document.fullscreenElement) onClose();
          break;
      }
      kickHide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, kickHide]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    v.paused ? v.play() : v.pause();
  };
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await wrapRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  };
  const togglePip = async () => {
    const v = videoRef.current; if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { /* ignore */ }
  };

  const onSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * duration;
  };
  const onSeekBarMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setSeekPreview({ x, t: (x / rect.width) * duration });
  };

  const skip = (delta: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + delta));
  };

  const volumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const activeSub = subIdx >= 0 ? source.subtitles[subIdx] : null;
  const subtitleUrl = useMemo(() => {
    if (!activeSub) return null;
    return `/api/public/subtitle?url=${encodeURIComponent(activeSub.url)}`;
  }, [activeSub]);

  const VolIcon = volumeIcon;

  const objectFit = aspect === "cover" ? "cover" : "contain";
  const aspectStyle: React.CSSProperties = aspect === "16/9"
    ? { aspectRatio: "16/9", height: "auto", maxHeight: "100%", margin: "auto" }
    : aspect === "4/3"
      ? { aspectRatio: "4/3", height: "auto", maxHeight: "100%", margin: "auto" }
      : { height: "100%", width: "100%" };

  const bgAlpha = Math.round((subStyle.bg / 100) * 255).toString(16).padStart(2, "0");
  const subShadow =
    subStyle.edge === "outline"
      ? "-1px 0 #000, 1px 0 #000, 0 -1px #000, 0 1px #000, -1px -1px #000, 1px 1px #000"
      : subStyle.edge === "shadow"
        ? "0 2px 6px rgba(0,0,0,0.9)"
        : "none";
  const subPosClass =
    subStyle.position === "top" ? "top-8 items-start" :
    subStyle.position === "middle" ? "top-1/2 -translate-y-1/2 items-center" :
    "bottom-24 items-end";

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full bg-black overflow-hidden"
      onMouseMove={kickHide}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "VIDEO") {
          togglePlay();
          kickHide();
        }
      }}
    >
      <video
        ref={videoRef}
        className="block"
        style={{ ...aspectStyle, objectFit }}
        playsInline
        crossOrigin="anonymous"
        preload="metadata"
      >
        {subtitleUrl && activeSub && (
          <track
            key={subtitleUrl}
            kind="subtitles"
            src={subtitleUrl}
            srcLang={activeSub.language}
            label={activeSub.label}
            default
          />
        )}
      </video>

      {/* Custom subtitle renderer (overrides native for style control) */}
      {activeSub && (
        <SubtitleRenderer
          videoRef={videoRef}
          src={subtitleUrl!}
          style={{
            fontSize: subStyle.fontSize,
            color: subStyle.color,
            background: `#000000${bgAlpha}`,
            textShadow: subShadow,
          }}
          posClass={subPosClass}
        />
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-full bg-black/40 p-4 backdrop-blur-md">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 backdrop-blur-md">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-card/90 p-6 text-center">
            <p className="text-sm text-white/80">{error}</p>
            <div className="mt-4 flex gap-2 justify-center">
              <button
                onClick={() => { setError(null); setCurrentIdx(currentIdx); }}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                <RotateCcw className="inline h-3 w-3 mr-1" /> Retry
              </button>
              {onSelectSource && (
                <button
                  onClick={onSelectSource}
                  className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white"
                >
                  Change source
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-next toast */}
      {showNextToast && (
        <div className="absolute bottom-24 right-6 rounded-full bg-primary/90 px-4 py-2 text-xs font-semibold text-primary-foreground animate-fade-in">
          Next episode in a moment…
        </div>
      )}

      {/* Top gradient + title bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-4 py-3 transition-opacity ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-black/80"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-white">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            {season != null && episode != null && (
              <p className="text-[11px] text-white/60">S{season} · E{episode}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/30">
            {source.badge}
          </span>
        </div>
      </div>

      {/* Bottom gradient + controls */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 to-transparent transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-10 px-4 pb-4 transition-opacity ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress bar */}
        <div
          className="group relative h-6 cursor-pointer"
          onClick={onSeekBarClick}
          onMouseMove={onSeekBarMove}
          onMouseLeave={() => setSeekPreview(null)}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20 group-hover:h-1.5">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/30"
              style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${duration ? (time / duration) * 100 : 0}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100"
              style={{ left: `${duration ? (time / duration) * 100 : 0}%` }}
            />
          </div>
          {seekPreview && (
            <div
              className="pointer-events-none absolute -top-8 rounded bg-black/80 px-2 py-0.5 text-[10px] text-white ring-1 ring-white/20"
              style={{ left: seekPreview.x, transform: "translateX(-50%)" }}
            >
              {fmt(seekPreview.t)}
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="mt-1 flex items-center gap-2 text-white">
          <IconBtn onClick={togglePlay} label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </IconBtn>
          <IconBtn onClick={() => skip(-10)} label="Back 10s">
            <div className="relative">
              <RotateCcw className="h-5 w-5" />
              <span className="absolute inset-0 grid place-items-center text-[8px] font-bold">10</span>
            </div>
          </IconBtn>
          <IconBtn onClick={() => skip(10)} label="Forward 10s">
            <div className="relative">
              <RotateCcw className="h-5 w-5 -scale-x-100" />
              <span className="absolute inset-0 grid place-items-center text-[8px] font-bold">10</span>
            </div>
          </IconBtn>

          {/* Volume */}
          <div className="group/vol flex items-center">
            <IconBtn onClick={() => setMuted((x) => !x)} label={muted ? "Unmute" : "Mute"}>
              <VolIcon className="h-5 w-5" />
            </IconBtn>
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
              className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 group-hover/vol:ml-2 transition-all accent-primary"
            />
          </div>

          <div className="ml-1 text-[11px] font-mono text-white/80 tabular-nums">
            {fmt(time)} <span className="text-white/40">/ {fmt(duration)}</span>
          </div>

          <div className="flex-1" />

          {hasNext && (
            <IconBtn onClick={onNextEpisode} label="Next episode">
              <SkipForward className="h-5 w-5" />
            </IconBtn>
          )}
          {source.subtitles.length > 0 && (
            <IconBtn onClick={() => setOpenPanel(openPanel === "subs" ? null : "subs")} label="Subtitles" active={subIdx >= 0}>
              <Subtitles className="h-5 w-5" />
            </IconBtn>
          )}
          {onSelectSource && (
            <IconBtn onClick={onSelectSource} label="Sources">
              <List className="h-5 w-5" />
            </IconBtn>
          )}
          <IconBtn onClick={() => setOpenPanel(openPanel === "quality" ? null : "quality")} label="Quality">
            <span className="text-[10px] font-bold px-1">
              {hlsLevel >= 0 && hlsLevels[hlsLevel] ? `${hlsLevels[hlsLevel].height}p` : "AUTO"}
            </span>
          </IconBtn>
          <IconBtn onClick={() => setOpenPanel(openPanel === "speed" ? null : "speed")} label="Speed">
            <span className="text-[10px] font-bold px-1">{rate}×</span>
          </IconBtn>
          <IconBtn onClick={() => setOpenPanel(openPanel === "aspect" ? null : "aspect")} label="Aspect ratio">
            <SettingsIcon className="h-5 w-5" />
          </IconBtn>
          {currentQuality && (
            <a
              href={`/api/public/download?url=${encodeURIComponent(currentQuality.url)}`}
              target="_blank" rel="noreferrer noopener"
              className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white transition"
              title="Download"
              onClick={(e) => e.stopPropagation()}
            >
              <DownloadIcon className="h-5 w-5" />
            </a>
          )}
          <IconBtn onClick={() => alert("Cast — coming soon")} label="Cast">
            <Cast className="h-5 w-5" />
          </IconBtn>
          <IconBtn onClick={togglePip} label="Picture in picture">
            <PictureInPicture className="h-5 w-5" />
          </IconBtn>
          <IconBtn onClick={toggleFullscreen} label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </IconBtn>
        </div>
      </div>

      {/* Panels */}
      {openPanel === "quality" && (
        <Panel title="Quality" onClose={() => setOpenPanel(null)}>
          {hlsLevels.length > 0 ? (
            <>
              <PanelItem active={hlsLevel === -1} onClick={() => { setHlsLevel(-1); setOpenPanel(null); }}>Auto</PanelItem>
              {[...hlsLevels].reverse().map((l) => (
                <PanelItem key={l.index} active={hlsLevel === l.index} onClick={() => { setHlsLevel(l.index); setOpenPanel(null); }}>
                  {l.height}p
                </PanelItem>
              ))}
            </>
          ) : (
            source.qualities.map((q, i) => (
              <PanelItem key={q.url} active={i === currentIdx} onClick={() => { setCurrentIdx(i); setOpenPanel(null); }}>
                {q.label} <span className="text-white/40 ml-2 text-[10px]">{q.format.toUpperCase()}</span>
              </PanelItem>
            ))
          )}
        </Panel>
      )}
      {openPanel === "speed" && (
        <Panel title="Playback speed" onClose={() => setOpenPanel(null)}>
          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
            <PanelItem key={r} active={rate === r} onClick={() => { setRate(r); setOpenPanel(null); }}>{r}×</PanelItem>
          ))}
        </Panel>
      )}
      {openPanel === "aspect" && (
        <Panel title="Aspect ratio" onClose={() => setOpenPanel(null)}>
          {(["auto", "16/9", "4/3", "cover"] as const).map((a) => (
            <PanelItem key={a} active={aspect === a} onClick={() => { setAspect(a); setOpenPanel(null); }}>
              {a === "auto" ? "Auto (fit)" : a === "cover" ? "Fill" : a}
            </PanelItem>
          ))}
        </Panel>
      )}
      {openPanel === "subs" && (
        <Panel title="Subtitles" onClose={() => setOpenPanel(null)} wide>
          <PanelItem active={subIdx === -1} onClick={() => setSubIdx(-1)}>Off</PanelItem>
          {source.subtitles.map((s, i) => (
            <PanelItem key={i} active={subIdx === i} onClick={() => setSubIdx(i)}>
              {s.label} <span className="text-white/40 ml-2 text-[10px]">{s.language.toUpperCase()}</span>
            </PanelItem>
          ))}
          {subIdx >= 0 && (
            <div className="mt-3 border-t border-white/10 pt-3 space-y-3">
              <SubStyleControls value={subStyle} onChange={setSubStyle} />
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────── */

function IconBtn({
  onClick, children, label, active,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={label}
      aria-label={label}
      className={`grid h-9 w-9 place-items-center rounded-full transition ${
        active ? "bg-primary text-primary-foreground" : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Panel({
  title, onClose, children, wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`absolute bottom-20 right-4 z-20 ${wide ? "w-80" : "w-56"} max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/90 p-2 backdrop-blur-xl animate-scale-in`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2 pb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">{title}</p>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>
      </div>
      {children}
    </div>
  );
}

function PanelItem({
  active, onClick, children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
        active ? "bg-primary text-primary-foreground" : "text-white/80 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function SubStyleControls({ value, onChange }: { value: SubStyle; onChange: (v: SubStyle) => void }) {
  return (
    <div className="space-y-2 px-2 text-white/80">
      <label className="block text-[10px] uppercase tracking-widest text-white/40">Size</label>
      <input
        type="range" min={12} max={48} step={1}
        value={value.fontSize}
        onChange={(e) => onChange({ ...value, fontSize: parseInt(e.target.value) })}
        className="w-full accent-primary"
      />
      <label className="block text-[10px] uppercase tracking-widest text-white/40">Color</label>
      <div className="flex gap-1.5 flex-wrap">
        {["#ffffff", "#ffd54a", "#7cf49c", "#f472b6", "#60a5fa"].map((c) => (
          <button
            key={c}
            onClick={() => onChange({ ...value, color: c })}
            className={`h-6 w-6 rounded-full ring-2 ${value.color === c ? "ring-primary" : "ring-white/20"}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <label className="block text-[10px] uppercase tracking-widest text-white/40">Background</label>
      <input
        type="range" min={0} max={100} step={5}
        value={value.bg}
        onChange={(e) => onChange({ ...value, bg: parseInt(e.target.value) })}
        className="w-full accent-primary"
      />
      <label className="block text-[10px] uppercase tracking-widest text-white/40">Position</label>
      <div className="flex gap-1">
        {(["top", "middle", "bottom"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onChange({ ...value, position: p })}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] ${value.position === p ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <label className="block text-[10px] uppercase tracking-widest text-white/40">Edge</label>
      <div className="flex gap-1">
        {(["none", "shadow", "outline"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onChange({ ...value, edge: p })}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] ${value.edge === p ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders subtitle cues from a WebVTT src with custom styling.
 * We hide the native <track> rendering by not marking it default here,
 * but the browser still renders default track — so we set `mode = "hidden"`.
 */
function SubtitleRenderer({
  videoRef, src, style, posClass,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string;
  style: React.CSSProperties;
  posClass: string;
}) {
  const [cue, setCue] = useState<string>("");
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const trackList = v.textTracks;
    // Hide native rendering
    const setHidden = () => {
      for (let i = 0; i < trackList.length; i++) trackList[i].mode = "hidden";
    };
    setHidden();
    const handler = () => {
      let text = "";
      for (let i = 0; i < trackList.length; i++) {
        const t = trackList[i];
        if (t.mode !== "hidden") continue;
        const active = t.activeCues;
        if (!active) continue;
        for (let j = 0; j < active.length; j++) {
          const c = active[j] as VTTCue;
          text += (text ? "\n" : "") + c.text;
        }
      }
      setCue(text.replace(/<[^>]+>/g, ""));
    };
    // attach cuechange to each track
    const attach = () => {
      setHidden();
      for (let i = 0; i < trackList.length; i++) {
        trackList[i].addEventListener("cuechange", handler);
      }
    };
    attach();
    trackList.addEventListener("addtrack", attach);
    return () => {
      for (let i = 0; i < trackList.length; i++) {
        trackList[i].removeEventListener("cuechange", handler);
      }
      trackList.removeEventListener("addtrack", attach);
    };
  }, [videoRef, src]);

  if (!cue) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex flex-col ${posClass} px-6 z-[5]`}>
      <div className="mx-auto max-w-3xl text-center">
        {cue.split("\n").map((line, i) => (
          <span
            key={i}
            className="inline-block rounded px-3 py-1 my-0.5 font-semibold leading-snug"
            style={style}
          >
            {line}
          </span>
        )).reduce<React.ReactNode[]>((acc, el, i) => {
          if (i > 0) acc.push(<br key={`br-${i}`} />);
          acc.push(el);
          return acc;
        }, [])}
      </div>
    </div>
  );
}
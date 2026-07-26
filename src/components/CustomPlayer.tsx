/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  Maximize, Minimize, PictureInPicture, Download as DownloadIcon,
  Settings as SettingsIcon, Subtitles, ChevronLeft, ChevronRight,
  Loader2, SkipForward, Cast, X, RotateCcw, Monitor,
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
  bg: number;
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
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function CustomPlayer({
  source, title, season, episode, startAt = 0,
  onProgress, onClose, onSelectSource, onNextEpisode, hasNext,
  autoplay = true, autoNext = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);

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
  const [openPanel, setOpenPanel] = useState<null | "settings" | "subs">(null);
  const [settingsTab, setSettingsTab] = useState<"quality" | "speed" | "aspect" | "source">("quality");
  const [subIdx, setSubIdx] = useState<number>(-1);
  const [subStyle, setSubStyle] = useState<SubStyle>(DEFAULT_SUB);
  const [hlsLevels, setHlsLevels] = useState<{ height: number; index: number }[]>([]);
  const [hlsLevel, setHlsLevel] = useState<number>(-1);
  const [seekPreview, setSeekPreview] = useState<{ x: number; t: number } | null>(null);
  const [showNextToast, setShowNextToast] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  const hideTimer = useRef<number | null>(null);
  const seekAmountRef = useRef(0);

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

    let cancelled = false;

    if (isHls) {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) {
          if (!cancelled) { video.src = url; if (startAt > 0) video.currentTime = startAt; if (autoplay) video.play().catch(() => {}); }
          return;
        }
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setHlsLevels(hls.levels.map((l: any, i: number) => ({ height: l.height, index: i })));
          if (startAt > 0) video.currentTime = startAt;
          if (autoplay) video.play().catch(() => {});
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e: any, d: any) => setHlsLevel(d.level));
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else setError("Playback error. Try switching quality or source.");
          }
        });
      }).catch(() => {
        if (!cancelled) { video.src = url; if (startAt > 0) video.currentTime = startAt; if (autoplay) video.play().catch(() => {}); }
      });
    } else {
      video.src = url;
      if (startAt > 0) video.currentTime = startAt;
      if (autoplay) video.play().catch(() => {});
    }
    return () => { cancelled = true; hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [currentIdx, currentQuality, autoplay, startAt]);

  useEffect(() => { if (hlsRef.current) hlsRef.current.currentLevel = hlsLevel; }, [hlsLevel]);

  // Video events
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
    v.addEventListener("play", onPlay); v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime); v.addEventListener("durationchange", onDur);
    v.addEventListener("waiting", onWaiting); v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onCanPlay); v.addEventListener("ended", onEnded);
    v.addEventListener("error", onErr);
    return () => {
      v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime); v.removeEventListener("durationchange", onDur);
      v.removeEventListener("waiting", onWaiting); v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onCanPlay); v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onErr);
    };
  }, [onProgress, autoNext, hasNext, onNextEpisode]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Subtitle track management
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = "hidden";
    if (subIdx >= 0 && subIdx < tracks.length) tracks[subIdx].mode = "showing";
  }, [subIdx, loading]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); v.paused ? v.play() : v.pause(); break;
        case "ArrowLeft": v.currentTime -= 10; flashControls(); break;
        case "ArrowRight": v.currentTime += 10; flashControls(); break;
        case "ArrowUp": e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); setVolume(v.volume); setMuted(false); break;
        case "ArrowDown": e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); setVolume(v.volume); break;
        case "m": setMuted((m) => { v.muted = !m; return !m; }); break;
        case "f": toggleFullscreen(); break;
        case "j": v.currentTime -= 10; break;
        case "l": v.currentTime += 10; break;
        case "p": togglePip(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function flashControls() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowControls(false), 3000);
  }

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen();
  };

  const togglePip = async () => {
    const v = videoRef.current; if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
  };

  const toggleCast = async () => {
    const v = videoRef.current; if (!v) return;
    try {
      const media = v as any;
      if (media.webkitPresentationMode !== undefined) {
        if (media.webkitSupportsPresentationMode?.("picture-in-picture")) media.webkitSetPresentationMode("picture-in-picture");
      }
    } catch {}
  };

  const handleDownload = () => {
    if (!currentQuality) return;
    const a = document.createElement("a");
    a.href = currentQuality.url;
    a.download = title;
    a.target = "_blank";
    a.click();
  };

  // Seek bar
  const onSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * duration;
  };

  const onSeekMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekPreview({ x: e.clientX - rect.left, t: pct * duration });
    if (scrubbing) v.currentTime = pct * duration;
  };

  // Volume
  const onVolChange = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.volume = pct; setVolume(pct); setMuted(pct === 0);
  };

  const subPosBottom = subStyle.position === "bottom" ? "8%" : subStyle.position === "middle" ? "45%" : "82%";

  const progressPct = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-black select-none"
      onMouseMove={flashControls}
      onMouseLeave={() => { if (!openPanel) setShowControls(false); }}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "VIDEO") {
          if (openPanel) { setOpenPanel(null); return; }
          togglePlay();
        }
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="h-full w-full"
        style={{
          objectFit: aspect === "cover" ? "cover" : "contain",
          aspectRatio: aspect === "auto" ? undefined : aspect === "16/9" ? "16 / 9" : "4 / 3",
        }}
        playsInline
        crossOrigin="anonymous"
      >
        {source.subtitles.map((sub, i) => (
          <track key={i} kind="subtitles" src={sub.url} srcLang={sub.language} label={sub.label} />
        ))}
      </video>

      {/* Subtitle overlay */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center transition-all"
        style={{ bottom: subPosBottom }}
      >
        <style>{`
          .sub-text {
            font-size: ${subStyle.fontSize}px;
            color: ${subStyle.color};
            background: ${subStyle.bg > 0 ? `rgba(0,0,0,${subStyle.bg / 100})` : "transparent"};
            padding: 2px 8px;
            border-radius: 4px;
            text-shadow: ${subStyle.edge === "shadow" ? "0 2px 4px rgba(0,0,0,0.8)" : subStyle.edge === "outline" ? "-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000" : "none"};
            line-height: 1.4;
            text-align: center;
            max-width: 80%;
          }
        `}</style>
        {subIdx >= 0 && (
          <div className="sub-text" dangerouslySetInnerHTML={{ __html: "" }} id="sub-container" />
        )}
      </div>

      {/* Loading spinner */}
      {loading && !error && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 backdrop-blur-sm">
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white/80 animate-spin" style={{ animationDuration: "0.8s" }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/80">
          <div className="text-center">
            <p className="mb-3 text-sm text-white/70">{error}</p>
            <button onClick={() => { setError(null); setCurrentIdx((i) => Math.min(i + 1, source.qualities.length - 1)); }}
              className="rounded-lg bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20 transition">
              Try next quality
            </button>
          </div>
        </div>
      )}

      {/* Skip toast */}
      {showNextToast && (
        <div className="absolute right-6 bottom-24 z-30 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" style={{ animationDuration: "2.5s" }} />
          </div>
          <span className="text-xs font-medium text-white">Next episode in 2s…</span>
          <button onClick={() => setShowNextToast(false)} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] text-white hover:bg-white/20">Cancel</button>
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────── */}
      <div
        className={`absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"}`}
      >
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white backdrop-blur-md hover:bg-white/15 transition" aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          {season != null && episode != null && (
            <p className="truncate text-[11px] text-white/50">S{season} · E{episode}</p>
          )}
        </div>
        <button onClick={togglePip} className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white backdrop-blur-md hover:bg-white/15 transition" aria-label="PiP">
          <PictureInPicture className="h-4 w-4" />
        </button>
        <button onClick={toggleCast} className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white backdrop-blur-md hover:bg-white/15 transition" aria-label="Cast">
          <Cast className="h-4 w-4" />
        </button>
      </div>

      {/* ── Center play button ───────────────────────── */}
      {!loading && !error && (
        <button
          onClick={togglePlay}
          className={`absolute left-1/2 top-1/2 z-15 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${showControls && !playing ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"}`}
          aria-label={playing ? "Pause" : "Play"}
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 backdrop-blur-xl ring-1 ring-white/20 hover:bg-white/20 transition">
            {playing ? <Pause className="h-7 w-7 text-white" /> : <Play className="h-7 w-7 translate-x-0.5 text-white" />}
          </div>
        </button>
      )}

      {/* ── Bottom controls ──────────────────────────── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-12 pb-3 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}
      >
        {/* Seek bar */}
        <div
          className="group relative mb-2 h-1.5 cursor-pointer rounded-full bg-white/15"
          onClick={onSeekClick}
          onMouseMove={onSeekMove}
          onMouseEnter={() => setSeekPreview((p) => p)}
          onMouseLeave={() => setSeekPreview(null)}
          onMouseDown={() => setScrubbing(true)}
          onMouseUp={() => setScrubbing(false)}
        >
          {/* Buffered */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${bufferedPct}%` }} />
          {/* Progress */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-75" style={{ width: `${progressPct}%` }} />
          {/* Scrub dot */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-lg opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `calc(${progressPct}% - 6px)` }}
          />
          {/* Hover preview */}
          {seekPreview && (
            <div className="absolute bottom-5 -translate-x-1/2 rounded-md bg-black/90 px-2 py-1 text-[10px] font-medium text-white whitespace-nowrap" style={{ left: seekPreview.x }}>
              {fmt(seekPreview.t)}
            </div>
          )}
        </div>

        {/* Control row */}
        <div className="flex items-center gap-1">
          {/* Play/pause */}
          <button onClick={togglePlay} className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10 transition" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
          </button>

          {/* Rewind 10s */}
          <button onClick={() => { const v = videoRef.current; if (v) v.currentTime -= 10; }} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition" aria-label="Rewind 10s">
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Forward 10s */}
          <button onClick={() => { const v = videoRef.current; if (v) v.currentTime += 10; }} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition" aria-label="Forward 10s">
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Volume */}
          <div className="group/vol flex items-center gap-1">
            <button
              onClick={() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }}
              className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10 transition"
              aria-label="Mute"
            >
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : volume < 0.5 ? <Volume1 className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <div
              className="relative h-1 w-0 cursor-pointer rounded-full bg-white/20 overflow-hidden transition-all duration-200 group-hover/vol:w-16"
              onClick={onVolChange}
            >
              <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
            </div>
          </div>

          {/* Time */}
          <span className="ml-2 text-[11px] font-medium tabular-nums text-white/70">
            {fmt(time)} <span className="text-white/30">/</span> {fmt(duration)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Next episode */}
          {hasNext && (
            <button onClick={() => onNextEpisode?.()} className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10 transition" aria-label="Next episode">
              <SkipForward className="h-4 w-4" />
            </button>
          )}

          {/* Subtitles */}
          <button
            onClick={() => setOpenPanel(openPanel === "subs" ? null : "subs")}
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${subIdx >= 0 ? "text-white bg-white/10" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            aria-label="Subtitles"
          >
            <Subtitles className="h-4 w-4" />
          </button>

          {/* Settings cog */}
          <button
            onClick={() => setOpenPanel(openPanel === "settings" ? null : "settings")}
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${openPanel === "settings" ? "text-white bg-white/10" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            aria-label="Settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>

          {/* Download */}
          <button onClick={handleDownload} className="grid h-9 w-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition" aria-label="Download">
            <DownloadIcon className="h-4 w-4" />
          </button>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10 transition" aria-label="Fullscreen">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Settings panel ───────────────────────────── */}
      {openPanel === "settings" && (
        <div className="absolute right-4 bottom-16 z-30 w-72 rounded-2xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-2xl">
          {/* Tabs */}
          <div className="mb-3 flex gap-1 rounded-xl bg-white/5 p-1">
            {([
              ["quality", "Quality"],
              ["speed", "Speed"],
              ["aspect", "Aspect"],
              ["source", "Source"],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setSettingsTab(tab)}
                className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${settingsTab === tab ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Quality tab */}
          {settingsTab === "quality" && (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {/* HLS adaptive levels */}
              {hlsLevels.length > 0 && (
                <button
                  onClick={() => setHlsLevel(-1)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition ${hlsLevel === -1 ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}
                >
                  <span>Auto</span>
                  {hlsLevel === -1 && <span className="text-[10px] text-white/40">●</span>}
                </button>
              )}
              {hlsLevels.map((lvl) => (
                <button
                  key={lvl.index}
                  onClick={() => setHlsLevel(lvl.index)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition ${hlsLevel === lvl.index ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}
                >
                  <span>{lvl.height}p</span>
                  {hlsLevel === lvl.index && <span className="text-[10px] text-white/40">●</span>}
                </button>
              ))}
              {/* Source qualities */}
              <div className="my-1 border-t border-white/8" />
              <p className="px-3 py-1 text-[10px] uppercase tracking-widest text-white/30">Sources</p>
              {source.qualities.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrentIdx(i); setHlsLevels([]); }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition ${currentIdx === i ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}
                >
                  <span className="truncate">{q.label}</span>
                  <span className="text-[9px] uppercase text-white/30">{q.format}</span>
                </button>
              ))}
            </div>
          )}

          {/* Speed tab */}
          {settingsTab === "speed" && (
            <div className="grid grid-cols-3 gap-1.5">
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                <button
                  key={r}
                  onClick={() => { setRate(r); const v = videoRef.current; if (v) v.playbackRate = r; }}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${rate === r ? "bg-white/15 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                >
                  {r === 1 ? "1x" : `${r}x`}
                </button>
              ))}
            </div>
          )}

          {/* Aspect tab */}
          {settingsTab === "aspect" && (
            <div className="space-y-0.5">
              {([["auto", "Auto"], ["16/9", "16:9"], ["4/3", "4:3"], ["cover", "Fill"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setAspect(val)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${aspect === val ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Source tab */}
          {settingsTab === "source" && (
            <div className="space-y-0.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[10px] uppercase tracking-widest text-white/30">Current source</span>
                <span className="text-[10px] text-white/50">{source.qualities.length} streams</span>
              </div>
              <button
                onClick={() => onSelectSource?.()}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/15 transition"
              >
                Switch source provider
              </button>
              <div className="mt-2 rounded-lg bg-white/5 px-3 py-2">
                <p className="text-[10px] text-white/40">Active: {currentQuality?.label}</p>
                <p className="text-[10px] text-white/40">Format: {currentQuality?.format.toUpperCase()}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Subtitle panel ───────────────────────────── */}
      {openPanel === "subs" && (
        <div className="absolute right-4 bottom-16 z-30 w-64 rounded-2xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-2xl">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/30">Subtitles</p>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            <button
              onClick={() => setSubIdx(-1)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition ${subIdx === -1 ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}
            >
              <span>Off</span>
              {subIdx === -1 && <span className="text-[10px]">●</span>}
            </button>
            {source.subtitles.map((sub, i) => (
              <button
                key={i}
                onClick={() => setSubIdx(i)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition ${subIdx === i ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}
              >
                <span>{sub.label}</span>
                {subIdx === i && <span className="text-[10px]">●</span>}
              </button>
            ))}
          </div>

          {/* Subtitle styling */}
          {subIdx >= 0 && (
            <div className="mt-3 border-t border-white/8 pt-3">
              <p className="mb-2 text-[10px] uppercase tracking-widest text-white/30">Style</p>
              {/* Size */}
              <div className="mb-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-white/50">
                  <span>Size</span><span>{subStyle.fontSize}px</span>
                </div>
                <input
                  type="range" min={12} max={48} value={subStyle.fontSize}
                  onChange={(e) => setSubStyle({ ...subStyle, fontSize: +e.target.value })}
                  className="w-full accent-white"
                />
              </div>
              {/* Color */}
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] text-white/50">Color</span>
                <input
                  type="color" value={subStyle.color}
                  onChange={(e) => setSubStyle({ ...subStyle, color: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent"
                />
              </div>
              {/* Background */}
              <div className="mb-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-white/50">
                  <span>Background</span><span>{subStyle.bg}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={subStyle.bg}
                  onChange={(e) => setSubStyle({ ...subStyle, bg: +e.target.value })}
                  className="w-full accent-white"
                />
              </div>
              {/* Position */}
              <div className="mb-2 flex gap-1">
                {(["bottom", "middle", "top"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setSubStyle({ ...subStyle, position: pos })}
                    className={`flex-1 rounded-lg py-1.5 text-[10px] font-semibold capitalize transition ${subStyle.position === pos ? "bg-white/15 text-white" : "bg-white/5 text-white/50"}`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              {/* Edge */}
              <div className="flex gap-1">
                {(["none", "shadow", "outline"] as const).map((edge) => (
                  <button
                    key={edge}
                    onClick={() => setSubStyle({ ...subStyle, edge })}
                    className={`flex-1 rounded-lg py-1.5 text-[10px] font-semibold capitalize transition ${subStyle.edge === edge ? "bg-white/15 text-white" : "bg-white/5 text-white/50"}`}
                  >
                    {edge}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Keyboard hint (briefly on load) ─────────── */}
      {showControls && !loading && time < 3 && (
        <div className="absolute left-4 bottom-20 z-15 hidden items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-[10px] text-white/40 backdrop-blur-md sm:flex">
          <kbd className="rounded bg-white/10 px-1.5 py-0.5">←→</kbd> 10s
          <kbd className="rounded bg-white/10 px-1.5 py-0.5">Space</kbd> Play
          <kbd className="rounded bg-white/10 px-1.5 py-0.5">F</kbd> Fullscreen
        </div>
      )}
    </div>
  );
}

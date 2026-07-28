/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  Maximize, Minimize, PictureInPicture, Download as DownloadIcon,
  Settings as SettingsIcon, Subtitles, ChevronLeft,
  SkipForward, Cast, RotateCcw, Monitor, Palette,
  SlidersHorizontal, Server as ServerIcon, Gauge, Check as CheckIcon, X as XIcon,
} from "lucide-react";
import type { DirectSource, StreamQuality, StreamSubtitle, ProviderId } from "@/lib/streams";
import { getSettings, useSettings, type Settings } from "@/lib/store";

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
  onDownload?: () => void;
  servers?: Array<{ id: ProviderId; name: string; status: "pending" | "checking" | "ready" | "failed"; count: number }>;
  activeServer?: ProviderId;
  onSwitchServer?: (id: ProviderId) => void;
}

type SubStyle = {
  fontSize: number;
  color: string;
  bg: number;
  position: "bottom" | "middle" | "top";
  edge: "none" | "shadow" | "outline";
};

type AspectMode = "contain" | "cover" | "stretch";

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

function pickStartupQualityIndex(qualities: StreamQuality[]): number {
  if (!qualities.length) return 0;
  return 0;
}

function qualityKey(quality: StreamQuality): string {
  const label = (quality.quality || "Auto").toLowerCase().replace(/\s+\d+$/, "").trim();
  if (quality.resolution) return String(quality.resolution);
  if (/4k|uhd/.test(label)) return "2160";
  const parsed = label.match(/(\d{3,4})p?/);
  if (parsed) return parsed[1] ?? label;
  return label.startsWith("auto") ? "auto" : label;
}

function displayQualityLabel(quality: StreamQuality): string {
  const key = qualityKey(quality);
  if (key === "auto") return "Auto";
  if (key === "2160") return "4K";
  if (/^\d{3,4}$/.test(key)) return `${key}p`;
  return quality.quality || "Auto";
}

function qualityRankValue(quality: StreamQuality): number {
  const key = qualityKey(quality);
  if (key === "auto") return Number.MAX_SAFE_INTEGER;
  return Number(key) || 0;
}

function pickPreferredSourceQuality(group: Array<{ quality: StreamQuality; index: number }>, currentResolution?: number): number | undefined {
  if (!group.length) return undefined;
  if (currentResolution) {
    const sameResolution = group.find((item) => item.quality.resolution === currentResolution);
    if (sameResolution) return sameResolution.index;
  }
  const auto = group.find((item) => qualityKey(item.quality) === "auto");
  if (auto) return auto.index;
  const pref = getSettings().player.quality;
  const target = pref === "4k" ? 2160 : pref === "1080p" ? 1080 : pref === "720p" ? 720 : 720;
  const ranked = group
    .map(({ quality, index }) => {
      const resolution = quality.resolution ?? (/4k|uhd/i.test(quality.quality) ? 2160 : Number(quality.quality.match(/(\d{3,4})/)?.[1] ?? 0));
      return { index, score: Math.abs((resolution || target) - target) };
    })
    .sort((a, b) => a.score - b.score);
  return ranked[0]?.index ?? group[0]?.index;
}

export function CustomPlayer({
  source, title, season, episode, startAt = 0,
  onProgress, onClose, onSelectSource, onNextEpisode, hasNext,
  autoplay = true, autoNext = true, onDownload,
  servers, activeServer, onSwitchServer,
}: Props) {
  const [settings, setSettings] = useSettings();
  const playerPrefs = settings.player;
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);

  const [currentIdx, setCurrentIdx] = useState(() => pickStartupQualityIndex(source.qualities));
  const sourceGroups = useMemo(() => {
    const groups: Array<{ id: string; name: string; qualities: Array<{ quality: StreamQuality; index: number }> }> = [];
    const indexById = new Map<string, number>();
    const seenById = new Map<string, Set<string>>();
    source.qualities.forEach((quality, index) => {
      const id = quality.sourceId ?? quality.label ?? `source-${index}`;
      const name = quality.sourceName ?? quality.label ?? "Source";
      const key = qualityKey(quality);
      const existing = indexById.get(id);
      if (existing === undefined) {
        indexById.set(id, groups.length);
        seenById.set(id, new Set([key]));
        groups.push({ id, name, qualities: [{ quality, index }] });
        return;
      }
      const seen = seenById.get(id);
      if (seen?.has(key)) return;
      seen?.add(key);
      groups[existing]?.qualities.push({ quality, index });
    });
    return groups.map((group) => ({
      ...group,
      qualities: [...group.qualities].sort((a, b) => qualityRankValue(b.quality) - qualityRankValue(a.quality)),
    }));
  }, [source.qualities]);
  const sourceGroupsRef = useRef(sourceGroups);
  const currentQuality: StreamQuality | undefined = source.qualities[currentIdx];
  const currentSourceGroup = sourceGroups.find((group) => group.qualities.some((item) => item.index === currentIdx));
  const currentSourceQualities = useMemo(() => currentSourceGroup?.qualities ?? [], [currentSourceGroup]);

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
  const [rate, setRate] = useState(() => getSettings().player.defaultSpeed || 1);
  const [aspect, setAspect] = useState<AspectMode>(() => getSettings().player.fillMode || "contain");
  const [openPanel, setOpenPanel] = useState<null | "settings">(null);
  const [settingsTab, setSettingsTab] = useState<"quality" | "subs" | "servers" | "speed">("quality");
  const [subIdx, setSubIdx] = useState<number>(-1);
  const [subStyle, setSubStyle] = useState<SubStyle>(DEFAULT_SUB);
  const [hlsLevels, setHlsLevels] = useState<{ height: number; index: number }[]>([]);
  const [hlsLevel, setHlsLevel] = useState<number>(-1);
  const [seekPreview, setSeekPreview] = useState<{ x: number; t: number } | null>(null);
  const [showNextToast, setShowNextToast] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  const hideTimer = useRef<number | null>(null);
  const loadGuardRef = useRef<number | null>(null);
  const attemptedRef = useRef<Set<number>>(new Set());
  const seekAmountRef = useRef(0);
  const errorHitsRef = useRef(0);
  const stallRef = useRef({ time: 0, hits: 0 });

  useEffect(() => {
    sourceGroupsRef.current = sourceGroups;
    if (error && sourceGroups.some((group) => group.qualities.some((item) => !attemptedRef.current.has(item.index)))) {
      failoverToNext();
    }
  }, [sourceGroups]);

  useEffect(() => {
    if (!source.qualities[currentIdx] && source.qualities.length) setCurrentIdx(pickStartupQualityIndex(source.qualities));
  }, [currentIdx, source.qualities]);

  const savePlayerPref = useCallback((patch: Partial<Settings["player"]>) => {
    setSettings({ player: { ...getSettings().player, ...patch } });
  }, [setSettings]);

  const failoverToNext = useCallback((message = "Source stalled. Trying the next source…") => {
    setCurrentIdx((idx) => {
      attemptedRef.current.add(idx);
      const groups = sourceGroupsRef.current;
      const flat = groups.flatMap((group) => group.qualities.map((item) => item.index));
      const pos = Math.max(0, flat.indexOf(idx));
      const ordered = [...flat.slice(pos + 1), ...flat.slice(0, pos)];
      const next = ordered.find((index) => !attemptedRef.current.has(index));
      if (next !== undefined) {
        setError(null);
        setLoading(true);
        return next;
      }
      setLoading(false);
      setError(message);
      return idx;
    });
  }, []);

  const selectSourceGroup = useCallback((group: { qualities: Array<{ quality: StreamQuality; index: number }> }) => {
    const nextIndex = pickPreferredSourceQuality(group.qualities, currentQuality?.resolution);
    if (nextIndex === undefined) return;
    attemptedRef.current.clear();
    setCurrentIdx(nextIndex);
    setHlsLevels([]);
    setHlsLevel(-1);
    setOpenPanel(null);
  }, [currentQuality?.resolution]);

  // Load stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentQuality) return;
    if (loadGuardRef.current) window.clearTimeout(loadGuardRef.current);
    setLoading(true);
    setError(null);
    setBuffered(0);
    setHlsLevels([]);
    setHlsLevel(-1);
    errorHitsRef.current = 0;
    stallRef.current = { time: 0, hits: 0 };
    hlsRef.current?.destroy();
    hlsRef.current = null;

    const url = currentQuality.url;
    const isHls = currentQuality.format === "hls" || url.toLowerCase().includes(".m3u8");

    let cancelled = false;
    const clearLoadGuard = () => {
      if (loadGuardRef.current) window.clearTimeout(loadGuardRef.current);
      loadGuardRef.current = null;
    };
    const armLoadGuard = (delay = 4200) => {
      clearLoadGuard();
      loadGuardRef.current = window.setTimeout(() => {
        if (cancelled) return;
        const hasData = video.readyState >= 2 || video.buffered.length > 0 || video.currentTime > 0.25;
        if (!hasData) failoverToNext("This stream did not start. Trying another source…");
      }, delay);
    };
    armLoadGuard();

    if (isHls) {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) {
          if (!cancelled) { video.preload = "auto"; video.src = url; if (startAt > 0) video.currentTime = startAt; if (autoplay) video.play().catch(() => {}); }
          return;
        }
        const prefs = getSettings().player;
        const userBuf = Math.max(0, prefs.bufferTarget ?? 0);
        const targetBuffer = userBuf > 0 ? Math.max(6, userBuf) : 8;
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startFragPrefetch: true,
          startLevel: 0,
          testBandwidth: true,
          capLevelToPlayerSize: true,
          backBufferLength: 10,
          maxBufferLength: targetBuffer,
          maxMaxBufferLength: Math.max(20, targetBuffer * 2),
          maxBufferSize: 28 * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 1,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 6,
          manifestLoadingTimeOut: 5500,
          levelLoadingTimeOut: 5500,
          fragLoadingTimeOut: 8500,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 4,
          fragLoadingRetryDelay: 350,
          abrEwmaDefaultEstimate: 1_400_000,
        });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const seenHeights = new Set<number>();
          const levels = hls.levels
            .map((l: any, i: number) => ({ height: Number(l.height) || 0, index: i }))
            .filter((l: { height: number; index: number }) => {
              if (l.height <= 0 || seenHeights.has(l.height)) return false;
              seenHeights.add(l.height);
              return true;
            })
            .sort((a: { height: number }, b: { height: number }) => b.height - a.height);
          setHlsLevels(levels);
          hls.currentLevel = getSettings().player.autoQuality === false ? hlsLevel : -1;
          setHlsLevel(-1);
          video.playbackRate = rate;
          if (startAt > 0) video.currentTime = startAt;
          if (autoplay) video.play().catch(() => {});
        });
        hls.on(Hls.Events.FRAG_BUFFERED, () => { clearLoadGuard(); setLoading(false); });
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          if (video.readyState >= 2 || video.buffered.length) { clearLoadGuard(); setLoading(false); }
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e: any, d: any) => setHlsLevel(d.level));
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (!data.fatal && data.details) {
            if (String(data.details).includes("bufferStalled")) hls.startLoad();
            return;
          }
          errorHitsRef.current += 1;
          if (data.fatal) {
            if (getSettings().player.autoFailover !== false && errorHitsRef.current > 1 && sourceGroupsRef.current.length > 1) {
              failoverToNext();
            } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else failoverToNext("Playback error. No more streams are available.");
          }
        });
      }).catch(() => {
        if (!cancelled) { video.preload = "auto"; video.src = url; if (startAt > 0) video.currentTime = startAt; if (autoplay) video.play().catch(() => {}); }
      });
    } else {
      video.preload = "auto";
      video.src = url;
      video.playbackRate = rate;
      if (startAt > 0) video.currentTime = startAt;
      if (autoplay) video.play().catch(() => {});
    }
    return () => { cancelled = true; clearLoadGuard(); hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [currentIdx, currentQuality?.url, currentQuality?.format, autoplay, startAt, failoverToNext]);

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
    const clearLoadGuard = () => {
      if (loadGuardRef.current) window.clearTimeout(loadGuardRef.current);
      loadGuardRef.current = null;
    };
    const onCanPlay = () => { clearLoadGuard(); setLoading(false); };
    const onLoaded = () => { if (v.readyState >= 2 || v.buffered.length) { clearLoadGuard(); setLoading(false); } };
    const onEnded = () => {
      onProgress?.(v.duration, v.duration, true);
      if (autoNext && hasNext && onNextEpisode) {
        setShowNextToast(true);
        setTimeout(() => onNextEpisode(), 2500);
      }
    };
    const onErr = () => {
      if (playerPrefs.autoFailover !== false && sourceGroups.length > 1) failoverToNext();
      else setError("Playback failed. No more streams are available.");
    };
    v.addEventListener("play", onPlay); v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime); v.addEventListener("durationchange", onDur);
    v.addEventListener("waiting", onWaiting); v.addEventListener("canplay", onCanPlay);
    v.addEventListener("loadedmetadata", onLoaded); v.addEventListener("loadeddata", onLoaded); v.addEventListener("progress", onLoaded);
    v.addEventListener("playing", onCanPlay); v.addEventListener("ended", onEnded);
    v.addEventListener("error", onErr);
    return () => {
      v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime); v.removeEventListener("durationchange", onDur);
      v.removeEventListener("waiting", onWaiting); v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("loadedmetadata", onLoaded); v.removeEventListener("loadeddata", onLoaded); v.removeEventListener("progress", onLoaded);
      v.removeEventListener("playing", onCanPlay); v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onErr);
    };
  }, [onProgress, autoNext, hasNext, onNextEpisode, playerPrefs.autoFailover, sourceGroups.length, failoverToNext]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if (subIdx !== -1 || !playerPrefs.preferEnglishSubs) return;
    const idx = source.subtitles.findIndex((s) => /english|\ben\b/i.test(`${s.label} ${s.language}`));
    if (idx >= 0) setSubIdx(idx);
  }, [source.subtitles, subIdx, playerPrefs.preferEnglishSubs]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.ended || error) return;
      const delta = Math.abs(v.currentTime - stallRef.current.time);
      stallRef.current.time = v.currentTime;
      if (delta > 0.2 || v.readyState >= 3) {
        stallRef.current.hits = 0;
        return;
      }
      stallRef.current.hits += 1;
      hlsRef.current?.startLoad?.();
      if (v.buffered.length) {
        const end = v.buffered.end(v.buffered.length - 1);
        if (end > v.currentTime + 0.6) v.currentTime += 0.08;
      }
      if (stallRef.current.hits >= 4 && playerPrefs.autoFailover !== false) failoverToNext();
    }, 3500);
    return () => window.clearInterval(id);
  }, [error, playerPrefs.autoFailover, failoverToNext]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Subtitle track management — match by label so we don't pick up an HLS-in-
  // manifest subtitle track that shifts indices.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = "hidden";
    if (subIdx < 0) return;
    const wanted = source.subtitles[subIdx];
    if (!wanted) return;
    // Try label match first, then language, then positional fallback.
    let match = -1;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].label === wanted.label) { match = i; break; }
    }
    if (match < 0) {
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].language === wanted.language) { match = i; break; }
      }
    }
    if (match < 0 && subIdx < tracks.length) match = subIdx;
    if (match >= 0) tracks[match].mode = "showing";
  }, [subIdx, loading, source.subtitles]);

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
    hideTimer.current = window.setTimeout(() => setShowControls(false), Math.max(1, playerPrefs.controlsTimeout ?? 3) * 1000);
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
    if (onDownload) return onDownload();
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
  const objectFit = aspect === "cover" ? "cover" : aspect === "stretch" ? "fill" : "contain";

  const progressPct = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const autoSourceQuality = currentSourceQualities.find(({ quality }) => qualityKey(quality) === "auto");
  const sourceQualityOptions = currentSourceQualities.filter(({ quality }) => qualityKey(quality) !== "auto");
  const sourceQualityKeys = new Set(sourceQualityOptions.map(({ quality }) => qualityKey(quality)));
  const hlsQualityOptions = hlsLevels.filter((level) => !sourceQualityKeys.has(String(level.height)));
  const selectedSourceQualityKey = currentQuality ? qualityKey(currentQuality) : "auto";

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-black select-none"
      style={{ "--player-accent": playerPrefs.playerAccent ?? "#ffffff" } as CSSProperties}
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
          objectFit,
          filter: `brightness(${playerPrefs.brightness ?? 100}%) contrast(${playerPrefs.contrast ?? 100}%) saturate(${playerPrefs.saturation ?? 100}%)`,
        }}
        playsInline
        preload="auto"
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
          video::cue {
            font-size: ${subStyle.fontSize}px;
            color: ${subStyle.color};
            background-color: ${subStyle.bg > 0 ? `rgba(0,0,0,${subStyle.bg / 100})` : "transparent"};
            text-shadow: ${subStyle.edge === "shadow" ? "0 2px 4px rgba(0,0,0,0.8)" : subStyle.edge === "outline" ? "-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000" : "none"};
          }
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
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--player-accent)] animate-spin" style={{ animationDuration: "0.8s" }} />
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
          <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--player-accent)] transition-[width] duration-75" style={{ width: `${progressPct}%` }} />
          {/* Scrub dot */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[var(--player-accent)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100"
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
          <button
            onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10); flashControls(); }}
            className="group/seek relative grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition active:scale-90"
            aria-label="Rewind 10 seconds"
          >
            <RotateCcw className="h-[18px] w-[18px] transition-transform group-hover/seek:-rotate-45" />
            <span className="absolute inset-0 grid place-items-center text-[9px] font-bold tabular-nums translate-y-[1px]">10</span>
          </button>

          {/* Forward 10s */}
          <button
            onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.min((v.duration || Infinity), v.currentTime + 10); flashControls(); }}
            className="group/seek relative grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition active:scale-90"
            aria-label="Forward 10 seconds"
          >
            <RotateCcw className="h-[18px] w-[18px] scale-x-[-1] transition-transform group-hover/seek:rotate-45" />
            <span className="absolute inset-0 grid place-items-center text-[9px] font-bold tabular-nums translate-y-[1px]">10</span>
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
              <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--player-accent)]" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
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

          {/* Source cloud */}
          <button
            onClick={() => setOpenPanel(openPanel === "source" ? null : "source")}
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${openPanel === "source" ? "text-white bg-white/10" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            aria-label="Sources"
            title="Sources"
          >
            <Cloud className="h-4 w-4" />
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
        <div className="absolute right-4 bottom-16 z-30 w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-black/92 p-4 shadow-2xl backdrop-blur-2xl">
          {/* Tabs */}
          <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-white/5 p-1">
            {([
              ["quality", "Quality"],
              ["playback", "Play"],
              ["display", "Display"],
              ["captions", "Captions"],
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
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {currentSourceGroup && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-[10px] uppercase tracking-widest text-white/35">
                    <span>{currentSourceGroup.name}</span>
                    <span>{Math.max(1, sourceQualityOptions.length + hlsQualityOptions.length)} qualities</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        if (autoSourceQuality) setCurrentIdx(autoSourceQuality.index);
                        setHlsLevel(-1);
                        savePlayerPref({ autoQuality: true });
                      }}
                      className={`rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${hlsLevel === -1 && selectedSourceQualityKey === "auto" ? "bg-white/15 text-white ring-1 ring-white/15" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"}`}
                    >
                      Auto
                    </button>
                    {sourceQualityOptions.map(({ quality, index }) => (
                      <button
                        key={`${quality.url}-${index}`}
                        onClick={() => { setCurrentIdx(index); setHlsLevels([]); setHlsLevel(-1); savePlayerPref({ autoQuality: false }); }}
                        className={`rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${currentIdx === index ? "bg-white/15 text-white ring-1 ring-white/15" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"}`}
                      >
                        {displayQualityLabel(quality)}
                      </button>
                    ))}
                    {hlsQualityOptions.map((lvl) => (
                      <button
                        key={lvl.index}
                        onClick={() => { setHlsLevel(lvl.index); savePlayerPref({ autoQuality: false }); }}
                        className={`rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${hlsLevel === lvl.index ? "bg-white/15 text-white ring-1 ring-white/15" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"}`}
                      >
                        {lvl.height}p
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-white">Auto failover</div>
                    <div className="mt-0.5 text-[10px] text-white/45">Switch streams automatically when one fails.</div>
                  </div>
                  <TogglePill value={playerPrefs.autoFailover !== false} onChange={(v: boolean) => savePlayerPref({ autoFailover: v })} />
                </div>
              </div>
            </div>
          )}

          {/* Playback tab */}
          {settingsTab === "playback" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/35">
                  <span>Speed</span><span>{rate}x</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                <button
                  key={r}
                  onClick={() => { setRate(r); savePlayerPref({ defaultSpeed: r }); const v = videoRef.current; if (v) v.playbackRate = r; }}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${rate === r ? "bg-white/15 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                >
                  {r === 1 ? "1x" : `${r}x`}
                </button>
              ))}
                </div>
              </div>
              <PanelSwitch label="Autoplay" hint="Start as soon as the stream connects." value={playerPrefs.autoplay} onChange={(v: boolean) => savePlayerPref({ autoplay: v })} />
              <PanelSwitch label="Auto-next" hint="Continue to the next episode." value={playerPrefs.autoNext} onChange={(v: boolean) => savePlayerPref({ autoNext: v })} />
              <PanelSlider label="Hide controls" value={playerPrefs.controlsTimeout ?? 3} min={1} max={8} suffix="s" onChange={(v: number) => savePlayerPref({ controlsTimeout: v })} />
              <PanelSlider label="Buffer target" value={playerPrefs.bufferTarget ?? 0} min={0} max={30} suffix="s" onChange={(v: number) => savePlayerPref({ bufferTarget: v })} />
            </div>
          )}

          {/* Display tab */}
          {settingsTab === "display" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-1.5">
              {([["contain", "Fit"], ["cover", "Fill"], ["stretch", "Stretch"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => { setAspect(val); savePlayerPref({ fillMode: val }); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${aspect === val ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
              </div>
              <PanelSlider label="Brightness" value={playerPrefs.brightness ?? 100} min={50} max={150} suffix="%" onChange={(v: number) => savePlayerPref({ brightness: v })} />
              <PanelSlider label="Contrast" value={playerPrefs.contrast ?? 100} min={50} max={150} suffix="%" onChange={(v: number) => savePlayerPref({ contrast: v })} />
              <PanelSlider label="Saturation" value={playerPrefs.saturation ?? 100} min={0} max={180} suffix="%" onChange={(v: number) => savePlayerPref({ saturation: v })} />
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-white"><Palette className="h-3.5 w-3.5" /> Accent</div>
                <input type="color" value={playerPrefs.playerAccent ?? "#ffffff"} onChange={(e) => savePlayerPref({ playerAccent: e.target.value })} className="h-8 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
              </div>
            </div>
          )}

          {/* Captions tab */}
          {settingsTab === "captions" && (
            <div className="space-y-4">
              <PanelSwitch label="Prefer English" hint="Enable the English 1x2.Space track when available." value={playerPrefs.preferEnglishSubs !== false} onChange={(v: boolean) => savePlayerPref({ preferEnglishSubs: v })} />
              <PanelSlider label="Subtitle size" value={subStyle.fontSize} min={12} max={48} suffix="px" onChange={(v: number) => setSubStyle({ ...subStyle, fontSize: v })} />
              <PanelSlider label="Subtitle background" value={subStyle.bg} min={0} max={100} suffix="%" onChange={(v: number) => setSubStyle({ ...subStyle, bg: v })} />
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs font-semibold text-white">Subtitle color</div>
                <input type="color" value={subStyle.color} onChange={(e) => setSubStyle({ ...subStyle, color: e.target.value })} className="h-8 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Source cloud panel ───────────────────────── */}
      {openPanel === "source" && (
        <div className="absolute right-4 bottom-16 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-black/92 p-4 shadow-2xl backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><Cloud className="h-4 w-4" /> Sources</div>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/45">{sourceGroups.length}</span>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {sourceGroups.map((group) => {
              const selected = group.id === currentSourceGroup?.id;
              const qualityLabels = group.qualities.map(({ quality }) => quality.quality || quality.format).join(" · ");
              return (
              <button
                key={group.id}
                onClick={() => selectSourceGroup(group)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition ${selected ? "bg-white/15 text-white ring-1 ring-white/15" : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{group.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-white/35">{qualityLabels}</span>
                </span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[9px] uppercase text-white/40">{group.qualities.length}</span>
              </button>
              );
            })}
          </div>
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

function TogglePill({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!value); }}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition ${value ? "border-white/25 bg-[var(--player-accent)]/80" : "border-white/10 bg-white/10"}`}
    >
      <span className={`absolute left-0.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow-lg transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function PanelSwitch({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-white">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] leading-relaxed text-white/45">{hint}</div>}
      </div>
      <TogglePill value={value} onChange={onChange} />
    </div>
  );
}

function PanelSlider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-white">{label}</span>
        <span className="font-mono text-[10px] text-white/45">{value}{suffix ?? ""}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white outline-none"
        style={{ background: `linear-gradient(to right, var(--player-accent) 0%, var(--player-accent) ${pct}%, rgba(255,255,255,.12) ${pct}%, rgba(255,255,255,.12) 100%)` }}
      />
    </div>
  );
}

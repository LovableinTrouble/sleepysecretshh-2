/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  Maximize, Minimize, PictureInPicture, Download as DownloadIcon,
  Settings as SettingsIcon, Subtitles, ChevronLeft,
  SkipForward, Cast, RotateCcw, Monitor, Palette, Cloud,
  SlidersHorizontal, Server as ServerIcon, Gauge, Check as CheckIcon, X as XIcon,
  CloudOff, ChevronRight, Loader2 as Loader2Icon,
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
  font: string;
  weight: number;
  offset: number;
  letterSpacing: number;
  lineHeight: number;
  opacity: number;
  uppercase: boolean;
};

type AspectMode = "contain" | "cover" | "stretch";

const DEFAULT_SUB: SubStyle = {
  fontSize: 22, color: "#ffffff", bg: 40, position: "bottom", edge: "shadow",
  font: "system-ui, sans-serif", weight: 700, offset: 8, letterSpacing: 0,
  lineHeight: 1.35, opacity: 100, uppercase: false,
};

const SUB_FONTS: Array<[string, string]> = [
  ["Sans", "system-ui, sans-serif"],
  ["Serif", "Georgia, serif"],
  ["Mono", "ui-monospace, monospace"],
  ["Rounded", "'Trebuchet MS', system-ui, sans-serif"],
];

const SUB_STYLE_KEY = "sleepy.substyle.v1";

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function pickStartupQualityIndex(qualities: StreamQuality[]): number {
  if (!qualities.length) return 0;
  const preferred = getSettings().player.quality;
  if (preferred === "auto") {
    const auto = qualities.findIndex((quality) => qualityKey(quality) === "auto");
    if (auto >= 0) return auto;
  }
  const target = preferred === "4k" ? 2160 : preferred === "1080p" ? 1080 : preferred === "720p" ? 720 : 1080;
  const ranked = qualities
    .map((quality, index) => ({ index, resolution: quality.resolution ?? Number(quality.quality.match(/(\d{3,4})/)?.[1] ?? 0) }))
    .filter((item) => item.resolution > 0)
    .sort((a, b) => Math.abs(a.resolution - target) - Math.abs(b.resolution - target));
  return ranked[0]?.index ?? 0;
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
  const autoSubtitleSelectedRef = useRef(false);
  const [subStyle, setSubStyleState] = useState<SubStyle>(() => {
    if (typeof window === "undefined") return DEFAULT_SUB;
    try {
      const raw = localStorage.getItem(SUB_STYLE_KEY);
      return raw ? { ...DEFAULT_SUB, ...JSON.parse(raw) } : DEFAULT_SUB;
    } catch { return DEFAULT_SUB; }
  });
  const [subCustomOpen, setSubCustomOpen] = useState(false);
  const [cueLines, setCueLines] = useState<string[]>([]);
  const setSubStyle = useCallback((next: SubStyle) => {
    setSubStyleState(next);
    try { localStorage.setItem(SUB_STYLE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }, []);
  const [hlsLevels, setHlsLevels] = useState<{ height: number; index: number }[]>([]);
  const [hlsLevel, setHlsLevel] = useState<number>(-1);
  const [seekPreview, setSeekPreview] = useState<{ x: number; t: number } | null>(null);
  const [showNextToast, setShowNextToast] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  const hideTimer = useRef<number | null>(null);
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

  const failoverToNext = useCallback((message = "No playable stream found.") => {
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
    const lowerUrl = url.toLowerCase();
    const isDash = currentQuality.format === "dash" || lowerUrl.includes(".mpd");
    const isHls = !isDash && (currentQuality.format === "hls" || lowerUrl.includes(".m3u8"));

    let cancelled = false;

    if (isDash) {
      import("dashjs").then((mod) => {
        const MediaPlayer = (mod as any).MediaPlayer ?? (mod as any).default?.MediaPlayer;
        if (cancelled || !MediaPlayer) {
          if (!cancelled) { video.preload = "auto"; video.src = url; if (startAt > 0) video.currentTime = startAt; if (autoplay) video.play().catch(() => {}); }
          return;
        }
        const prefs = getSettings().player;
        const userBuf = Math.max(0, prefs.bufferTarget ?? 0);
        const targetBuffer = userBuf > 0 ? Math.max(12, userBuf) : 24;
        const player = MediaPlayer().create();
        player.updateSettings({
          streaming: {
            buffer: {
              fastSwitchEnabled: true,
              bufferTimeAtTopQuality: targetBuffer,
              bufferTimeAtTopQualityLongForm: targetBuffer,
              bufferToKeep: 12,
              stableBufferTime: targetBuffer,
            },
            abr: { autoSwitchBitrate: { video: true, audio: true } },
          },
        });
        player.initialize(video, url, autoplay, startAt > 0 ? startAt : 0);
        hlsRef.current = { destroy: () => { try { player.destroy(); } catch { /* noop */ } } };
        player.on("playbackPlaying", () => { setLoading(false); });
        player.on("canPlay", () => { setLoading(false); video.playbackRate = rate; });
        player.on("error", () => {
          if (getSettings().player.autoFailover !== false) failoverToNext();
        });
      }).catch(() => {
        if (!cancelled) { video.preload = "auto"; video.src = url; if (startAt > 0) video.currentTime = startAt; if (autoplay) video.play().catch(() => {}); }
      });
    } else if (isHls) {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) {
          if (!cancelled) { video.preload = "auto"; video.src = url; if (startAt > 0) video.currentTime = startAt; if (autoplay) video.play().catch(() => {}); }
          return;
        }
        const prefs = getSettings().player;
        const userBuf = Math.max(0, prefs.bufferTarget ?? 0);
        // Bigger default forward buffer -> less rebuffering on average connections.
        const targetBuffer = userBuf > 0 ? Math.max(12, userBuf) : 24;
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // We render subtitles ourselves via <track> elements fetched from our
          // own subtitle APIs — letting hls.js also manage native text tracks
          // for in-manifest subtitles causes duplicate cues and an "OFF" toggle
          // that doesn't stick (hls.js keeps re-enabling its own track).
          renderTextTracksNatively: false,
          startFragPrefetch: true,
          // Start at a dependable rendition, then let ABR ramp up. Starting at
          // the highest rendition is the main cause of long first buffers.
          startLevel: 0,
          maxFragLookUpTolerance: 0.15,
          progressive: true,
          testBandwidth: true,
          capLevelToPlayerSize: true,
          backBufferLength: 20,
          maxBufferLength: targetBuffer,
          maxMaxBufferLength: Math.max(60, targetBuffer * 3),
          maxBufferSize: 90 * 1000 * 1000,
          maxBufferHole: 0.8,
          highBufferWatchdogPeriod: 1,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 6,
          manifestLoadingTimeOut: 8000,
          levelLoadingTimeOut: 8000,
          fragLoadingTimeOut: 12000,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 200,
          abrEwmaFastLive: 2,
          abrEwmaSlowLive: 5,
          abrEwmaFastVoD: 2,
          abrEwmaSlowVoD: 6,
          abrEwmaDefaultEstimate: 1_800_000,
          abrBandWidthFactor: 0.82,
          abrBandWidthUpFactor: 0.68,
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
          hls.nextLoadLevel = -1;
          setHlsLevel(-1);
          video.playbackRate = rate;
          if (startAt > 0) video.currentTime = startAt;
          if (autoplay) video.play().catch(() => {});
        });
        hls.on(Hls.Events.FRAG_BUFFERED, () => { setLoading(false); });
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          if (video.readyState >= 2 || video.buffered.length) setLoading(false);
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
            else failoverToNext();
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
    return () => { cancelled = true; hlsRef.current?.destroy(); hlsRef.current = null; };
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
    const onCanPlay = () => setLoading(false);
    const onLoaded = () => { if (v.readyState >= 2 || v.buffered.length) setLoading(false); };
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
    if (autoSubtitleSelectedRef.current || subIdx !== -1 || !playerPrefs.preferEnglishSubs || !source.subtitles.length) return;
    autoSubtitleSelectedRef.current = true;
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
  // manifest subtitle track that shifts indices. Re-applied whenever the
  // browser adds/removes text tracks (not just on subIdx change), so a track
  // that HLS or the browser adds after mount can't linger on "showing".
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const applySelection = () => {
      const tracks = v.textTracks;
      for (let i = 0; i < tracks.length; i++) tracks[i].mode = "disabled";
      if (subIdx < 0) { setCueLines([]); return; }
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
      // "hidden" keeps cues parsed but stops the browser from painting them —
      // we render them ourselves so every style option actually applies.
      if (match >= 0) tracks[match].mode = "hidden";
    };
    applySelection();
    const readCues = () => {
      const tracks = v.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.mode !== "hidden") continue;
        const active = track.activeCues;
        if (!active || !active.length) continue;
        const lines: string[] = [];
        for (let c = 0; c < active.length; c++) {
          const text = String((active[c] as any).text ?? "")
            .replace(/<[^>]+>/g, "")
            .trim();
          if (text) lines.push(...text.split("\n"));
        }
        setCueLines(lines);
        return;
      }
      setCueLines([]);
    };
    const trackElements = Array.from(v.querySelectorAll("track"));
    for (const track of trackElements) track.addEventListener("load", applySelection);
    const tracks = v.textTracks;
    tracks.addEventListener("addtrack", applySelection);
    tracks.addEventListener("removetrack", applySelection);
    const cueTargets: TextTrack[] = [];
    for (let i = 0; i < tracks.length; i++) { tracks[i].addEventListener("cuechange", readCues); cueTargets.push(tracks[i]); }
    v.addEventListener("timeupdate", readCues);
    return () => {
      for (const track of trackElements) track.removeEventListener("load", applySelection);
      tracks.removeEventListener("addtrack", applySelection);
      tracks.removeEventListener("removetrack", applySelection);
      for (const track of cueTargets) track.removeEventListener("cuechange", readCues);
      v.removeEventListener("timeupdate", readCues);
    };
  }, [subIdx, source.subtitles]);

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
    const target = pct * duration;
    v.currentTime = target;
    hlsRef.current?.startLoad?.(target);
  };

  const onSeekMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekPreview({ x: e.clientX - rect.left, t: pct * duration });
    if (scrubbing) {
      const target = pct * duration;
      v.currentTime = target;
      hlsRef.current?.startLoad?.(target);
    }
  };

  // Volume
  const onVolChange = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.volume = pct; setVolume(pct); setMuted(pct === 0);
  };

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
        {source.subtitles.map((sub) => (
          <track key={`${sub.language}:${sub.label}:${sub.url}`} kind="subtitles" src={sub.url} srcLang={sub.language} label={sub.label} />
        ))}
      </video>

      {/* Subtitles — rendered by us so every style option applies live. */}
      <style>{`video::cue { opacity: 0; }`}</style>
      {subIdx >= 0 && cueLines.length > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 z-[16] flex flex-col items-center px-6 text-center"
          style={{
            ...(subStyle.position === "top"
              ? { top: `${subStyle.offset + 6}%`, bottom: "auto" }
              : subStyle.position === "middle"
                ? { top: "45%", bottom: "auto" }
                : { bottom: `${subStyle.offset + (showControls ? 10 : 4)}%`, top: "auto" }),
            transition: "bottom 0.25s ease",
          }}
        >
          {cueLines.map((line, i) => (
            <span
              key={`${i}-${line}`}
              style={{
                fontFamily: subStyle.font,
                fontSize: `${subStyle.fontSize}px`,
                fontWeight: subStyle.weight,
                color: subStyle.color,
                opacity: subStyle.opacity / 100,
                lineHeight: subStyle.lineHeight,
                letterSpacing: `${subStyle.letterSpacing}px`,
                textTransform: subStyle.uppercase ? "uppercase" : "none",
                backgroundColor: subStyle.bg > 0 ? `rgba(0,0,0,${subStyle.bg / 100})` : "transparent",
                padding: subStyle.bg > 0 ? "0.1em 0.4em" : 0,
                borderRadius: 6,
                textShadow:
                  subStyle.edge === "shadow"
                    ? "0 2px 6px rgba(0,0,0,0.9)"
                    : subStyle.edge === "outline"
                      ? "-1.5px -1.5px 0 #000,1.5px -1.5px 0 #000,-1.5px 1.5px 0 #000,1.5px 1.5px 0 #000"
                      : "none",
              }}
            >
              {line}
            </span>
          ))}
        </div>
      )}

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
            onClick={() => { setSettingsTab("subs"); setOpenPanel(openPanel === "settings" ? null : "settings"); }}
            className={`grid h-9 w-9 place-items-center rounded-lg transition ${subIdx >= 0 ? "text-white bg-white/10" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            aria-label="Subtitles"
          >
            <Subtitles className="h-4 w-4" />
          </button>

          {/* Sources cloud */}
          <button
            onClick={() => { setSettingsTab("servers"); setOpenPanel(openPanel === "settings" && settingsTab === "servers" ? null : "settings"); }}
            className={`hidden sm:grid h-9 w-9 place-items-center rounded-lg transition ${openPanel === "settings" && settingsTab === "servers" ? "text-white bg-white/10" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            aria-label="Sources"
            title="Sources"
          >
            <Cloud className="h-4 w-4" />
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
        <div
          className="absolute right-2 left-2 sm:left-auto sm:right-4 bottom-16 z-30 sm:w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-6rem)] overflow-hidden rounded-3xl border border-white/15 bg-black/40 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ background: "linear-gradient(180deg, rgba(20,20,25,0.85) 0%, rgba(8,8,12,0.92) 100%)" }}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <div className="text-base font-bold tracking-tight text-white">Player Settings</div>
              <div className="mt-0.5 text-[11px] text-white/50">Customize your viewing experience</div>
            </div>
            <button onClick={() => setOpenPanel(null)} className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/15 hover:text-white" aria-label="Close">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 pt-4">
            <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/5 bg-white/[0.04] p-1">
              {([
                ["quality", "Quality", SlidersHorizontal],
                ["subs", "Subs", Subtitles],
                ["servers", "Servers", ServerIcon],
                ["speed", "Speed", Gauge],
              ] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  onClick={() => setSettingsTab(tab)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold tracking-wide transition-all duration-200 ${settingsTab === tab ? "bg-white text-black shadow-lg" : "text-white/50 hover:text-white hover:bg-white/5"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[min(28rem,calc(100dvh-14rem))] overflow-y-auto p-4">
            {/* QUALITY */}
            {settingsTab === "quality" && (
              <div className="space-y-1.5 animate-in fade-in duration-150">
                <QualityRow
                  label="Auto"
                  hint="Match to network"
                  active={hlsLevel === -1 && selectedSourceQualityKey === "auto"}
                  onClick={() => { if (autoSourceQuality) setCurrentIdx(autoSourceQuality.index); setHlsLevel(-1); savePlayerPref({ autoQuality: true }); }}
                />
                {sourceQualityOptions.map(({ quality, index }) => (
                  <QualityRow
                    key={`${quality.url}-${index}`}
                    label={displayQualityLabel(quality)}
                    badge={qualityBadge(quality.resolution)}
                    active={currentIdx === index && hlsLevel === -1}
                    onClick={() => { setCurrentIdx(index); setHlsLevels([]); setHlsLevel(-1); savePlayerPref({ autoQuality: false }); }}
                  />
                ))}
                {hlsQualityOptions.map((lvl) => (
                  <QualityRow
                    key={lvl.index}
                    label={`${lvl.height}p`}
                    badge={qualityBadge(lvl.height)}
                    active={hlsLevel === lvl.index}
                    onClick={() => { setHlsLevel(lvl.index); savePlayerPref({ autoQuality: false }); }}
                  />
                ))}
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
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

            {/* SUBS */}
            {settingsTab === "subs" && (
              <div className="space-y-1.5 animate-in fade-in duration-150">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Tracks</div>
                  <button
                    onClick={() => setSubCustomOpen((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${subCustomOpen ? "bg-white text-black" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"}`}
                    aria-label="Customize subtitles"
                  >
                    <SettingsIcon className={`h-3.5 w-3.5 transition-transform duration-300 ${subCustomOpen ? "rotate-90" : ""}`} />
                    Customize
                  </button>
                </div>
                <QualityRow label="Off" active={subIdx === -1} onClick={() => setSubIdx(-1)} />
                {source.subtitles.map((sub, i) => (
                  <QualityRow key={i} label={sub.label} hint={sub.language?.toUpperCase()} active={subIdx === i} onClick={() => setSubIdx(i)} />
                ))}
                {subCustomOpen && (
                  <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="rounded-xl border border-white/10 bg-black/50 p-3 text-center">
                      <span style={{
                        fontFamily: subStyle.font, fontSize: `${subStyle.fontSize}px`, fontWeight: subStyle.weight,
                        color: subStyle.color, opacity: subStyle.opacity / 100, letterSpacing: `${subStyle.letterSpacing}px`,
                        textTransform: subStyle.uppercase ? "uppercase" : "none",
                        backgroundColor: subStyle.bg > 0 ? `rgba(0,0,0,${subStyle.bg / 100})` : "transparent",
                        padding: subStyle.bg > 0 ? "0.1em 0.4em" : 0, borderRadius: 6,
                        textShadow: subStyle.edge === "shadow" ? "0 2px 6px rgba(0,0,0,0.9)"
                          : subStyle.edge === "outline" ? "-1.5px -1.5px 0 #000,1.5px -1.5px 0 #000,-1.5px 1.5px 0 #000,1.5px 1.5px 0 #000" : "none",
                      }}>Preview caption</span>
                    </div>
                    <PanelSlider label="Size" value={subStyle.fontSize} min={12} max={56} suffix="px" onChange={(v: number) => setSubStyle({ ...subStyle, fontSize: v })} />
                    <PanelSlider label="Weight" value={subStyle.weight} min={300} max={900} suffix="" onChange={(v: number) => setSubStyle({ ...subStyle, weight: Math.round(v / 100) * 100 })} />
                    <PanelSlider label="Background" value={subStyle.bg} min={0} max={100} suffix="%" onChange={(v: number) => setSubStyle({ ...subStyle, bg: v })} />
                    <PanelSlider label="Text opacity" value={subStyle.opacity} min={20} max={100} suffix="%" onChange={(v: number) => setSubStyle({ ...subStyle, opacity: v })} />
                    <PanelSlider label="Vertical offset" value={subStyle.offset} min={0} max={40} suffix="%" onChange={(v: number) => setSubStyle({ ...subStyle, offset: v })} />
                    <PanelSlider label="Letter spacing" value={subStyle.letterSpacing} min={0} max={6} suffix="px" onChange={(v: number) => setSubStyle({ ...subStyle, letterSpacing: v })} />
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-white">Color</div>
                      <input type="color" value={subStyle.color} onChange={(e) => setSubStyle({ ...subStyle, color: e.target.value })} className="h-8 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                    </div>
                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">Font</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {SUB_FONTS.map(([label, value]) => (
                          <button key={label} onClick={() => setSubStyle({ ...subStyle, font: value })} style={{ fontFamily: value }}
                            className={`rounded-lg py-1.5 text-[10px] font-semibold transition ${subStyle.font === value ? "bg-white text-black" : "bg-white/5 text-white/55 hover:bg-white/10"}`}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">Edge</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["none", "shadow", "outline"] as const).map((edge) => (
                          <button key={edge} onClick={() => setSubStyle({ ...subStyle, edge })}
                            className={`rounded-lg py-1.5 text-[10px] font-semibold capitalize transition ${subStyle.edge === edge ? "bg-white text-black" : "bg-white/5 text-white/55 hover:bg-white/10"}`}>{edge}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">Position</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["bottom", "middle", "top"] as const).map((pos) => (
                          <button key={pos} onClick={() => setSubStyle({ ...subStyle, position: pos })}
                            className={`rounded-lg py-1.5 text-[10px] font-semibold capitalize transition ${subStyle.position === pos ? "bg-white text-black" : "bg-white/5 text-white/55 hover:bg-white/10"}`}>{pos}</button>
                        ))}
                      </div>
                    </div>
                    <PanelSwitch label="Uppercase" hint="Render captions in all caps." value={subStyle.uppercase} onChange={(v: boolean) => setSubStyle({ ...subStyle, uppercase: v })} />
                    <button onClick={() => setSubStyle(DEFAULT_SUB)} className="w-full rounded-xl bg-white/5 py-2 text-[10px] font-bold uppercase tracking-widest text-white/50 transition hover:bg-white/10 hover:text-white">Reset to default</button>
                  </div>
                )}
              </div>
            )}

            {/* SERVERS */}
            {settingsTab === "servers" && (
              <div className="space-y-2 animate-in fade-in duration-150">
                {(servers ?? []).map((sv) => {
                  const isActive = sv.id === activeServer;
                  return (
                    <button
                      key={sv.id}
                      onClick={() => onSwitchServer?.(sv.id)}
                      className={`group flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ${isActive ? "border-white/25 bg-white/[0.14] text-white" : "border-white/5 bg-white/[0.04] text-white/70 hover:border-white/15 hover:bg-white/[0.08] hover:text-white"}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${isActive ? "bg-white text-black" : "bg-white/[0.07] text-white/60 group-hover:text-white"}`}>
                          {sv.status === "checking"
                            ? <Loader2Icon className="h-4 w-4 animate-spin" />
                            : sv.status === "failed"
                              ? <CloudOff className="h-4 w-4" />
                              : <Cloud className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold tracking-tight">{sv.name}</span>
                          <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-white/35">
                            {sv.status === "checking" ? "Connecting…"
                              : sv.status === "failed" ? "Unavailable"
                              : sv.status === "ready" ? `${sv.count} stream${sv.count === 1 ? "" : "s"}`
                              : "Tap to connect"}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {isActive
                          ? <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-black"><CheckIcon className="h-3.5 w-3.5" /></span>
                          : <ChevronRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-0.5 group-hover:text-white/60" />}
                      </span>
                    </button>
                  );
                })}
                {(!servers || servers.length === 0) && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-[11px] text-white/45">No servers available.</div>
                )}
              </div>
            )}

            {/* SPEED & Playback prefs */}
            {settingsTab === "speed" && (
              <div className="space-y-4 animate-in fade-in duration-150">
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
                <div className="grid grid-cols-3 gap-1.5">
                  {([["contain", "Fit"], ["cover", "Fill"], ["stretch", "Stretch"]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => { setAspect(val); savePlayerPref({ fillMode: val }); }}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs transition ${aspect === val ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8"}`}>
                      <Monitor className="h-3.5 w-3.5" />{label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white"><Palette className="h-3.5 w-3.5" /> Accent</div>
                  <input type="color" value={playerPrefs.playerAccent ?? "#ffffff"} onChange={(e) => savePlayerPref({ playerAccent: e.target.value })} className="h-8 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                </div>
              </div>
            )}
          </div>
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

function qualityBadge(resolution?: number): string | undefined {
  if (!resolution) return undefined;
  if (resolution >= 2160) return "4K";
  if (resolution >= 1440) return "QHD";
  if (resolution >= 1080) return "FULL HD";
  if (resolution >= 720) return "HD";
  return undefined;
}

function QualityRow({
  label, hint, badge, active, onClick,
}: {
  label: string; hint?: string; badge?: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition ${active ? "bg-white/15 text-white ring-1 ring-white/20" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold">{label}</span>
        {badge && (
          <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/80">{badge}</span>
        )}
        {hint && <span className="text-[10px] text-white/40">{hint}</span>}
      </span>
      {active && <span className="h-2 w-2 shrink-0 rounded-full bg-white" />}
    </button>
  );
}

// Global music playback singleton.
// One YouTube IFrame player attached to <body>, in-memory only (reload = stop).
// Falls back to a 30s iTunes preview (HTMLAudioElement) when no YouTube source
// is playable, so something audible still plays. All pages read/write through
// this store via `useMusicPlayer()`.

import { useSyncExternalStore } from "react";
import { searchYouTube, searchTrackPreview, type Track } from "./music";

export type PlayerState = {
  current: Track | null;
  queue: Track[];
  queueIdx: number;
  playing: boolean;
  loading: boolean;
  /** User-facing playback error (e.g. no playable source). null when healthy. */
  error: string | null;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: boolean;
};

const initial: PlayerState = {
  current: null,
  queue: [],
  queueIdx: 0,
  playing: false,
  loading: false,
  error: null,
  progress: 0,
  duration: 0,
  volume: 80,
  muted: false,
  repeat: false,
};

let state: PlayerState = { ...initial };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<PlayerState>) => { state = { ...state, ...patch }; emit(); };

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getSnapshot = () => state;
const getServerSnapshot = () => initial;

export function useMusicPlayer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// --- Playback engines ---
// "yt": YouTube IFrame player. "preview": HTMLAudioElement (iTunes preview).
type Mode = "yt" | "preview";
let mode: Mode = "yt";

let yt: any = null;
let ytReady: Promise<void> | null = null;
let audioEl: HTMLAudioElement | null = null;
let pollTimer: number | null = null;
let loadSeq = 0;
// Guards against an infinite skip loop when every track in a queue errors.
let errorStreak = 0;

function loadYT(): Promise<void> {
  if (ytReady) return ytReady;
  ytReady = new Promise<void>((resolve) => {
    if (typeof window === "undefined") return resolve();
    if ((window as any).YT?.Player) return resolve();
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => resolve();
  });
  return ytReady;
}

// Single progress poller shared by both engines. Idempotent.
function startPoll() {
  if (pollTimer || typeof window === "undefined") return;
  pollTimer = window.setInterval(() => {
    if (mode === "preview") {
      if (!audioEl) return;
      const p = audioEl.currentTime || 0;
      const d = Number.isFinite(audioEl.duration) ? audioEl.duration || 0 : 0;
      if (p !== state.progress || d !== state.duration) set({ progress: p, duration: d });
      return;
    }
    if (!yt?.getCurrentTime) return;
    try {
      const p = yt.getCurrentTime() || 0;
      const d = yt.getDuration() || 0;
      if (p !== state.progress || d !== state.duration) set({ progress: p, duration: d });
    } catch {}
  }, 500) as unknown as number;
}

function ensureAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  const a = new Audio();
  a.preload = "auto";
  a.addEventListener("playing", () => { errorStreak = 0; set({ playing: true, loading: false, error: null }); });
  a.addEventListener("pause", () => set({ playing: false }));
  a.addEventListener("ended", () => {
    if (mode !== "preview") return;
    if (state.repeat) {
      try { a.currentTime = 0; void a.play(); } catch {}
    } else {
      advanceOrStop();
    }
  });
  a.addEventListener("error", () => {
    if (mode !== "preview") return;
    handlePlaybackError("Couldn't play this track.");
  });
  audioEl = a;
  return a;
}

async function ensurePlayer(): Promise<void> {
  if (yt) return;
  await loadYT();
  if (yt) return;
  const host = document.createElement("div");
  host.id = "sleepy-yt-host";
  host.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;";
  document.body.appendChild(host);
  await new Promise<void>((resolve) => {
    yt = new (window as any).YT.Player(host, {
      height: "0", width: "0", videoId: "",
      host: "https://www.youtube-nocookie.com",
      playerVars: {
        playsinline: 1,
        enablejsapi: 1,
        modestbranding: 1,
        rel: 0,
        origin: typeof window !== "undefined" ? window.location.origin : "",
      },
      events: {
        onReady: () => {
          try { yt.setVolume(state.muted ? 0 : state.volume); } catch {}
          resolve();
        },
        onStateChange: (e: any) => {
          if (mode !== "yt") return;
          const YT = (window as any).YT;
          if (e.data === YT.PlayerState.PLAYING) { errorStreak = 0; set({ playing: true, loading: false, error: null }); }
          else if (e.data === YT.PlayerState.PAUSED) set({ playing: false });
          else if (e.data === YT.PlayerState.BUFFERING) set({ loading: true });
          else if (e.data === YT.PlayerState.ENDED) {
            if (state.repeat) {
              try { yt.seekTo(0); yt.playVideo(); } catch {}
            } else {
              advanceOrStop();
            }
          }
        },
        onError: (e: any) => {
          // Region lock, embedding disabled, removed video, etc. Without this
          // handler the UI would hang on "loading" forever.
          console.warn("[v0] YouTube player error:", e?.data);
          if (mode !== "yt") return;
          handlePlaybackError("Couldn't play this track.");
        },
      },
    });
  });
  startPoll();
}

// Prime the YouTube player on the first user gesture so the real playVideo()
// call lands inside the browser's user-gesture window (autoplay policies).
let primed = false;
function primeOnFirstGesture() {
  if (typeof window === "undefined" || primed) return;
  const handler = () => {
    if (primed) return;
    primed = true;
    void ensurePlayer().then(() => {
      try { yt?.mute?.(); yt?.playVideo?.(); yt?.pauseVideo?.(); yt?.unMute?.(); } catch {}
    });
    window.removeEventListener("pointerdown", handler, true);
    window.removeEventListener("touchstart", handler, true);
    window.removeEventListener("keydown", handler, true);
  };
  window.addEventListener("pointerdown", handler, true);
  window.addEventListener("touchstart", handler, true);
  window.addEventListener("keydown", handler, true);
}
if (typeof window !== "undefined") primeOnFirstGesture();

// Advance to the next queued track, or stop cleanly at the end (no repeat).
function advanceOrStop() {
  const { queue, queueIdx } = state;
  if (queueIdx < queue.length - 1) {
    const ni = queueIdx + 1;
    void play(queue[ni], queue, ni);
  } else {
    stopEngines();
    set({ playing: false, progress: state.duration });
  }
}

function stopEngines() {
  try { yt?.pauseVideo?.(); } catch {}
  try { audioEl?.pause?.(); } catch {}
}

// Skip to the next track on error; give up (surface an error) if the whole
// queue is unplayable to avoid an infinite skip loop.
function handlePlaybackError(msg: string) {
  set({ loading: false });
  errorStreak++;
  const { queue } = state;
  if (queue.length > 1 && errorStreak <= queue.length) {
    next();
  } else {
    errorStreak = 0;
    stopEngines();
    set({ error: msg, playing: false });
  }
}

export async function play(track: Track, list?: Track[], idx?: number): Promise<void> {
  const seq = ++loadSeq;
  set({
    current: track,
    queue: list ?? state.queue,
    queueIdx: list ? (idx ?? 0) : state.queueIdx,
    loading: true,
    error: null,
    progress: 0,
    duration: 0,
  });

  startPoll();

  // If the YT player already exists, kick playback synchronously so the request
  // stays within the user-gesture window.
  if (yt?.playVideo && mode === "yt") {
    try { yt.playVideo(); } catch {}
  }

  try {
    await ensurePlayer();

    // Resolve a YouTube video id — from the track or via search.
    let videoId: string | undefined = track.videoId;
    if (!videoId) {
      videoId = (await searchYouTube(`${track.title} ${track.artist} audio`)) ?? undefined;
    }

    if (seq !== loadSeq) return; // superseded by a newer play()

    if (videoId && yt?.loadVideoById) {
      mode = "yt";
      try { audioEl?.pause?.(); } catch {}
      yt.loadVideoById(videoId);
      // PLAYING via onStateChange clears loading.
      return;
    }

    // No YouTube source — fall back to an audible iTunes preview.
    const previewUrl = track.previewUrl || (await searchTrackPreview(`${track.title} ${track.artist}`));
    if (seq !== loadSeq) return;
    if (previewUrl) {
      mode = "preview";
      try { yt?.pauseVideo?.(); } catch {}
      const a = ensureAudio();
      a.src = previewUrl;
      a.volume = state.muted ? 0 : state.volume / 100;
      void a.play().catch(() => { handlePlaybackError("Couldn't play this track."); });
      return;
    }

    // Nothing playable at all.
    handlePlaybackError("Couldn't find a playable source for this track.");
  } catch (error) {
    console.warn("[v0] Play error:", error);
    if (seq === loadSeq) handlePlaybackError("Couldn't play this track.");
  }
}

export function toggle() {
  if (mode === "preview" && audioEl) {
    if (state.playing) audioEl.pause();
    else void audioEl.play().catch(() => {});
    return;
  }
  if (!yt) return;
  try {
    state.playing ? yt.pauseVideo() : yt.playVideo();
  } catch {}
}

export function pause() {
  try { yt?.pauseVideo?.(); } catch {}
  try { audioEl?.pause?.(); } catch {}
}

export function next() {
  const { queue, queueIdx } = state;
  if (!queue.length) return;
  // Single-track queue: restart it rather than stalling.
  if (queue.length === 1) {
    void play(queue[0], queue, 0);
    return;
  }
  const ni = (queueIdx + 1) % queue.length;
  void play(queue[ni], queue, ni);
}

export function prev() {
  const { queue, queueIdx, progress } = state;
  // If more than 4 seconds in, restart the current track.
  if (progress > 4) {
    if (mode === "preview" && audioEl) { try { audioEl.currentTime = 0; } catch {} return; }
    if (yt) { try { yt.seekTo(0); } catch {} return; }
  }
  if (!queue.length) return;
  const ni = (queueIdx - 1 + queue.length) % queue.length;
  void play(queue[ni], queue, ni);
}

export function seek(ratio: number) {
  if (mode === "preview" && audioEl) {
    if (Number.isFinite(audioEl.duration) && audioEl.duration) {
      try { audioEl.currentTime = audioEl.duration * ratio; } catch {}
    }
    return;
  }
  if (!yt?.getDuration) return;
  try {
    const d = yt.getDuration();
    yt.seekTo(d * ratio, true);
  } catch {}
}

export function setVolume(v: number) {
  set({ volume: v });
  try { yt?.setVolume?.(state.muted ? 0 : v); } catch {}
  if (audioEl) audioEl.volume = state.muted ? 0 : v / 100;
}

export function setMuted(m: boolean) {
  set({ muted: m });
  try { yt?.setVolume?.(m ? 0 : state.volume); } catch {}
  if (audioEl) audioEl.volume = m ? 0 : state.volume / 100;
}

export function setRepeat(r: boolean) { set({ repeat: r }); }

/** Stops playback and clears the now-playing card. */
export function close() {
  loadSeq++;
  errorStreak = 0;
  try { yt?.stopVideo?.(); } catch {}
  try { if (audioEl) { audioEl.pause(); audioEl.removeAttribute("src"); audioEl.load(); } } catch {}
  mode = "yt";
  set({ ...initial, volume: state.volume, muted: state.muted, repeat: state.repeat });
}

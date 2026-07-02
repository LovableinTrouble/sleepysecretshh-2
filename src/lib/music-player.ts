// Global music playback singleton.
// One YouTube IFrame player attached to <body>, in-memory only (reload = stop).
// All pages read/write through this store via `useMusicPlayer()`.

import { useSyncExternalStore } from "react";
import { searchYouTube, type Track } from "./music";

export type PlayerState = {
  current: Track | null;
  queue: Track[];
  queueIdx: number;
  playing: boolean;
  loading: boolean;
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

// --- YT loader / player ---
let yt: any = null;
let ytReady: Promise<void> | null = null;
let pollTimer: number | null = null;
let loadSeq = 0;

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
      playerVars: { playsinline: 1, enablejsapi: 1, modestbranding: 1, rel: 0 },
      events: {
        onReady: () => { try { yt.setVolume(state.muted ? 0 : state.volume); } catch {} resolve(); },
        onStateChange: (e: any) => {
          const YT = (window as any).YT;
          if (e.data === YT.PlayerState.PLAYING) set({ playing: true, loading: false });
          else if (e.data === YT.PlayerState.PAUSED) set({ playing: false });
          else if (e.data === YT.PlayerState.BUFFERING) set({ loading: true });
          else if (e.data === YT.PlayerState.ENDED) {
            if (state.repeat) { try { yt.seekTo(0); yt.playVideo(); } catch {} }
            else next();
          }
        },
      },
    });
  });
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    if (!yt?.getCurrentTime) return;
    try {
      const p = yt.getCurrentTime() || 0;
      const d = yt.getDuration() || 0;
      if (p !== state.progress || d !== state.duration) set({ progress: p, duration: d });
    } catch {}
  }, 500) as unknown as number;
}

// Prime the YouTube player on the first user gesture so subsequent
// programmatic `playVideo()` calls are allowed on iOS/mobile Chrome.
// Without this, the very first track after a fresh page load often refuses
// to autoplay — the user has to tap the mini-player's play button to unlock.
let primed = false;
function primeOnFirstGesture() {
  if (typeof window === "undefined" || primed) return;
  const handler = () => {
    if (primed) return;
    primed = true;
    // Kick off player creation inside the gesture. We deliberately do NOT
    // await — creation must start synchronously so iOS attributes the
    // resulting audio context to this gesture.
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

export async function play(track: Track, list?: Track[], idx?: number): Promise<void> {
  const seq = ++loadSeq;
  set({
    current: track,
    queue: list ?? state.queue,
    queueIdx: list ? (idx ?? 0) : state.queueIdx,
    loading: true,
    progress: 0,
    duration: 0,
  });
  // If the player already exists, kick playback synchronously inside the
  // caller's gesture. iOS Safari requires a media action within the same
  // task as the user tap, so we can't await search before calling play.
  if (yt?.playVideo) {
    try { yt.playVideo(); } catch {}
  }
  try {
    await ensurePlayer();
    const vid = track.videoId || (await searchYouTube(`${track.title} ${track.artist} audio`));
    if (seq !== loadSeq) return; // a newer play() superseded this one
    if (vid && yt?.loadVideoById) {
      yt.loadVideoById(vid);
      yt.playVideo();
    } else {
      set({ loading: false });
    }
  } catch {
    set({ loading: false });
  }
}

export function toggle() {
  if (!yt) return;
  try { state.playing ? yt.pauseVideo() : yt.playVideo(); } catch {}
}

export function pause() { try { yt?.pauseVideo?.(); } catch {} }

export function next() {
  const { queue, queueIdx } = state;
  if (!queue.length) return;
  const ni = (queueIdx + 1) % queue.length;
  void play(queue[ni], queue, ni);
}

export function prev() {
  const { queue, queueIdx, progress } = state;
  if (progress > 4 && yt) { try { yt.seekTo(0); } catch {} return; }
  if (!queue.length) return;
  const ni = (queueIdx - 1 + queue.length) % queue.length;
  void play(queue[ni], queue, ni);
}

export function seek(ratio: number) {
  if (!yt?.getDuration) return;
  try { const d = yt.getDuration(); yt.seekTo(d * ratio, true); } catch {}
}

export function setVolume(v: number) {
  set({ volume: v });
  try { yt?.setVolume?.(state.muted ? 0 : v); } catch {}
}

export function setMuted(m: boolean) {
  set({ muted: m });
  try { yt?.setVolume?.(m ? 0 : state.volume); } catch {}
}

export function setRepeat(r: boolean) { set({ repeat: r }); }

/** Stops playback and clears the now-playing card. Used when entering a video/IPTV/sports route. */
export function close() {
  loadSeq++;
  try { yt?.stopVideo?.(); } catch {}
  set({ ...initial, volume: state.volume, muted: state.muted, repeat: state.repeat });
}
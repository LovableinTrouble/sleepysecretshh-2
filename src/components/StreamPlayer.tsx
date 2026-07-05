import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings as SettingsIcon,
  Bubbles as SubtitlesIcon,
  PictureInPicture2,
  ChevronLeft,
  RotateCcw,
  RotateCw,
} from "lucide-react";

import type { Media } from "@/lib/catalog";
import { useSettings } from "@/lib/store";
import { getOrderedSources, sourceForKey, SOURCE_TIER_LABEL, type Source, type SourceKey } from "@/lib/sources";
import { resolveFebboxStream, type ResolvedQuality } from "@/lib/api/streams.functions";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";
// Direct HLS/MP4 playback (FebBox) uses our native player UI. Prionix is a
// third-party iframe embed used as a fallback source.

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

interface Subtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}

interface DirectStream {
  source: Source;
  qualities: ResolvedQuality[];
  active: ResolvedQuality;
  subs: Subtitle[];
}

type Status =
  | { kind: "scanning" }
  | { kind: "direct"; stream: DirectStream }
  | { kind: "embed"; url: string }
  | { kind: "failed"; detail?: string; logs?: { step: string; status: "ok" | "fail"; detail?: string }[] };

const QUALITY_RANK: Record<string, number> = {
  "4k": 100,
  "2160": 100,
  "2k": 90,
  "1440": 90,
  "1080": 80,
  hd: 80,
  fhd: 80,
  "720": 60,
  "480": 40,
  "360": 20,
  org: 75,
  original: 75,
};

function rankQuality(q: string) {
  const k = String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  for (const key of Object.keys(QUALITY_RANK)) if (k.includes(key)) return QUALITY_RANK[key];
  return 1;
}

function pickInitialQuality(
  qualities: ResolvedQuality[],
  preference: "auto" | "4k" | "1080p" | "720p",
): ResolvedQuality {
  const sorted = [...qualities].sort((a, b) => rankQuality(b.quality) - rankQuality(a.quality));
  const under = (max: number) => sorted.find((q) => rankQuality(q.quality) <= max);
  if (preference === "720p") return under(60) ?? sorted.at(-1) ?? sorted[0];
  if (preference === "1080p") return under(80) ?? sorted.at(-1) ?? sorted[0];
  if (preference === "4k") return sorted[0];
  return (
    sorted.find((q) => !q.isHls && rankQuality(q.quality) <= 80) ??
    sorted.find((q) => q.isHls && rankQuality(q.quality) <= 80) ??
    under(80) ??
    sorted.at(-1) ??
    sorted[0]
  );
}

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  const [settings] = useSettings();
  const ordered = useMemo(() => getOrderedSources(settings), [settings]);
  const [status, setStatus] = useState<Status>({ kind: "scanning" });
  const [scanStep, setScanStep] = useState<string>("Initializing");
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const loadSeqRef = useRef(0);

  const febboxCookie = settings.integrations.febboxCookie || "";
  const hasFebboxToken = Boolean(febboxCookie.trim());
  const qualityPref = settings.player.quality;

  // FebBox is only attempted when a token (ui= cookie) is configured —
  // anonymous FebBox calls almost always fail and just delay playback, so
  // without one we go straight to Prionix.
  const [sourceKey, setSourceKey] = useState<SourceKey>(() => (hasFebboxToken ? "gamma" : "prionix"));
  const userPickedRef = useRef(false);

  const switchSource = useCallback((key: SourceKey) => {
    userPickedRef.current = true;
    loadSeqRef.current += 1;
    setSourceKey(key);
    setStatus({ kind: "scanning" });
  }, []);

  useEffect(() => {
    const loadId = ++loadSeqRef.current;
    cancelRef.current = false;
    const isStale = () => cancelRef.current || loadSeqRef.current !== loadId;
    setStatus({ kind: "scanning" });

    (async () => {
      if (sourceKey === "gamma") {
        if (!hasFebboxToken) {
          // Token got disabled after this was already selected — bail to Prionix.
          setSourceKey("prionix");
          return;
        }
        const fCookie = febboxCookie.trim();
        setScanStep("Connecting to FebBox…");
        try {
          const res = await resolveFebboxStream({
            data: {
              title: media.title,
              tmdbId: media.id,
              type: media.type === "movie" ? "movie" : "show",
              season,
              episode,
              uiCookie: fCookie || undefined,
              releaseYear: Number(media.year) || undefined,
            },
          });
          if (isStale()) return;
          if (res.ok && res.qualities.length > 0) {
            const best = pickInitialQuality(res.qualities, qualityPref);
            const febbox = ordered.find((s) => s.kind === "febbox-direct")!;
            setStatus({
              kind: "direct",
              stream: { source: febbox, qualities: res.qualities, active: best, subs: res.subtitles },
            });
            setFallbackNotice(null);
            return;
          }
          setFallbackNotice("FebBox unavailable. Switching to Prionix…");
          setSourceKey("prionix");
        } catch {
          if (!isStale()) {
            setFallbackNotice("FebBox unavailable. Switching to Prionix…");
            setSourceKey("prionix");
          }
        }
        return;
      }

      // Prionix — third-party iframe embed, fallback when FebBox isn't
      // enabled or has no stream.
      setScanStep("Connecting to Prionix…");
      const prionix = sourceForKey("prionix");
      const embedUrl = prionix.build(media, season, episode);
      if (isStale()) return;
      if (embedUrl) {
        setStatus({ kind: "embed", url: embedUrl });
        setTimeout(() => setFallbackNotice(null), 1500);
      } else {
        setStatus({ kind: "failed", detail: "No playable source found for this title." });
      }
    })();

    return () => {
      cancelRef.current = true;
    };
  }, [
    media.id,
    media.title,
    media.type,
    season,
    episode,
    sourceKey,
    febboxCookie,
    hasFebboxToken,
    qualityPref,
    ordered,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);

    // Lock background scroll while the player is mounted. Plain
    // `overflow: hidden` on body isn't reliable on mobile Safari — the page
    // can still rubber-band/scroll underneath, which visually drags a
    // `position: fixed` element along with it for a moment before it
    // "snaps" back, which is exactly what showed up as the player sliding
    // down after a second. Locking the body itself with `position: fixed`
    // (the standard iOS-safe scroll-lock technique) prevents that entirely.
    const scrollY = window.scrollY;
    const { body } = document;
    const html = document.documentElement;
    const prev = {
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      body.style.overflow = prev.bodyOverflow;
      html.style.overflow = prev.htmlOverflow;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black animate-fade-in">
      <div className="relative flex-1 bg-black">
        {status.kind === "scanning" && (
          <ScanningOverlay step={scanStep} tier={SOURCE_TIER_LABEL[sourceKey]} notice={fallbackNotice} />
        )}

        {status.kind === "failed" && (
          <FailedOverlay
            sourceKey={sourceKey}
            media={media}
            season={season}
            episode={episode}
            detail={status.detail}
            logs={status.logs}
            onSwitchSource={switchSource}
            onClose={onClose}
          />
        )}

        {status.kind === "direct" && (
          <DirectVideo
            stream={status.stream}
            media={media}
            season={season}
            episode={episode}
            sourceKey={sourceKey}
            onSwitchSource={switchSource}
            onClose={onClose}
            onSwitchQuality={(q) => setStatus({ kind: "direct", stream: { ...status.stream, active: q } })}
          />
        )}

        {status.kind === "embed" && (
          <EmbedVideo url={status.url} media={media} season={season} episode={episode} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Loading / failure overlays
 * ============================================================ */

function ScanningOverlay({ step, tier, notice }: { step?: string; tier?: string; notice?: string | null }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const id = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / 10000) * 100);
      setProgress(pct);
      if (pct >= 100) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [step, tier]);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-black via-[#08090d] to-black text-white">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-full border border-primary/30 animate-[ping_2.4s_ease-out_infinite]" />
        <div className="absolute inset-3 rounded-full bg-primary/15 blur-2xl" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 animate-spin text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ animationDuration: "1.4s" }}
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.55" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.45em] text-white/50">
          {tier ? `Loading ${tier}` : "Loading stream"}
        </div>
        <div className="mt-2 text-base font-medium text-white/85">{step ?? "Just a sec…"}</div>
      </div>
      <div className="mt-1 h-1 w-64 max-w-[70vw] overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-primary transition-[width] duration-200 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      {notice && (
        <div className="mt-2 max-w-sm rounded-full bg-amber-500/10 px-3 py-1.5 text-center text-[11px] font-medium text-amber-200 ring-1 ring-amber-300/30 animate-fade-in">
          {notice}
        </div>
      )}
    </div>
  );
}

function FailedOverlay({
  sourceKey,
  media,
  season,
  episode,
  detail,
  logs,
  onSwitchSource,
  onClose,
}: {
  sourceKey: SourceKey;
  media: Media;
  season?: number;
  episode?: number;
  detail?: string;
  logs?: { step: string; status: "ok" | "fail"; detail?: string }[];
  onSwitchSource: (k: SourceKey) => void;
  onClose: () => void;
}) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center text-white animate-fade-in">
      <div className="text-xs uppercase tracking-[0.3em] text-white/55">No stream found</div>
      <div className="text-lg font-semibold">{SOURCE_TIER_LABEL[sourceKey]} couldn't load this title.</div>
      {detail && <p className="max-w-sm text-sm text-white/50">{detail}</p>}
      {logs && logs.length > 0 && (
        <div className="w-full max-w-sm">
          <button
            onClick={() => setShowLogs((v) => !v)}
            className="text-xs uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
          >
            {showLogs ? "Hide details" : "Show details"}
          </button>
          {showLogs && (
            <ul className="mt-3 max-h-48 overflow-auto rounded-md border border-white/10 bg-white/5 p-3 text-left text-[11px] font-mono text-white/70 space-y-1">
              {logs.map((l, i) => (
                <li key={i} className={l.status === "fail" ? "text-red-300" : "text-emerald-300"}>
                  <span className="opacity-60">[{l.status}]</span> {l.step}
                  {l.detail ? ` — ${l.detail}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {false && (
          <button
            onClick={() => onSwitchSource("prionix")}
            className="rounded-lg bg-white/10 px-5 h-10 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20"
          >
            Switch to Backup Sources
          </button>
        )}
        <a
          href="/settings"
          className="rounded-lg bg-primary/90 px-5 h-10 inline-flex items-center text-sm font-semibold text-primary-foreground hover:bg-primary"
        >
          Open Settings
        </a>
        <button onClick={onClose} className="rounded-lg px-4 h-10 text-sm font-medium text-white/60 hover:text-white">
          Close
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * Prionix iframe embed + postMessage API (backed by zxcstream.xyz)
 *
 * The player posts these message types via window.parent.postMessage()
 * once embedded in an iframe:
 *   VIDEO_PLAY             {"type":"VIDEO_PLAY"}
 *   VIDEO_PAUSE            {"type":"VIDEO_PAUSE"}
 *   VIDEO_PROGRESS         {"type":"VIDEO_PROGRESS","payload":{progressKey,currentTime,duration,percent}}
 *   VIDEO_NINETY_PERCENT   {"type":"VIDEO_NINETY_PERCENT","payload":{progressKey,currentTime,duration}}
 *   VIDEO_ENDED            {"type":"VIDEO_ENDED","payload":{progressKey}}
 * VIDEO_PROGRESS fires every 60s after the first 60s of playback;
 * VIDEO_NINETY_PERCENT fires once per session. Always check event.data.type.
 *
 * The iframe is sandboxed — no allow-popups / allow-popups-to-escape-sandbox
 * / allow-top-navigation / allow-modals — so the embed can't open popup
 * windows/tabs, hijack the top-level page, or throw native alert/confirm
 * dialogs. allow-scripts + allow-same-origin are kept so the player itself
 * (and its postMessage calls) still work.
 * ============================================================ */

type PrionixMessage =
  | { type: "VIDEO_PLAY" }
  | { type: "VIDEO_PAUSE" }
  | {
      type: "VIDEO_PROGRESS";
      payload: { progressKey: string; currentTime: number; duration: number; percent: number };
    }
  | {
      type: "VIDEO_NINETY_PERCENT";
      payload: { progressKey: string; currentTime: number; duration: number };
    }
  | { type: "VIDEO_ENDED"; payload: { progressKey: string } };

function EmbedVideo({
  url,
  media,
  season,
  episode,
  onClose,
}: {
  url: string;
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const seasonKey = season ?? null;
  const epKey = episode ?? null;

  const recordProgress = useCallback(
    (currentTime: number, duration: number, completed: boolean) => {
      if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return;
      const entry = {
        mediaId: media.id,
        mediaType: media.type,
        season: seasonKey,
        episode: epKey,
        positionSeconds: Math.max(0, Math.floor(currentTime)),
        durationSeconds: Math.max(0, Math.floor(duration)),
        title: media.title,
        poster: media.poster ?? null,
        backdrop: media.backdrop ?? null,
        completed,
        updatedAt: Date.now(),
      };
      saveProgressLocal(entry);
      void syncProgressUp(entry);
    },
    [media.id, media.type, media.title, media.poster, media.backdrop, seasonKey, epKey],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Prionix's player content may be served from a subdomain (e.g.
      // embed.zxcstream.xyz) rather than the bare zxcstream.xyz page we embed,
      // so match any zxcstream.xyz subdomain rather than one exact origin.
      //
      // The actual VIDEO_* events are frequently posted from a further-nested
      // sandboxed/blob iframe *inside* the zxcstream page (their player core is
      // isolated from ad code that way). That inner frame has an opaque origin,
      // so event.origin comes through as the literal string "null" rather than
      // "https://zxcstream.xyz" — new URL("null") throws, and returning early
      // on that throw was silently dropping every real event before we even
      // looked at data.type. Treat "null"/unparseable origins as acceptable and
      // fall back to validating the message shape instead, since an opaque
      // origin can't be verified by hostname anyway.
      let isZxcstreamOrigin: boolean;
      if (event.origin === "null") {
        isZxcstreamOrigin = true;
      } else {
        try {
          const originHost = new URL(event.origin).hostname.toLowerCase();
          isZxcstreamOrigin = originHost === "zxcstream.xyz" || originHost.endsWith(".zxcstream.xyz");
        } catch {
          isZxcstreamOrigin = true; // unparseable origin — fall back to shape check below
        }
      }
      if (!isZxcstreamOrigin) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug("[Prionix] dropped message from unexpected origin", event.origin, event.data);
        }
        return;
      }

      // Some embeds post JSON-stringified payloads instead of structured objects.
      let data: PrionixMessage | undefined;
      if (typeof event.data === "string") {
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
      } else {
        data = event.data as PrionixMessage | undefined;
      }
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "VIDEO_PLAY":
        case "VIDEO_PAUSE":
          break;
        case "VIDEO_PROGRESS": {
          const { currentTime, duration } = data.payload;
          recordProgress(currentTime, duration, false);
          break;
        }
        case "VIDEO_NINETY_PERCENT": {
          const { currentTime, duration } = data.payload;
          recordProgress(currentTime, duration, false);
          break;
        }
        case "VIDEO_ENDED": {
          const saved = getLocalProgressFor(media.id, seasonKey, epKey);
          recordProgress(saved?.durationSeconds ?? 0, saved?.durationSeconds ?? 0, true);
          break;
        }
        default:
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug("[Prionix] unhandled message", data);
          }
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [media.id, seasonKey, epKey, recordProgress]);

  return (
    <div className="relative h-full w-full bg-black">
      <iframe
        ref={iframeRef}
        src={url}
        title={media.title}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        // No allow-popups / allow-popups-to-escape-sandbox / allow-top-navigation
        // / allow-modals: blocks popup windows/tabs, top-level hijacking, and
        // native alert/confirm/prompt dialogs from the embed.
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <button
          onClick={onClose}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur hover:bg-black/70"
          aria-label="Close player"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * Direct (custom HLS) video surface
 * ============================================================ */

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type PartyMsg =
  | { t: "play"; at: number }
  | { t: "pause"; at: number }
  | { t: "seek"; at: number }
  | { t: "rate"; rate: number }
  | { t: "ping" };

function useWatchParty(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [roomId, setRoomId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("party");
  });
  const channelRef = useRef<BroadcastChannel | null>(null);
  const muteEventsRef = useRef(false);

  useEffect(() => {
    if (!roomId || typeof window === "undefined") return;
    const ch = new BroadcastChannel(`sleepy-party-${roomId}`);
    channelRef.current = ch;
    ch.onmessage = (ev) => {
      const v = videoRef.current;
      if (!v) return;
      const msg = ev.data as PartyMsg;
      muteEventsRef.current = true;
      try {
        if (msg.t === "play") {
          if (Math.abs(v.currentTime - msg.at) > 1) v.currentTime = msg.at;
          void v.play().catch(() => {});
        } else if (msg.t === "pause") {
          if (Math.abs(v.currentTime - msg.at) > 1) v.currentTime = msg.at;
          if (!v.paused) v.pause();
        } else if (msg.t === "seek") {
          v.currentTime = msg.at;
        } else if (msg.t === "rate") {
          v.playbackRate = msg.rate;
        }
      } finally {
        setTimeout(() => {
          muteEventsRef.current = false;
        }, 250);
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [roomId, videoRef]);

  const send = useCallback((m: PartyMsg) => {
    if (muteEventsRef.current) return;
    channelRef.current?.postMessage(m);
  }, []);

  const startParty = useCallback(() => {
    const id = Math.random().toString(36).slice(2, 8);
    setRoomId(id);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("party", id);
      window.history.replaceState({}, "", u.toString());
    }
    return id;
  }, []);

  const endParty = useCallback(() => {
    setRoomId(null);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.delete("party");
      window.history.replaceState({}, "", u.toString());
    }
  }, []);

  return useMemo(() => ({ roomId, startParty, endParty, send }), [roomId, startParty, endParty, send]);
}

function DirectVideo({
  stream,
  media,
  season,
  episode,
  sourceKey,
  onSwitchSource,
  onClose,
  onSwitchQuality,
}: {
  stream: DirectStream;
  media: Media;
  season?: number;
  episode?: number;
  sourceKey: SourceKey;
  onSwitchSource: (k: SourceKey) => void;
  onClose: () => void;
  onSwitchQuality: (q: ResolvedQuality) => void;
}) {
  const [settings, setSettings] = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<number | null>(null);
  const bufferingTimer = useRef<number | null>(null);
  const resumeRef = useRef<{ time: number; play: boolean } | null>(null);
  const playbackRef = useRef({ current: 0, playing: false });
  const failedUrlsRef = useRef<Set<string>>(new Set());
  const playRequestRef = useRef(0);
  const playPendingRef = useRef(false);

  const [error, setError] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsVisibleRef = useRef(true);
  const ignoreNextVideoClickRef = useRef(false);
  const [openMenu, setOpenMenu] = useState<null | "settings" | "party">(null);
  const [settingsTab, setSettingsTab] = useState<"quality" | "subs" | "speed" | "playback">("quality");
  const [activeSub, setActiveSub] = useState<string | null>(
    () => stream.subs.find((s) => s.language === "en")?.language ?? stream.subs[0]?.language ?? null,
  );
  const [partyToast, setPartyToast] = useState<string | null>(null);

  // One-shot 4K nudge — marks itself seen on first render so it never auto-pops again.
  const [showQualityNudge, setShowQualityNudge] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.localStorage.getItem("peachify:nudge:4k")) return false;
    window.localStorage.setItem("peachify:nudge:4k", "1");
    return true;
  });
  useEffect(() => {
    if (!showQualityNudge) return;
    const id = window.setTimeout(() => setShowQualityNudge(false), 7000);
    return () => window.clearTimeout(id);
  }, [showQualityNudge]);

  const party = useWatchParty(videoRef);

  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
  }, [controlsVisible]);

  const switchQuality = useCallback(
    (q: ResolvedQuality) => {
      const v = videoRef.current;
      resumeRef.current = v
        ? { time: v.currentTime || playbackRef.current.current, play: !v.paused }
        : { time: playbackRef.current.current, play: playbackRef.current.playing };
      onSwitchQuality(q);
    },
    [onSwitchQuality],
  );

  const tryNextSource = useCallback(() => {
    failedUrlsRef.current.add(stream.active.url);
    const next = stream.qualities.find((q) => q.url !== stream.active.url && !failedUrlsRef.current.has(q.url));
    if (next) {
      setError(false);
      setBuffering(false);
      switchQuality(next);
    } else if (false) {
      onSwitchSource("gamma");
    } else setError(true);
  }, [
    stream.active.url,
    stream.qualities,
    switchQuality,
    sourceKey,
    onSwitchSource,
    settings.integrations.febboxCookie,
  ]);

  useEffect(() => {
    failedUrlsRef.current = new Set();
  }, [media.id, season, episode, stream.source.id]);

  const requestPlay = useCallback(async (mutedFallback = false) => {
    const video = videoRef.current;
    if (!video) return false;
    const requestId = ++playRequestRef.current;
    if (!video.paused && !video.ended) return true;
    playPendingRef.current = true;
    try {
      await video.play();
      return true;
    } catch (error) {
      if (requestId !== playRequestRef.current) return false;
      if (error instanceof DOMException && error.name === "AbortError") return false;
      if (!mutedFallback || !video.paused) return false;
      try {
        video.muted = true;
        setMuted(true);
        await video.play();
        return true;
      } catch {
        return false;
      }
    } finally {
      if (requestId === playRequestRef.current) playPendingRef.current = false;
    }
  }, []);

  const requestPause = useCallback(() => {
    const video = videoRef.current;
    playRequestRef.current += 1;
    playPendingRef.current = false;
    if (video && !video.paused) video.pause();
  }, []);

  // Load HLS or progressive
  useEffect(() => {
    setError(false);
    const video = videoRef.current;
    if (!video) return;
    hlsRef.current?.destroy();
    hlsRef.current = null;

    const { url, isHls } = stream.active;
    const restorePlayback = () => {
      const resume = resumeRef.current;
      if (!resume) return;
      if (resume.time > 1 && Number.isFinite(resume.time)) video.currentTime = resume.time;
      if (resume.play) void requestPlay(true);
      resumeRef.current = null;
    };
    video.addEventListener("loadedmetadata", restorePlayback, { once: true });
    const canNative = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (isHls && Hls.isSupported() && !canNative) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Start at the lowest rendition so playback begins ~instantly,
        // then let ABR upgrade as bandwidth is measured.
        startLevel: 0,
        autoStartLoad: true,
        capLevelToPlayerSize: true,
        // Larger forward buffer so a brief network dip doesn't stall playback.
        maxBufferLength: 30,
        maxMaxBufferLength: 120,
        backBufferLength: 60,
        maxBufferSize: 120 * 1000 * 1000,
        // Assume reasonable bandwidth on first segment so ABR doesn't stall low.
        abrEwmaDefaultEstimate: 3_000_000,
        abrBandWidthFactor: 0.9,
        abrBandWidthUpFactor: 0.75,
        // Tolerate small gaps between fragments; keep it tight so nudging
        // during a seek doesn't skip past the user's target time.
        maxBufferHole: 0.5,
        maxFragLookUpTolerance: 0.25,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 8,
        // Aggressive but bounded retries so a single bad CDN edge doesn't
        // freeze playback for 10+ seconds.
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 500,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 500,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        startFragPrefetch: true,
        progressive: true,
        testBandwidth: false,
      });

      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url));
      let hlsFatalRecoveries = 0;
      let stallRecoveries = 0;
      let startedPlayback = false;
      const startupTimer = window.setTimeout(() => {
        if (!settings.player.autoplay || startedPlayback || video.currentTime >= 0.5) return;
        try {
          hls.startLoad(0);
        } catch {}
        void requestPlay(true);
        window.setTimeout(() => {
          if (!startedPlayback && video.currentTime < 0.5 && !video.paused) tryNextSource();
        }, 5000);
      }, 5000);
      const markStarted = () => {
        startedPlayback = true;
        window.clearTimeout(startupTimer);
      };
      video.addEventListener("playing", markStarted);
      video.addEventListener("timeupdate", markStarted, { once: true });
      // Kick playback as soon as the manifest is parsed. Browsers may reject
      // unmuted autoplay; retry muted so the stream actually starts instead
      // of sitting in "buffering" forever.
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (settings.player.autoplay) void requestPlay(true);
      });
      hls.on(Hls.Events.ERROR, (_e: unknown, data: any) => {
        if (!data?.fatal) {
          if (
            data?.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data?.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            data?.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
          ) {
            stallRecoveries += 1;
            try {
              hls.startLoad(video.currentTime || -1);
            } catch {}
            if (stallRecoveries >= 3) {
              try {
                hls.recoverMediaError();
              } catch {}
              stallRecoveries = 0;
            }
          }
          return;
        }
        if (!data?.fatal) return;
        hlsFatalRecoveries += 1;
        if (hlsFatalRecoveries > 2 || data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
          tryNextSource();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try {
            hls.startLoad(video.currentTime || -1);
            return;
          } catch {}
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hls.recoverMediaError();
            return;
          } catch {}
        }
        tryNextSource();
      });

      // On seek: tell hls.js to flush old fragments and load from the new
      // position immediately. This is what makes fast-forward feel instant
      // instead of waiting for the in-flight fragment to finish.
      const onSeeking = () => {
        try {
          hls.stopLoad();
          hls.startLoad(video.currentTime);
        } catch {}
      };
      video.addEventListener("seeking", onSeeking);

      // Stall watchdog: only fire when we're truly stuck (readyState < 3)
      // AND not actively seeking. Past versions nudged currentTime forward
      // during seeks, which skipped past the user's target.
      let lastT = video.currentTime;
      let stuck = 0;
      const stallTick = window.setInterval(() => {
        if (video.paused || video.ended || video.seeking) {
          stuck = 0;
          lastT = video.currentTime;
          return;
        }
        if (video.readyState >= 3) {
          stuck = 0;
          lastT = video.currentTime;
          return;
        }
        if (Math.abs(video.currentTime - lastT) > 0.05) {
          lastT = video.currentTime;
          stuck = 0;
          return;
        }
        stuck += 1;
        if (stuck >= 3) {
          try {
            hls.startLoad(video.currentTime);
          } catch {}
          try {
            hls.recoverMediaError();
          } catch {}
          try {
            const b = video.buffered;
            for (let i = 0; i < b.length; i++) {
              if (video.currentTime < b.start(i) && b.start(i) - video.currentTime < 3) {
                video.currentTime = b.start(i) + 0.05;
                break;
              }
            }
          } catch {}
          stuck = 0;
        }
      }, 1000);
      hls.on(Hls.Events.DESTROYING, () => {
        window.clearTimeout(startupTimer);
        window.clearInterval(stallTick);
        video.removeEventListener("seeking", onSeeking);
        video.removeEventListener("playing", markStarted);
        video.removeEventListener("timeupdate", markStarted);
      });
    } else {
      video.src = url;
      const tryPlay = () => {
        if (settings.player.autoplay) void requestPlay(true);
      };
      video.addEventListener("loadedmetadata", tryPlay, { once: true });
    }

    const onErr = () => {
      // Ignore spurious error events: only treat as fatal if the media element
      // reports a real decode/network failure on the URL we're currently loading.
      // Without this guard, browsers fire `error` during source swaps or when
      // play() is interrupted, which previously caused an instant fallback to
      // the embed surface on the user's first click.
      const err = video.error;
      if (!err) return;
      if (err.code === err.MEDIA_ERR_ABORTED) return;
      if (!video.currentSrc) return;
      tryNextSource();
    };
    video.addEventListener("error", onErr);
    return () => {
      playRequestRef.current += 1;
      playPendingRef.current = false;
      video.removeEventListener("loadedmetadata", restorePlayback);
      video.removeEventListener("error", onErr);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [stream.active, stream.qualities, switchQuality, tryNextSource, requestPlay, settings.player.autoplay]);

  // Track video state — debounce buffering by 1.5s so brief stalls don't toast.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      playbackRef.current.playing = true;
      setPlaying(true);
      party.send({ t: "play", at: v.currentTime });
    };
    const onPause = () => {
      playbackRef.current.playing = false;
      setPlaying(false);
      party.send({ t: "pause", at: v.currentTime });
    };
    const onWaiting = () => {
      if (bufferingTimer.current) return;
      bufferingTimer.current = window.setTimeout(() => {
        bufferingTimer.current = null;
        setBuffering(true);
      }, 900);
    };
    const onReady = () => {
      if (bufferingTimer.current) {
        window.clearTimeout(bufferingTimer.current);
        bufferingTimer.current = null;
      }
      setBuffering(false);
    };
    const onTime = () => {
      setCurrent(v.currentTime);
      playbackRef.current.current = v.currentTime;
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onMeta = () => setDuration(v.duration || 0);
    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onRate = () => setRate(v.playbackRate);
    const onSeeked = () => party.send({ t: "seek", at: v.currentTime });
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("stalled", onWaiting);
    v.addEventListener("canplay", onReady);
    v.addEventListener("playing", onReady);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("ratechange", onRate);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("stalled", onWaiting);
      v.removeEventListener("canplay", onReady);
      v.removeEventListener("playing", onReady);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("ratechange", onRate);
      v.removeEventListener("seeked", onSeeked);
      if (bufferingTimer.current) {
        window.clearTimeout(bufferingTimer.current);
        bufferingTimer.current = null;
      }
    };
  }, [party]);

  // Resume from saved progress
  const resumedKeyRef = useRef<string>("");
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seasonKey = season ?? null;
    const epKey = episode ?? null;
    const key = `${media.id}:${seasonKey}:${epKey}`;
    if (resumedKeyRef.current === key) return;
    resumedKeyRef.current = key;
    const saved = getLocalProgressFor(media.id, seasonKey, epKey);
    if (!saved || saved.positionSeconds < 15) return;
    const tryResume = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        const target = Math.min(saved.positionSeconds, v.duration - 10);
        if (target > 5) v.currentTime = target;
      }
    };
    if (v.readyState >= 1) tryResume();
    else v.addEventListener("loadedmetadata", tryResume, { once: true });
  }, [media.id, season, episode]);

  // Save progress every ~5s while playing
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let last = 0;
    const id = window.setInterval(() => {
      if (!v.duration || !Number.isFinite(v.duration)) return;
      if (v.paused) return;
      if (v.currentTime - last < 4) return;
      last = v.currentTime;
      const entry = {
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: v.currentTime,
        durationSeconds: v.duration,
        title: media.title,
        poster: media.poster,
        backdrop: media.backdrop,
        completed: v.duration > 0 && v.currentTime / v.duration > 0.95,
        updatedAt: Date.now(),
      };
      saveProgressLocal(entry);
      void syncProgressUp(entry);
    }, 5000);
    const onEnded = () => {
      if (!v.duration) return;
      const entry = {
        mediaId: media.id,
        mediaType: media.type,
        season: season ?? null,
        episode: episode ?? null,
        positionSeconds: v.duration,
        durationSeconds: v.duration,
        title: media.title,
        poster: media.poster,
        backdrop: media.backdrop,
        completed: true,
        updatedAt: Date.now(),
      };
      saveProgressLocal(entry);
      void syncProgressUp(entry);
    };
    v.addEventListener("ended", onEnded);
    return () => {
      window.clearInterval(id);
      v.removeEventListener("ended", onEnded);
    };
  }, [media.id, media.type, media.title, media.poster, media.backdrop, season, episode]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const isHoveringRef = useRef(false);
  const fullscreenRef = useRef(false);
  useEffect(() => {
    fullscreenRef.current = fullscreen;
    if (!fullscreen) {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setControlsVisible(true);
    }
  }, [fullscreen]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setControlsVisible(true);
    hideTimer.current = window.setTimeout(() => {
      if (openMenu) return;
      if (videoRef.current && videoRef.current.paused) return;
      setControlsVisible(false);
    }, 3000);
  }, [openMenu]);

  const revealControls = scheduleHide;
  useEffect(() => {
    scheduleHide();
  }, [scheduleHide]);

  // Window-level wake handlers — always reveal controls on ANY pointer activity
  // or keypress while the player is mounted. Previously we bounding-box-checked
  // the pointer position, which silently broke in fullscreen + cursor:none on
  // some browsers and left the bar stuck off-screen.
  useEffect(() => {
    const wake = () => revealControls();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("touchstart", wake, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("wheel", wake, { passive: true });
    document.addEventListener("mousemove", wake, { passive: true });
    return () => {
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
      document.removeEventListener("mousemove", wake);
    };
  }, [revealControls]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = tracks[i].language === activeSub ? "showing" : "disabled";
    }
  }, [activeSub, stream.subs.length]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void requestPlay(true);
    else requestPause();
  }, [requestPause, requestPlay]);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen().catch(() => {});
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowright":
        case "l":
          seekBy(10);
          break;
        case "arrowleft":
        case "j":
          seekBy(-10);
          break;
        case "arrowup": {
          const v = videoRef.current;
          if (v) v.volume = Math.min(1, v.volume + 0.05);
          break;
        }
        case "arrowdown": {
          const v = videoRef.current;
          if (v) v.volume = Math.max(0, v.volume - 0.05);
          break;
        }
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "p":
          togglePip();
          break;
        case "c": {
          const next = activeSub
            ? null
            : (stream.subs.find((s) => s.language === "en")?.language ?? stream.subs[0]?.language ?? null);
          setActiveSub(next);
          break;
        }
      }
      scheduleHide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleMute, toggleFullscreen, togglePip, scheduleHide, activeSub, stream.subs]);

  const sub = settings.subtitle;
  const subShadow =
    sub.edgeStyle === "outline"
      ? "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
      : sub.edgeStyle === "shadow"
        ? "0 2px 6px rgba(0,0,0,0.85)"
        : "none";
  const fontFamily =
    sub.font === "Mono" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : `${sub.font}, system-ui, sans-serif`;

  const handlePartyShare = async () => {
    let id = party.roomId;
    if (!id) id = party.startParty();
    if (typeof window !== "undefined") {
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
        setPartyToast("Link copied!");
      } catch {
        setPartyToast(`Room: ${id}`);
      }
      setTimeout(() => setPartyToast(null), 2200);
    }
  };

  const barVisible = controlsVisible || !playing;

  return (
    <div
      ref={containerRef}
      className="group relative h-full w-full select-none bg-black"
      onMouseMove={revealControls}
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onMouseEnter={() => {
        isHoveringRef.current = true;
        revealControls();
      }}
      onTouchStart={revealControls}
      onMouseLeave={() => {
        isHoveringRef.current = false;
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        if (videoRef.current && !videoRef.current.paused && !openMenu) {
          hideTimer.current = window.setTimeout(() => setControlsVisible(false), 1500);
        }
      }}
      style={{ cursor: barVisible ? "default" : "none" }}
    >
      <video
        ref={videoRef}
        playsInline
        className="h-full w-full bg-black"
        onPointerDown={() => {
          if (!controlsVisibleRef.current && playing) ignoreNextVideoClickRef.current = true;
          revealControls();
        }}
        onClick={() => {
          if (ignoreNextVideoClickRef.current) {
            ignoreNextVideoClickRef.current = false;
            revealControls();
            return;
          }
          revealControls();
          togglePlay();
        }}
        onDoubleClick={toggleFullscreen}
      >
        {stream.subs.map((s) => (
          <track
            key={s.url}
            kind="subtitles"
            src={`/api/public/subtitle?url=${encodeURIComponent(s.url)}`}
            srcLang={s.language}
            label={s.label}
            default={s.language === "en"}
          />
        ))}
      </video>

      {/* SourceRail removed — VidAPI is the only embed source. */}

      {/* Top bar — reliably wakes on hover/pointer activity in both windowed and fullscreen. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pb-10 pt-4 md:px-6 md:pt-5 transition-all duration-300 ${
          barVisible ? "opacity-100 translate-y-0" : "pointer-events-none -translate-y-3 opacity-0"
        }`}
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={onClose}
          className="pointer-events-auto group inline-flex h-10 items-center gap-1.5 rounded-full bg-black/55 pl-2.5 pr-3.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/75"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5 transition group-hover:-translate-x-0.5" strokeWidth={2.2} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="pointer-events-none flex min-w-0 flex-1 items-center justify-center gap-2.5 px-2 pt-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          <span className="truncate text-sm font-semibold text-white drop-shadow-md">{media.title}</span>
          {season && episode && (
            <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-white/85 ring-1 ring-white/10">
              S{season} · E{episode}
            </span>
          )}
          <span className="hidden shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60 ring-1 ring-white/10 sm:inline-flex">
            {SOURCE_TIER_LABEL[sourceKey]}
          </span>
        </div>
      </div>

      {/* Subtitle style */}
      <style>{`
        video::cue {
          color: ${sub.color};
          background: rgba(0,0,0,${sub.bgOpacity / 100});
          font-family: ${fontFamily};
          font-size: ${sub.size}px;
          text-shadow: ${subShadow};
          line-height: 1.25;
        }
      `}</style>

      {party.roomId && (
        <div className="absolute left-3 top-14 z-30 flex items-center gap-2 rounded-full bg-fuchsia-500/20 px-3 py-1 text-xs font-semibold text-fuchsia-100 ring-1 ring-fuchsia-300/40 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-300" />
          Watch Party · {party.roomId}
        </div>
      )}
      {partyToast && (
        <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/10 backdrop-blur">
          {partyToast}
        </div>
      )}

      {/* One-time 4K nudge */}
      {!settings.integrations.febboxCookie?.trim() && showQualityNudge && (
        <div className="absolute right-5 top-20 z-40 w-72 overflow-hidden rounded-2xl bg-black/85 text-white ring-1 ring-white/15 shadow-2xl backdrop-blur-md animate-fade-in">
          <div className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/40">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="m12 3 2.5 5.5L20 9l-4 4 1 6-5-2.5L7 19l1-6-4-4 5.5-.5z" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Unlock 4K with Gamma</div>
              <p className="mt-0.5 text-[11px] leading-snug text-white/65">
                Add a FebBox cookie in Settings to enable Gamma — direct streams up to 2160p.
              </p>
            </div>
            <button
              onClick={() => setShowQualityNudge(false)}
              className="-mr-1 -mt-1 rounded-full p-1.5 text-white/55 hover:bg-white/10 hover:text-white"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Center play button — clean, minimal, only when not yet started */}
      {!playing && current === 0 && !error && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <button
            onClick={togglePlay}
            aria-label="Play"
            className="pointer-events-auto group/play flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-black shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur transition hover:scale-110 hover:bg-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-[1px] fill-current">
              <path d="M8 5.5v13a.5.5 0 0 0 .77.42l10.5-6.5a.5.5 0 0 0 0-.84l-10.5-6.5A.5.5 0 0 0 8 5.5Z" />
            </svg>
          </button>
        </div>
      )}

      {/* Buffering toast — only after 1.5s sustained buffering */}
      {buffering && playing && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-32 z-30 flex justify-center px-4 sm:bottom-36">
          <div className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/10 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.2-8.55" />
            </svg>
            Buffering…
          </div>
        </div>
      )}

      {/* Controls overlay — full width in both windowed and fullscreen. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-14 transition-all duration-300 ease-out ${
          barVisible ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-4 opacity-0"
        }`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex w-full flex-col gap-2 px-4 md:px-8">
          {/* Seekbar — thicker track, larger hit area, visible handle on hover/touch */}
          <div className="pointer-events-auto group/seek relative px-0.5 py-2">
            <div className="relative h-1.5 w-full overflow-visible rounded-full bg-white/15 transition-[height] duration-150 group-hover/seek:h-2">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                style={{ width: duration ? `${(buffered / duration) * 100}%` : "0%" }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }}
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (v) v.currentTime = Number(e.target.value);
                }}
                aria-label="Seek"
                className="absolute -inset-y-3 inset-x-0 h-[calc(100%+1.5rem)] w-full cursor-pointer opacity-0"
              />
              <div
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 ring-2 ring-white shadow-lg transition-opacity group-hover/seek:opacity-100"
                style={{ left: duration ? `${(current / duration) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Buttons row — left cluster + spacer + right cluster.
            No interior pill — gradient + spacing carry the visual weight. */}
          <div className="pointer-events-auto flex items-center gap-1 text-white">
            <IconBtn label={playing ? "Pause (k)" : "Play (k)"} onClick={togglePlay}>
              {playing ? (
                <Pause className="h-6 w-6 fill-current" strokeWidth={0} />
              ) : (
                <Play className="h-6 w-6 fill-current" strokeWidth={0} />
              )}
            </IconBtn>

            <IconBtn label="Back 10s (j)" onClick={() => seekBy(-10)}>
              <span className="relative inline-flex h-6 w-6 items-center justify-center">
                <RotateCcw className="h-6 w-6" strokeWidth={2} />
                <span className="absolute text-[8px] font-bold tabular-nums">10</span>
              </span>
            </IconBtn>
            <IconBtn label="Forward 10s (l)" onClick={() => seekBy(10)}>
              <span className="relative inline-flex h-6 w-6 items-center justify-center">
                <RotateCw className="h-6 w-6" strokeWidth={2} />
                <span className="absolute text-[8px] font-bold tabular-nums">10</span>
              </span>
            </IconBtn>

            <div className="group/vol ml-1 flex items-center">
              <IconBtn label="Mute (m)" onClick={toggleMute}>
                {muted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" strokeWidth={2} />
                ) : (
                  <Volume2 className="h-5 w-5" strokeWidth={2} />
                )}
              </IconBtn>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (v) {
                    v.muted = false;
                    v.volume = Number(e.target.value);
                  }
                }}
                aria-label="Volume"
                className="ml-1 hidden h-1 w-24 cursor-pointer accent-primary group-hover/vol:block"
              />
            </div>

            <div className="ml-3 text-[13px] font-medium tabular-nums text-white/95">
              {formatTime(current)}
              <span className="mx-1 text-white/40">/</span>
              <span className="text-white/55">{formatTime(duration)}</span>
            </div>

            <div className="ml-auto flex items-center gap-0.5">
              <IconBtn label="Picture in Picture (p)" onClick={togglePip}>
                <PictureInPicture2 className="h-5 w-5" strokeWidth={2} />
              </IconBtn>
              <IconBtn label="Cast" onClick={startCast}>
                <Cast className="h-5 w-5" strokeWidth={2} />
              </IconBtn>
              <IconBtn
                label="Subtitles (c)"
                onClick={() => {
                  const next = activeSub
                    ? null
                    : (stream.subs.find((s) => s.language === "en")?.language ?? stream.subs[0]?.language ?? null);
                  setActiveSub(next);
                }}
              >
                <SubtitlesIcon className={`h-5 w-5 ${activeSub ? "text-primary" : ""}`} strokeWidth={2} />
              </IconBtn>
              <MenuBtn
                label="Settings"
                open={openMenu === "settings"}
                onToggle={() => setOpenMenu(openMenu === "settings" ? null : "settings")}
              >
                <SettingsIcon className="h-5 w-5" strokeWidth={1.9} />
              </MenuBtn>
              {openMenu === "settings" && (
                <SettingsPanel
                  onClose={() => setOpenMenu(null)}
                  tab={settingsTab}
                  setTab={setSettingsTab}
                  stream={stream}
                  onSwitchQuality={(q) => switchQuality(q)}
                  activeSub={activeSub}
                  setActiveSub={setActiveSub}
                  sub={sub}
                  setSettings={setSettings}
                  rate={rate}
                  onSetRate={(r) => {
                    const v = videoRef.current;
                    if (v) v.playbackRate = r;
                    party.send({ t: "rate", rate: r });
                  }}
                  sourceKey={sourceKey}
                  onSwitchSource={onSwitchSource}
                  pipEnabled={settings.player.pip}
                  onTogglePip={togglePip}
                  autoplay={settings.player.autoplay}
                  onToggleAutoplay={(v) => setSettings({ player: { ...settings.player, autoplay: v } })}
                />
              )}
              <IconBtn label="Fullscreen (f)" onClick={toggleFullscreen}>
                {fullscreen ? (
                  <Minimize className="h-5 w-5" strokeWidth={2} />
                ) : (
                  <Maximize className="h-5 w-5" strokeWidth={2} />
                )}
              </IconBtn>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 text-center text-white">
          <div className="text-xs uppercase tracking-[0.3em] text-white/55">Stream error</div>
          <div className="text-lg font-semibold">This quality didn't play.</div>
          {stream.qualities.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              {stream.qualities
                .filter((q) => q.url !== stream.active.url)
                .slice(0, 4)
                .map((q) => (
                  <button
                    key={q.url}
                    onClick={() => switchQuality(q)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                  >
                    Try {q.label || q.quality}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Shared building blocks
 * ============================================================ */

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white active:scale-95"
    >
      {children}
    </button>
  );
}

function MenuBtn({
  children,
  label,
  open,
  onToggle,
}: {
  children: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={label}
      aria-label={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white active:scale-95 ${
        open ? "bg-white/15 text-white" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Menu({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute bottom-16 right-4 z-30 w-64 rounded-xl border border-white/10 bg-black/95 p-2 text-white shadow-2xl backdrop-blur"
    >
      <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-white/40">{title}</div>
      {children}
    </div>
  );
}

/* ============================================================
 * Unified Settings panel (cog) — Sources / Quality / Subs / Speed / Playback
 * ============================================================ */

type SettingsTab = "quality" | "subs" | "speed" | "playback";

function SettingsPanel({
  onClose,
  tab,
  setTab,
  stream,
  onSwitchQuality,
  activeSub,
  setActiveSub,
  sub,
  setSettings,
  rate,
  onSetRate,
  sourceKey,
  onSwitchSource,
  pipEnabled,
  onTogglePip,
  autoplay,
  onToggleAutoplay,
}: {
  onClose: () => void;
  tab: SettingsTab;
  setTab: (t: SettingsTab) => void;
  stream: DirectStream;
  onSwitchQuality: (q: ResolvedQuality) => void;
  activeSub: string | null;
  setActiveSub: (s: string | null) => void;
  sub: {
    size: number;
    color: string;
    bgOpacity: number;
    font: string;
    edgeStyle: "none" | "shadow" | "outline";
  };
  setSettings: (patch: any) => void;
  rate: number;
  onSetRate: (r: number) => void;
  sourceKey: SourceKey;
  onSwitchSource: (k: SourceKey) => void;
  pipEnabled: boolean;
  onTogglePip: () => void;
  autoplay: boolean;
  onToggleAutoplay: (v: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "quality", label: "Quality" },
    { id: "subs", label: "Subtitles" },
    { id: "speed", label: "Speed" },
    { id: "playback", label: "Playback" },
  ];

  return (
    <div
      ref={ref}
      className="absolute bottom-16 right-4 z-40 w-80 overflow-hidden rounded-2xl border border-white/10 bg-black/95 text-white shadow-2xl backdrop-blur-md"
    >
      {/* Source switcher removed — VidAPI is the only embed source. */}

      {/* Tab strip */}
      <div className="flex border-b border-white/10 px-2 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-t-lg px-2 py-1.5 text-[11px] font-semibold transition ${
              tab === t.id ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {tab === "quality" && (
          <div className="space-y-1">
            {stream.qualities.length === 0 && (
              <div className="px-3 py-2 text-xs text-white/55">No quality options.</div>
            )}
            {stream.qualities.map((q) => (
              <button
                key={q.url}
                onClick={() => {
                  onSwitchQuality(q);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm ${
                  q.url === stream.active.url ? "bg-primary text-primary-foreground" : "text-white/85 hover:bg-white/10"
                }`}
              >
                <span>{q.label || q.quality}</span>
                {q.size && <span className="text-[10px] text-white/60">{q.size}</span>}
              </button>
            ))}
          </div>
        )}

        {tab === "subs" && (
          <div className="space-y-1">
            <button
              onClick={() => {
                setActiveSub(null);
                onClose();
              }}
              className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${
                !activeSub ? "bg-primary text-primary-foreground" : "text-white/85 hover:bg-white/10"
              }`}
            >
              Off
            </button>
            {stream.subs.map((s) => (
              <button
                key={s.url}
                onClick={() => {
                  setActiveSub(s.language);
                  onClose();
                }}
                className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${
                  activeSub === s.language ? "bg-primary text-primary-foreground" : "text-white/85 hover:bg-white/10"
                }`}
              >
                {s.label}
              </button>
            ))}
            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-white/40">Caption style</div>
              <label className="flex items-center justify-between px-2 py-1 text-xs text-white/80">
                <span>Size</span>
                <input
                  type="range"
                  min={12}
                  max={36}
                  value={sub.size}
                  onChange={(e) => setSettings({ subtitle: { ...sub, size: Number(e.target.value) } })}
                  className="ml-3 w-32 accent-primary"
                />
              </label>
              <label className="flex items-center justify-between px-2 py-1 text-xs text-white/80">
                <span>Background</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sub.bgOpacity}
                  onChange={(e) => setSettings({ subtitle: { ...sub, bgOpacity: Number(e.target.value) } })}
                  className="ml-3 w-32 accent-primary"
                />
              </label>
              <div className="flex items-center justify-between px-2 py-1 text-xs text-white/80">
                <span>Color</span>
                <div className="flex gap-1">
                  {["#ffffff", "#ffeb3b", "#00e5ff", "#ff8a65"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSettings({ subtitle: { ...sub, color: c } })}
                      className={`h-5 w-5 rounded-full ring-2 ${sub.color === c ? "ring-primary" : "ring-white/20"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-2 py-1 text-xs text-white/80">
                <span>Edge</span>
                <div className="flex gap-1">
                  {(["none", "shadow", "outline"] as const).map((e) => (
                    <button
                      key={e}
                      onClick={() => setSettings({ subtitle: { ...sub, edgeStyle: e } })}
                      className={`rounded-md px-2 py-0.5 text-[10px] capitalize ${
                        sub.edgeStyle === e ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "speed" && (
          <div className="grid grid-cols-3 gap-1.5 p-1">
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
              <button
                key={r}
                onClick={() => {
                  onSetRate(r);
                  onClose();
                }}
                className={`rounded-md px-2 py-1.5 text-sm font-medium ${
                  rate === r ? "bg-primary text-primary-foreground" : "bg-white/8 text-white/85 hover:bg-white/15"
                }`}
              >
                {r === 1 ? "Normal" : `${r}x`}
              </button>
            ))}
          </div>
        )}

        {tab === "playback" && (
          <div className="space-y-2 p-1">
            <SettingToggle
              label="Autoplay"
              hint="Start playing as soon as the stream loads"
              value={autoplay}
              onChange={onToggleAutoplay}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-white/8"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-white/55">{hint}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-primary" : "bg-white/15"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${value ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

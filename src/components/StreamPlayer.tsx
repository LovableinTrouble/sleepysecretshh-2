/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Loader2, X } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { sourceForKey } from "@/lib/sources";
import type { SourceKey } from "@/lib/sources";
import { getSettings } from "@/lib/store";
import { getLocalProgressFor, saveProgressLocal, syncProgressUp } from "@/lib/progress";
import type { DownloadItem } from "@/lib/downloads";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

export function StreamPlayer({ media, season, episode, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
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
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, [onClose]);

  const settings = getSettings();
  const sourceKey: SourceKey = settings.embedProvider === "webtor" ? "webtor" : "prionix";
  const source = sourceForKey(sourceKey);
  const url = source.build(media, season, episode);

  const player = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black animate-fade-in"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: "100dvh",
        width: "100vw",
        zIndex: 2147483000,
      }}
    >
      <div className="relative flex-1 bg-black">
        {source.kind === "webtor" ? (
          <WebTorStreamPlayer media={media} season={season} episode={episode} onClose={onClose} query={url} />
        ) : (
          <CineSrcEmbed url={url} media={media} season={season} episode={episode} onClose={onClose} />
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return player;
  return createPortal(player, document.body);
}

/* ============================================================
 * CineSrc iframe embed + postMessage API (backed by zxcstream.xyz)
 * ============================================================ */

type EmbedMessage = {
  type: string;
  currentTime?: number;
  duration?: number;
  season?: number;
  episode?: number;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  time?: number;
  sourceId?: string;
  error?: any;
  internalNavigation?: boolean;
  source?: string;
};

function CineSrcEmbed({
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
      let isAllowedOrigin: boolean;
      if (event.origin === "null") {
        isAllowedOrigin = true;
      } else {
        try {
          const originHost = new URL(event.origin).hostname.toLowerCase();
          isAllowedOrigin =
            originHost === "cinezo.live" ||
            originHost.endsWith(".cinezo.live");
        } catch {
          isAllowedOrigin = true;
        }
      }
      if (!isAllowedOrigin) return;

      let data: EmbedMessage | undefined;
      if (typeof event.data === "string") {
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
      } else {
        data = event.data as EmbedMessage | undefined;
      }
      if (!data || typeof (data as { type?: any }).type !== "string") return;

      const t = data.type;
      if (/timeupdate|time-update|progress/i.test(t)) {
        if (typeof data.currentTime === "number" && typeof data.duration === "number") {
          recordProgress(data.currentTime, data.duration, false);
        }
      } else if (/ended|complete/i.test(t)) {
        const saved = getLocalProgressFor(media.id, seasonKey, epKey);
        recordProgress(saved?.durationSeconds ?? 0, saved?.durationSeconds ?? 0, true);
      } else if (/close|exit/i.test(t)) {
        onClose();
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
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups-to-escape-sandbox"
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
 * WebTor Stream Player — searches for magnet links via the
 * downloads API, then streams via the webtor.io embed SDK.
 * Based on https://github.com/webtor-io/embed-sdk-js
 * ============================================================ */

const WEBTOR_SDK_URL = "/vendor/webtor-embed-sdk.min.js";
let webtorScriptPromise: Promise<void> | null = null;

function loadWebtorSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).__webtorLoaded) return Promise.resolve();
  if (webtorScriptPromise) return webtorScriptPromise;
  webtorScriptPromise = new Promise<void>((resolve, reject) => {
    (window as any).webtor = (window as any).webtor || [];
    const s = document.createElement("script");
    s.src = WEBTOR_SDK_URL;
    s.async = true;
    s.charset = "utf-8";
    s.onload = () => {
      (window as any).__webtorLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error("Failed to load WebTor SDK"));
    document.head.appendChild(s);
  });
  return webtorScriptPromise;
}

function WebTorStreamPlayer({
  media,
  season,
  episode,
  onClose,
  query,
}: {
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
  query: string;
}) {
  const [phase, setPhase] = useState<"searching" | "found" | "error">("searching");
  const [magnets, setMagnets] = useState<DownloadItem[]>([]);
  const [activeMagnet, setActiveMagnet] = useState<string | null>(null);
  const [webtorReady, setWebtorReady] = useState(false);
  const [webtorErr, setWebtorErr] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seasonKey = season ?? null;
  const epKey = episode ?? null;

  // Step 1: search for magnet links via the downloads API.
  useEffect(() => {
    let dead = false;
    setPhase("searching");
    setMagnets([]);
    (async () => {
      try {
        const params = new URLSearchParams({
          tmdbId: String(media.id),
          title: media.title,
          type: media.type !== "movie" ? "show" : "movie",
        });
        if (media.year) params.set("year", media.year);
        if (media.type !== "movie") {
          params.set("season", String(season ?? 1));
          params.set("episode", String(episode ?? 1));
        }
        const res = await fetch(`/api/downloads?${params.toString()}`);
        if (dead) return;
        const data = await res.json();
        if (dead) return;
        const allDownloads: DownloadItem[] = data.downloads || [];
        // Prefer magnet links, but fall back to .torrent URLs for WebTor.
        const magnetItems = allDownloads.filter(
          (d: DownloadItem) => d.type === "magnet" || d.url.startsWith("magnet:"),
        );
        const torrentItems = allDownloads.filter(
          (d: DownloadItem) => d.type === "torrent" || /\.torrent($|\?)/i.test(d.url),
        );
        const streamable = magnetItems.length > 0 ? magnetItems : torrentItems;
        if (streamable.length > 0) {
          setMagnets(streamable);
          setActiveMagnet(streamable[0].url);
          setPhase("found");
        } else {
          setPhase("error");
        }
      } catch {
        if (!dead) setPhase("error");
      }
    })();
    return () => {
      dead = true;
    };
  }, [media.id, media.title, media.year, media.type, season, episode]);

  // Step 2: when a magnet is selected, boot the WebTor SDK player.
  useEffect(() => {
    if (!activeMagnet || !containerRef.current) return;
    let dead = false;
    setWebtorErr(null);
    setWebtorReady(false);
    const el = containerRef.current;
    // Clear any previous SDK-inserted iframe when switching magnets
    el.innerHTML = "";

    loadWebtorSdk()
      .then(() => {
        if (dead || !containerRef.current) return;
        const config: Record<string, any> = {
          el,
          width: "100%",
          height: "100%",
          controls: true,
          lang: "en",
          title: media.title,
          on: (e: any) => {
            if (dead) return;
            const n = String(e?.name || "");
            if (n === "inited" || n === "player status") {
              setWebtorReady(true);
              try { e.player?.play?.(); } catch { /* ignore */ }
            }
            if (n === "torrent error") {
              setWebtorErr("Failed to load torrent. Try another source.");
            }
          },
        };
        if (activeMagnet.startsWith("magnet:")) {
          config.magnet = activeMagnet;
        } else {
          config.torrentUrl = activeMagnet;
        }
        (window as any).webtor = (window as any).webtor || [];
        (window as any).webtor.push(config);
        setTimeout(() => {
          if (!dead) setWebtorReady(true);
        }, 8000);
      })
      .catch((e) => {
        if (!dead) setWebtorErr(e?.message || "Failed to load streamer");
      });
    return () => {
      dead = true;
    };
  }, [activeMagnet, media.title]);

  return (
    <div className="relative h-full w-full bg-black">
      {phase === "searching" && (
        <div className="absolute inset-0 grid place-items-center text-white/60">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm">Searching for torrents…</p>
          </div>
        </div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div className="max-w-md">
            <p className="text-base font-bold text-white">No torrents found</p>
            <p className="mt-2 text-sm text-white/50">
              No magnet links were found for "{query}". Try switching back to CineSrc in Settings.
            </p>
            <button
              onClick={onClose}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {phase === "found" && activeMagnet && (
        <div className="absolute inset-0">
          <div ref={containerRef} className="h-full w-full" />
          {!webtorReady && !webtorErr && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-white/60">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}
          {webtorErr && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-destructive">
              {webtorErr}
            </div>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <button
          onClick={onClose}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur hover:bg-black/70"
          aria-label="Close player"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {magnets.length > 1 && (
          <div className="pointer-events-auto flex items-center gap-2">
            {magnets.slice(0, 5).map((m, i) => (
              <button
                key={m.id}
                onClick={() => setActiveMagnet(m.url)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  m.url === activeMagnet
                    ? "bg-primary text-primary-foreground"
                    : "bg-black/50 text-white/60 ring-1 ring-white/15 hover:bg-black/70"
                }`}
              >
                {m.quality || `S${i + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

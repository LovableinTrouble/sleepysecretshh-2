/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Download, Loader2, Play, Upload, X, Zap } from "lucide-react";
import type { Media } from "@/lib/catalog";
import type { DownloadItem } from "@/lib/downloads";

/* ============================================================
 * WebTor Embed SDK — loaded from the official CDN per
 * https://github.com/webtor-io/embed-sdk-js
 * The SDK auto-initializes `window.webtor` and exposes a
 * `push(config)` method that creates an iframe player at
 * `{baseUrl}/show?id={uuid}&mode=video`, passing the magnet
 * or torrentUrl via postMessage after the iframe loads.
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

interface DownloadsDialogProps {
  open: boolean;
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

export function DownloadsDialog({ open, media, season, episode, onClose }: DownloadsDialogProps) {
  const isSeries = media.type === "tv" || media.type === "anime";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [webtorOpen, setWebtorOpen] = useState(false);
  const [webtorMagnet, setWebtorMagnet] = useState<string | null>(null);
  const [torrentUrl, setTorrentUrl] = useState<string | null>(null);
  const [torrentName, setTorrentName] = useState<string | null>(null);
  const [webtorReady, setWebtorReady] = useState(false);
  const [webtorErr, setWebtorErr] = useState<string | null>(null);
  const [webtorPlayerId, setWebtorPlayerId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    let dead = false;
    setLoading(true);
    setError(null);
    setItems([]);
    (async () => {
      try {
        const params = new URLSearchParams({
          tmdbId: String(media.id),
          title: media.title,
          type: isSeries ? "show" : "movie",
        });
        if (media.year) params.set("year", media.year);
        if (isSeries) {
          params.set("season", String(season ?? 1));
          params.set("episode", String(episode ?? 1));
        }
        const res = await fetch(`/api/downloads?${params.toString()}`);
        if (dead) return;
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const data = (await res.json()) as {
          ok: boolean;
          downloads: DownloadItem[];
          subtitles: any[];
          error?: string;
        };
        if (data.ok) setItems(data.downloads);
        else setError(data.error || "No downloads found for this title.");
      } catch (err: any) {
        if (!dead) setError(err?.message || "Failed to load downloads.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [open, media.id, media.title, media.year, isSeries, season, episode]);

  // Reset streamer when the outer dialog closes.
  useEffect(() => {
    if (!open) {
      setWebtorOpen(false);
      if (torrentUrl) URL.revokeObjectURL(torrentUrl);
      setTorrentUrl(null);
      setTorrentName(null);
      setWebtorMagnet(null);
      setWebtorReady(false);
      setWebtorErr(null);
    }
  }, [open, torrentUrl]);

  // When a magnet or torrent file is picked, boot the SDK.
  useEffect(() => {
    if (!webtorOpen || (!webtorMagnet && !torrentUrl)) return;
    let dead = false;
    setWebtorErr(null);
    setWebtorReady(false);

    const playerId = nextWebtorId();
    setWebtorPlayerId(playerId);

    loadWebtorSdk()
      .then(() => {
        if (dead) return;
        const config: Record<string, any> = {
          id: playerId,
          width: "100%",
          height: "100%",
          controls: true,
          lang: "en",
          title: torrentName || media.title,
          on: (e: any) => {
            if (dead) return;
            if (e.name === (window as any).webtor?.INITED) {
              setWebtorReady(true);
            }
            if (e.name === (window as any).webtor?.TORRENT_ERROR) {
              setWebtorErr("Failed to load torrent. The magnet link may be invalid.");
            }
          },
        };
        if (webtorMagnet) {
          config.magnet = webtorMagnet;
        } else if (torrentUrl) {
          config.torrentUrl = torrentUrl;
        }
        (window as any).webtor = (window as any).webtor || [];
        (window as any).webtor.push(config);
        // Fallback: mark ready after 8s even if INITED doesn't fire.
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
  }, [webtorOpen, webtorMagnet, torrentUrl, torrentName, media.title]);

  const pickTorrent = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".torrent") && file.type !== "application/x-bittorrent") {
      setWebtorErr("Please choose a .torrent file.");
      return;
    }
    if (torrentUrl) URL.revokeObjectURL(torrentUrl);
    const url = URL.createObjectURL(file);
    setTorrentUrl(url);
    setTorrentName(file.name);
    setWebtorMagnet(null);
  };

  const streamMagnet = (url: string) => {
    if (url.startsWith("magnet:")) {
      setWebtorMagnet(url);
      setTorrentUrl(null);
    } else {
      setTorrentUrl(url);
      setWebtorMagnet(null);
    }
    setTorrentName(null);
    setWebtorOpen(true);
  };

  if (!open) return null;

  const proxied = (url: string, fileName?: string) => {
    const params = new URLSearchParams({ url });
    if (fileName) params.set("filename", fileName);
    return `/api/public/download?${params.toString()}`;
  };
  const downloadHref = (item: DownloadItem) => {
    if (item.url.startsWith("magnet:")) return item.url;
    if (isStream(item)) return item.url;
    return proxied(item.url, item.fileName);
  };
  const isStream = (item: DownloadItem) =>
    item.type === "hls" || (item.type === "file" && !/\.(mp4|mkv|m4v|webm|avi|mov|ts)(\?|$)/i.test(item.url));
  const isMagnet = (item: DownloadItem) => item.type === "magnet" || item.url.startsWith("magnet:");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Downloads"
    >
      <button
        className="absolute inset-0 cursor-default"
        type="button"
        aria-label="Close downloads"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Media Downloader</p>
              <p className="text-xs text-white/50">{media.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {isSeries && (
            <p className="mb-3 text-xs uppercase tracking-widest text-white/40">
              Season {season ?? 1} · Episode {episode ?? 1}
            </p>
          )}
          <button
            type="button"
            onClick={() => setWebtorOpen(true)}
            className="group mb-3 flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-left transition hover:border-primary/50 hover:bg-primary/15"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Stream a .torrent</p>
              <p className="text-[11px] text-white/50">Instant playback — no download needed</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground transition group-hover:brightness-110">
              Open
            </span>
          </button>
          {loading && (
            <div className="grid place-items-center py-12 text-white/60">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-xs">Searching download sources…</p>
            </div>
          )}
          {!loading && error && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
              {error}
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((it) => {
                const stream = isStream(it);
                const magnet = isMagnet(it);
                return (
                  <li key={it.id} className="flex gap-2">
                    <a
                      href={downloadHref(it)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-1 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 transition hover:border-white/20 hover:bg-black/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold uppercase text-white">{it.source}</p>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                          {it.quality} · {magnet ? "MAGNET" : stream ? "STREAM" : it.type.toUpperCase()}
                          {it.size ? ` · ${it.size}` : ""}
                        </p>
                      </div>
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        {stream ? <Play className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                      </div>
                    </a>
                    {magnet && (
                      <button
                        type="button"
                        onClick={() => streamMagnet(it.url)}
                        className="group flex shrink-0 items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 transition hover:border-primary/50 hover:bg-primary/15"
                        aria-label="Stream via WebTor"
                        title="Stream via WebTor"
                      >
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-[11px] font-bold text-primary">Stream</span>
                      </button>
                    )}
                    {!magnet && it.type === "torrent" && (
                      <button
                        type="button"
                        onClick={() => streamMagnet(it.url)}
                        className="group flex shrink-0 items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 transition hover:border-primary/50 hover:bg-primary/15"
                        aria-label="Stream via WebTor"
                        title="Stream via WebTor"
                      >
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-[11px] font-bold text-primary">Stream</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Close
          </button>
        </div>
      </div>
      {webtorOpen && (
        <div
          className="fixed inset-0 z-[110] flex flex-col bg-black/95 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Torrent streamer"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-card/80 px-5 py-3 backdrop-blur-xl">
            <div>
              <p className="text-sm font-bold text-white">Torrent Streamer</p>
              <p className="text-[11px] text-white/50">
                {webtorMagnet
                  ? "Streaming magnet via webtor.io"
                  : "Drop or pick a .torrent file — powered by webtor.io"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWebtorOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
              aria-label="Close streamer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative flex-1 overflow-hidden bg-black">
            {!webtorMagnet && !torrentUrl && (
              <label
                htmlFor="sleepy-torrent-input"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) pickTorrent(f);
                }}
                className="absolute inset-0 grid cursor-pointer place-items-center px-6"
              >
                <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-white/15 bg-white/5 px-8 py-12 text-center transition hover:border-primary/40 hover:bg-primary/5">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">Drop a .torrent file</p>
                    <p className="mt-1 text-xs text-white/50">
                      or click to browse — streamed instantly via webtor
                    </p>
                  </div>
                  {webtorErr && <p className="text-xs text-destructive">{webtorErr}</p>}
                </div>
                <input
                  id="sleepy-torrent-input"
                  type="file"
                  accept=".torrent,application/x-bittorrent"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickTorrent(f);
                  }}
                />
              </label>
            )}
            {(webtorMagnet || torrentUrl) && (
              <div className="absolute inset-0">
                <div id={webtorPlayerId} className="webtor h-full w-full" />
                {!webtorReady && !webtorErr && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-white/60">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
                {webtorErr && (
                  <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-destructive">
                    {webtorErr}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

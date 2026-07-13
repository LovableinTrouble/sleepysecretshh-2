/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Download, FileVideo, Loader2, Upload, X, Zap } from "lucide-react";
import type { Media } from "@/lib/catalog";
import type { DownloadItem } from "@/lib/downloads";

/* ============================================================
 * WebTor Embed SDK — loaded from the official CDN per
 * https://github.com/webtor-io/embed-sdk-js
 * ============================================================ */

const WEBTOR_SDK_URL = "https://cdn.jsdelivr.net/npm/@webtor/embed-sdk-js/dist/index.min.js";
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

let webtorIdCounter = 0;
function nextWebtorId(): string {
  webtorIdCounter += 1;
  return `sleepy-dl-webtor-${webtorIdCounter}`;
}

/** Extract the info hash from a magnet URI. */
function extractInfoHash(magnet: string): string {
  const m = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
  return m ? m[1].toLowerCase() : "";
}

/** Extract a display name from a magnet URI. */
function extractMagnetName(magnet: string): string {
  const m = magnet.match(/dn=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : "Unknown";
}

interface TorrentFile {
  name: string;
  path: string;
  size: string;
  ext: string;
}

const VIDEO_EXTS = ["mp4", "mkv", "mov", "avi", "webm", "ts", "m4v", "wmv", "flv"];

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
  const [webtorUrl, setWebtorUrl] = useState<string | null>(null);
  const [webtorReady, setWebtorReady] = useState(false);
  const [webtorErr, setWebtorErr] = useState<string | null>(null);
  const [torrentFiles, setTorrentFiles] = useState<TorrentFile[]>([]);
  const [torrentFetching, setTorrentFetching] = useState(false);
  const webtorContainerRef = useRef<HTMLDivElement>(null);

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
        if (data.ok) {
          const downloadable = data.downloads.filter(
            (d) =>
              d.type === "torrent" ||
              d.type === "magnet" ||
              /\.torrent($|\?)/i.test(d.url) ||
              d.url.startsWith("magnet:"),
          );
          setItems(downloadable);
          if (downloadable.length === 0) setError("No .torrent files found for this title.");
        } else setError(data.error || "No downloads found for this title.");
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

  useEffect(() => {
    if (!open) {
      setWebtorOpen(false);
      setWebtorUrl(null);
      setWebtorReady(false);
      setWebtorErr(null);
      setTorrentFiles([]);
    }
  }, [open]);

  // When a magnet or torrent URL is picked, boot the SDK.
  useEffect(() => {
    if (!webtorOpen || !webtorUrl) return;
    const el = webtorContainerRef.current;
    if (!el) return;
    let dead = false;
    setWebtorErr(null);
    setWebtorReady(false);
    setTorrentFiles([]);
    setTorrentFetching(true);
    el.innerHTML = "";

    const playerId = nextWebtorId();
    el.id = playerId;

    loadWebtorSdk()
      .then(() => {
        if (dead || !webtorContainerRef.current) return;
        const config: Record<string, any> = {
          id: playerId,
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
            if (n === "torrent fetched") {
              // Torrent metadata loaded — extract file list from the event data.
              setTorrentFetching(false);
              try {
                const files = extractFilesFromTorrent(e);
                setTorrentFiles(files);
              } catch { /* ignore */ }
            }
            if (n === "torrent error") {
              setWebtorErr("Failed to load torrent. The magnet link may be invalid.");
              setTorrentFetching(false);
            }
          },
        };
        if (webtorUrl.startsWith("magnet:")) config.magnet = webtorUrl;
        else config.torrentUrl = webtorUrl;
        (window as any).webtor = (window as any).webtor || [];
        (window as any).webtor.push(config);

        setTimeout(() => {
          if (dead) return;
          const iframe = webtorContainerRef.current?.querySelector("iframe");
          if (iframe) {
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.minHeight = "100%";
            iframe.style.display = "block";
            iframe.style.border = "0";
          }
        }, 500);
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
  }, [webtorOpen, webtorUrl, media.title]);

  /** Try to extract video file info from the torrent fetched event.
   *  The WebTor SDK sends torrent metadata in the event data, which may
   *  include a file tree. We extract video files (.mp4, .mkv, .mov, etc.)
   *  and build download links using the info hash from the magnet. */
  function extractFilesFromTorrent(e: any): TorrentFile[] {
    const infoHash = webtorUrl?.startsWith("magnet:")
      ? extractInfoHash(webtorUrl)
      : "";
    const files: TorrentFile[] = [];

    // The event data may contain files in various formats depending on
    // the SDK version. Try to extract from common shapes.
    const data = e?.data || e?.files || e?.torrent || {};
    let fileList: any[] = [];

    if (Array.isArray(data?.files)) fileList = data.files;
    else if (Array.isArray(data)) fileList = data;
    else if (data?.torrent?.files) fileList = data.torrent.files;

    for (const f of fileList) {
      const name = f.name || f.path || f.filename || "";
      const path = f.path || name;
      const size = f.size ? formatSize(f.size) : f.length || "";
      const ext = name.split(".").pop()?.toLowerCase() || "";
      if (VIDEO_EXTS.includes(ext)) {
        files.push({ name, path, size, ext });
      }
    }

    // If we couldn't extract from the event, build a fallback from the
    // magnet name — assume a single video file.
    if (files.length === 0 && infoHash) {
      const name = extractMagnetName(webtorUrl || "");
      const ext = name.split(".").pop()?.toLowerCase() || "mp4";
      if (VIDEO_EXTS.includes(ext) || ext === "bluray" || ext === "web") {
        files.push({ name, path: name, size: "", ext: "mp4" });
      } else {
        files.push({ name, path: name, size: "", ext: "mp4" });
      }
    }

    return files;
  }

  const pickTorrent = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".torrent") && file.type !== "application/x-bittorrent") {
      setWebtorErr("Please choose a .torrent file.");
      return;
    }
    const url = URL.createObjectURL(file);
    setWebtorUrl(url);
    setWebtorOpen(true);
  };

  const streamUrl = (url: string) => {
    setWebtorUrl(url);
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
    return proxied(item.url, item.fileName);
  };
  const isMagnet = (item: DownloadItem) => item.type === "magnet" || item.url.startsWith("magnet:");

  /** Build a WebTor download URL for a file inside a torrent.
   *  Uses the torrent-http-proxy pattern: /{info_hash}/{file_path} */
  const webtorDownloadUrl = (infoHash: string, filePath: string): string => {
    return `https://webtor.io/${infoHash}/${encodeURIComponent(filePath)}`;
  };

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
              <FileVideo className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Stream / Convert a .torrent or magnet</p>
              <p className="text-[11px] text-white/50">Instant playback or convert to .mp4, .mkv, .mov</p>
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
                          {it.quality} · {magnet ? "MAGNET" : "TORRENT"}
                          {it.size ? ` · ${it.size}` : ""}
                        </p>
                      </div>
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        <Download className="h-4 w-4" />
                      </div>
                    </a>
                    <button
                      type="button"
                      onClick={() => streamUrl(it.url)}
                      className="group flex shrink-0 items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 transition hover:border-primary/50 hover:bg-primary/15"
                      aria-label="Stream or convert via WebTor"
                      title="Stream or convert via WebTor"
                    >
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="text-[11px] font-bold text-primary">Stream</span>
                    </button>
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
              <p className="text-sm font-bold text-white">Torrent Streamer / Converter</p>
              <p className="text-[11px] text-white/50">
                {webtorUrl?.startsWith("magnet:")
                  ? "Streaming magnet via webtor.io"
                  : webtorUrl
                    ? "Streaming .torrent via webtor.io"
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
            {!webtorUrl && (
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
            {webtorUrl && (
              <>
                {/* Player area — takes 60% of the height */}
                <div className="absolute inset-x-0 top-0 bottom-[40%] grid place-items-center overflow-hidden">
                  <div
                    ref={webtorContainerRef}
                    className="h-full w-full [&_iframe]:!h-full [&_iframe]:!w-full [&_iframe]:!border-0 [&_iframe]:!block"
                  />
                  {!webtorReady && !webtorErr && (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-white/60">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-xs">{torrentFetching ? "Fetching torrent metadata…" : "Loading player…"}</p>
                      </div>
                    </div>
                  )}
                  {webtorErr && (
                    <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-destructive">
                      {webtorErr}
                    </div>
                  )}
                </div>
                {/* Convert / Download area — bottom 40% */}
                <div className="absolute inset-x-0 bottom-0 top-[60%] overflow-y-auto border-t border-white/10 bg-card/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FileVideo className="h-4 w-4 text-primary" />
                    <p className="text-sm font-bold text-white">Video Files in Torrent</p>
                  </div>
                  {torrentFetching && !torrentFiles.length && (
                    <div className="flex items-center gap-2 py-4 text-xs text-white/50">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Waiting for torrent metadata…
                    </div>
                  )}
                  {!torrentFetching && torrentFiles.length === 0 && (
                    <div className="py-4 text-xs text-white/40">
                      No video files detected yet. The player above is streaming — use it to watch directly.
                    </div>
                  )}
                  {torrentFiles.length > 0 && (
                    <ul className="space-y-2">
                      {torrentFiles.map((f, i) => {
                        const infoHash = webtorUrl?.startsWith("magnet:")
                          ? extractInfoHash(webtorUrl)
                          : "";
                        const dlUrl = infoHash
                          ? webtorDownloadUrl(infoHash, f.path)
                          : "";
                        return (
                          <li key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                              <FileVideo className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-white">{f.name}</p>
                              <p className="text-[10px] uppercase tracking-wider text-white/40">
                                .{f.ext} {f.size ? `· ${f.size}` : ""}
                              </p>
                            </div>
                            {dlUrl && (
                              <a
                                href={dlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary transition hover:border-primary/50 hover:bg-primary/15"
                              >
                                <Download className="h-3.5 w-3.5" />
                                .{f.ext}
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {!torrentFetching && torrentFiles.length === 0 && webtorReady && (
                    <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/5 p-3 text-xs text-white/40">
                      Tip: Use the player above to watch the torrent directly. The torrent's video files will appear here once metadata is loaded.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

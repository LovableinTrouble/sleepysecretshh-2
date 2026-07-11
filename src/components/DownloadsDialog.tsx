/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Download, Loader2, Play, X } from "lucide-react";
import type { Media } from "@/lib/catalog";
import type { DownloadItem } from "@/lib/downloads";

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
        if (data.ok)
          setItems(data.downloads);
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
                return (
                  <li key={it.id}>
                    <a
                      href={downloadHref(it)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 transition hover:border-white/20 hover:bg-black/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold uppercase text-white">{it.source}</p>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                          {it.quality} · {stream ? "STREAM" : it.type.toUpperCase()}
                          {it.size ? ` · ${it.size}` : ""}
                        </p>
                      </div>
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        {stream ? <Play className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                      </div>
                    </a>
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
    </div>
  );
}

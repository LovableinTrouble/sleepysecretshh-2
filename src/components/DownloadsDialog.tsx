import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileVideo,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Media } from "@/lib/catalog";
import type { DownloadItem } from "@/lib/downloads";

interface DownloadsDialogProps {
  open: boolean;
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

type SortKey = "quality" | "size" | "source";

const QUALITY_RANK: Record<string, number> = {
  "2160p": 6,
  "4k": 6,
  "1440p": 5,
  "1080p": 4,
  "720p": 3,
  "480p": 2,
  "360p": 1,
};

function qualityScore(q: string): number {
  const key = q.toLowerCase().replace(/\s+/g, "");
  for (const [k, v] of Object.entries(QUALITY_RANK)) if (key.includes(k)) return v;
  const n = Number(key.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n / 1000 : 0;
}

function sizeToBytes(size?: string): number {
  if (!size) return 0;
  const m = size.match(/([\d.]+)\s*(gb|mb|kb)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  return unit === "gb" ? n * 1e9 : unit === "mb" ? n * 1e6 : n * 1e3;
}

export function DownloadsDialog({ open, media, season, episode, onClose }: DownloadsDialogProps) {
  const isSeries = media.type === "tv" || media.type === "anime";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("quality");
  const [copied, setCopied] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
          error?: string;
        };
        if (data.ok && data.downloads.length > 0) {
          setItems(data.downloads);
        } else {
          setError(data.error || "No direct downloads found for this title.");
        }
      } catch (err: any) {
        if (!dead) setError(err?.message || "Failed to load downloads.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [open, media.id, media.title, media.year, isSeries, season, episode, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const qualities = useMemo(() => {
    const set = new Set(items.map((i) => i.quality).filter(Boolean));
    return Array.from(set).sort((a, b) => qualityScore(b) - qualityScore(a));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      if (quality !== "all" && i.quality !== quality) return false;
      if (!q) return true;
      return `${i.quality} ${i.source} ${i.type} ${i.size ?? ""}`.toLowerCase().includes(q);
    });
    return list.sort((a, b) => {
      if (sort === "size") return sizeToBytes(b.size) - sizeToBytes(a.size);
      if (sort === "source") return a.source.localeCompare(b.source);
      return qualityScore(b.quality) - qualityScore(a.quality);
    });
  }, [items, query, quality, sort]);

  const totalSize = useMemo(() => {
    const best = visible[0];
    return best?.size;
  }, [visible]);

  if (!open) return null;

  const proxied = (url: string, fileName?: string) => {
    const params = new URLSearchParams({ url });
    if (fileName) params.set("filename", fileName);
    return `/api/public/download?${params.toString()}`;
  };

  const downloadHref = (item: DownloadItem) => proxied(item.url, item.fileName);

  const copy = async (item: DownloadItem) => {
    try {
      const abs = new URL(downloadHref(item), window.location.origin).toString();
      await navigator.clipboard.writeText(abs);
      setCopied(item.id);
      window.setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  const typeLabel = (type: DownloadItem["type"]) =>
    type === "hls" ? "HLS" : type === "file" ? "FILE" : type.toUpperCase();

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
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-card/95 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="relative border-b border-white/10 px-6 pb-5 pt-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/15 to-transparent" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">{media.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/45">
                  <span>Direct downloads</span>
                  {media.year && <span>· {media.year}</span>}
                  {isSeries && (
                    <span>
                      · S{String(season ?? 1).padStart(2, "0")}E{String(episode ?? 1).padStart(2, "0")}
                    </span>
                  )}
                  {!loading && items.length > 0 && <span>· {items.length} files</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                disabled={loading}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Controls */}
          {!loading && items.length > 0 && (
            <div className="relative mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by quality, size or source…"
                  className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-primary/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="appearance-none rounded-xl border border-white/10 bg-black/40 py-2 pl-8 pr-3 text-xs font-semibold text-white/80 outline-none transition focus:border-primary/50"
                    aria-label="Sort downloads"
                  >
                    <option value="quality">Quality</option>
                    <option value="size">Size</option>
                    <option value="source">Source</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {!loading && qualities.length > 1 && (
            <div className="relative mt-3 flex flex-wrap gap-1.5">
              {["all", ...qualities].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
                    quality === q
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {q === "all" ? "All" : q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="h-[68px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]"
                />
              ))}
              <li className="flex items-center justify-center gap-2 pt-4 text-xs text-white/45">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Searching for direct downloads…
              </li>
            </ul>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-white/60">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          )}

          {!loading && !error && visible.length === 0 && items.length > 0 && (
            <p className="py-10 text-center text-sm text-white/50">No files match your filters.</p>
          )}

          {!loading && !error && visible.length > 0 && (
            <ul className="space-y-2">
              {visible.map((it, idx) => (
                <li key={it.id}>
                  <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-3.5 transition hover:border-primary/30 hover:bg-black/60">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <FileVideo className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-white">
                          {it.quality || "HD"}
                        </p>
                        {idx === 0 && sort === "quality" && quality === "all" && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
                            Best
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-white/40">
                        {typeLabel(it.type)} · {it.source}
                        {it.size ? ` · ${it.size}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(it)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white"
                      aria-label="Copy link"
                      title="Copy link"
                    >
                      {copied === it.id ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <a
                      href={downloadHref(it)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.97]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Get
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <p className="truncate text-[11px] text-white/40">
            {visible.length > 0
              ? `${visible.length} of ${items.length} files${totalSize ? ` · top ${totalSize}` : ""}`
              : "Files are served through a secure proxy"}
          </p>
          <div className="flex items-center gap-2">
            {visible.length > 0 && (
              <a
                href={downloadHref(visible[0])}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.97]"
              >
                Download best
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

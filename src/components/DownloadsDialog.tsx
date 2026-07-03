import { ExternalLink, Download, Settings, MonitorPlay } from "lucide-react";
import type { Media } from "@/lib/catalog";

interface DownloadsDialogProps {
  open: boolean;
  media: Media;
  season?: number;
  episode?: number;
  onClose: () => void;
}

export function DownloadsDialog({ open, media, season, episode, onClose }: DownloadsDialogProps) {
  if (!open) return null;

  const isSeries = media.type === "tv" || media.type === "anime";

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
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Downloads</p>
              <p className="text-xs text-white/50">{media.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-6">
          {/* Media poster preview */}
          {media.poster && (
            <div className="mb-5 flex justify-center">
              <img
                src={media.poster}
                alt={media.title}
                className="h-32 w-24 rounded-lg object-cover ring-1 ring-white/10"
              />
            </div>
          )}

          <div className="space-y-4 text-center">
            <p className="text-sm text-white/80">
              Downloads are available on your primary source.
            </p>

            {/* Steps */}
            <div className="rounded-2xl bg-white/[0.03] p-4 text-left">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">How to download</p>
              <ol className="space-y-2.5 text-sm text-white/70">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
                  <span>Play the content using the primary source</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
                  <span>Open player settings (<Settings className="inline h-3.5 w-3.5" />) during playback</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
                  <span>Select "Downloads" from the menu</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">4</span>
                  <span>Choose your quality and download</span>
                </li>
              </ol>
            </div>

            {isSeries && (
              <p className="text-xs text-white/50">
                Current: Season {season ?? 1}, Episode {episode ?? 1}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

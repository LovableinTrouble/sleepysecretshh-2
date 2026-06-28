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
  const mediaType = isSeries ? "tv" : "movie";

  // Explicitly formatted template strings with correct slash boundaries
  const src = isSeries
    ? `https://cinesrc.st/download/tv/${media.id}?s=${season ?? 1}&e=${episode ?? 1}`
    : `https://cinesrc.st{media.id}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-3 py-6 backdrop-blur-md animate-fade-in"
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
      <div className="relative flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#050608]/95 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">Download · {media.title}</p>
            <p className="truncate text-[11px] text-white/45">
              {isSeries ? `S${season ?? 1} · E${episode ?? 1} · ` : ""}Powered by cinesrc
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <iframe
          key={`${mediaType}-${media.id}-${season ?? 0}-${episode ?? 0}`}
          src={src}
          title={`Download ${media.title}`}
          className="h-full w-full flex-1 border-0 bg-black"
          allow="fullscreen; clipboard-write"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-md animate-fade-in"
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
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#050608]/95 p-6 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/15 hover:text-white"
          aria-label="Close downloads"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="mt-4 text-xl font-black tracking-tight">Downloads handled by primary source</h2>
        <p className="mt-2 text-sm font-medium text-white/45">
          {media.title}{isSeries ? ` · S${season ?? 1} E${episode ?? 1}` : ""}
        </p>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left">
          <p className="text-sm leading-6 text-white/72">
            To download this title, open your primary source controls and go to{" "}
            <span className="font-semibold text-white">Settings → Downloads</span>.
          </p>
          <p className="mt-3 text-xs leading-5 text-white/45">
            This keeps downloads inside the configured primary source instead of sending you to outside pages.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
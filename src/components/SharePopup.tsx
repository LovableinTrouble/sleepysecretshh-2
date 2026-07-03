import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";

const KEY = "sleepy.update-notice.v2";
const CURRENT_VERSION = "2.4.0";
const UPDATE_NOTES = [
  "Improved music player with Piped/Invidious fallback",
  "Custom theme accent colors now apply to all buttons",
  "Smoother continue watching card animations",
  "Online user count on home page",
];

export function SharePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = localStorage.getItem(KEY);
      if (seen === CURRENT_VERSION) return;
    } catch {}
    // Show update notice once per version
    setOpen(true);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(KEY, CURRENT_VERSION); } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center animate-in fade-in duration-200"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-card to-background shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/70 hover:text-white transition"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-6 pt-8 pb-4 text-center">
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-primary/25 to-transparent blur-3xl" />
          <div className="relative mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
            <Sparkles className="h-[18px] w-[18px] text-primary" />
          </div>
          <div className="text-xs font-medium text-primary mb-1">Update {CURRENT_VERSION}</div>
          <h2 className="relative text-[17px] font-semibold tracking-tight">What's new in Sleepy</h2>
        </div>

        <div className="px-5 pb-3">
          <ul className="space-y-2">
            {UPDATE_NOTES.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 pb-5 pt-2">
          <button
            onClick={dismiss}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

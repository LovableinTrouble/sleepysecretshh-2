import { useEffect, useState } from "react";
import { X, Sparkles, Palette, Zap, Users } from "lucide-react";

const KEY = "sleepy.update-notice.v4";
const CURRENT_VERSION = "2.6.0";

const UPDATE_HIGHLIGHTS = [
  { icon: Palette, text: "Music was removed as it lagged site!" },
  { icon: Palette, text: "Custom themes now apply to all UI elements" },
  { icon: Zap, text: "Instant theme changes with zero lag" },
  { icon: Users, text: "Live user count on home page" },
];

export function SharePopup() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = localStorage.getItem(KEY);
      if (seen === CURRENT_VERSION) return;
    } catch {}
    // Small delay for smooth page load
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(KEY, CURRENT_VERSION); } catch {}
    setDismissed(true);
    setOpen(false);
  };

  if (!open || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-card via-background to-card shadow-2xl"
        style={{
          animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header with glow */}
        <div className="relative px-6 pt-8 pb-5 text-center">
          <div className="absolute inset-x-0 -top-20 h-40 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent blur-2xl" />

          <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>

          <div className="relative">
            <span className="inline-block rounded-full bg-primary/15 px-3 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/25">
              Update {CURRENT_VERSION}
            </span>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-white">
              What's new in Sleepy
            </h2>
            <p className="mt-1.5 text-sm text-white/60">
              Major improvements and fixes
            </p>
          </div>
        </div>

        {/* Update list */}
        <div className="px-6 pb-2">
          <div className="space-y-2">
            {UPDATE_HIGHLIGHTS.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm text-white/90">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action button */}
        <div className="px-6 pb-6 pt-4">
          <button
            onClick={dismiss}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
          >
            Got it
          </button>
          <p className="mt-3 text-center text-xs text-white/40">
            This popup won't appear again until the next update
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

import { useEffect, useState } from "react";
import { X, Sparkles, User, Palette, Zap, Settings, Eye } from "lucide-react";

const KEY = "sleepy.update-notice.v4";
const CURRENT_VERSION = "2.6.0";

const UPDATE_HIGHLIGHTS = [
  { icon: User, text: "Games page so you can play with friends!" },
  { icon: Settings, text: "Customizable shorts page with fast scrolling" },
  { icon: Palette, text: "APK page to download for andrioid" },
  { icon: Eye, text: "Better experience for YOU!" },
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
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, CURRENT_VERSION);
    } catch {}
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
          animation: "popupSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Header with glow */}
        <div className="relative px-5 pt-7 pb-4 text-center">
          <div className="absolute inset-x-0 -top-16 h-32 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-2xl" />

          <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>

          <div className="relative">
            <span className="inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/25">
              Update {CURRENT_VERSION}
            </span>
            <h2 className="mt-2.5 text-lg font-bold tracking-tight text-white">What's new in Sleepy</h2>
          </div>
        </div>

        {/* Update list */}
        <div className="px-5 pb-3">
          <div className="space-y-1.5">
            {UPDATE_HIGHLIGHTS.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 transition hover:bg-white/[0.06]"
                style={{
                  animation: `fadeInUp 0.3s ease-out ${i * 0.05 + 0.15}s both`,
                }}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-sm text-white/85">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action button */}
        <div className="px-5 pb-5">
          <button
            onClick={dismiss}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
          >
            Got it
          </button>
          <p className="mt-2 text-center text-[10px] text-white/35">Won't show again until next update</p>
        </div>
      </div>

      <style>{`
        @keyframes popupSlideIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

import { useEffect, useState } from "react";
import { X, Sparkles, Globe2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

const KEY = "sleepy.update-notice.v5";
const CURRENT_VERSION = "2.9.0";

type HighlightItem = {
  icon: typeof Sparkles;
  title: string;
  body: string;
  to?: "/iptv";
  cta?: string;
};

const UPDATE_HIGHLIGHTS: readonly HighlightItem[] = [
  {
    icon: Sparkles,
    title: "Added AI Search button",
    body: "Press \"/\" then tap the new AI button — describe a mood, actor or vibe and Sleepy finds it.",
  },
  {
    icon: Globe2,
    title: "Added Global IPTV",
    body: "Pick any country and browse 8,000+ public broadcaster channels from iptv-org, right inside the Live TV tab.",
    to: "/iptv",
    cta: "Open Global IPTV",
  },
];

export function SharePopup() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = localStorage.getItem(KEY);
      if (seen === CURRENT_VERSION) return;
    } catch {
      /* no-op */
    }
    // Small delay for smooth page load
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, CURRENT_VERSION);
    } catch {
      /* no-op */
    }
    setDismissed(true);
    setOpen(false);
  };

  const openFeature = (to: "/iptv") => {
    dismiss();
    // SPA-navigate after the popup finishes closing so the route transition
    // doesn't fight the fade-out animation.
    setTimeout(() => navigate({ to }), 50);
  };

  if (!open || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
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
        <div className="relative px-6 pt-7 pb-4 text-center">
          <div className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-2xl" />

          <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>

          <div className="relative">
            <span className="inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/25">
              Update {CURRENT_VERSION}
            </span>
            <h2
              id="changelog-title"
              className="mt-2.5 text-lg font-bold tracking-tight text-white"
            >
              What's new in Sleepy
            </h2>
            <p className="mt-1 text-xs text-white/45">
              Two fresh things to try this week.
            </p>
          </div>
        </div>

        {/* Update list */}
        <div className="px-5 pb-3">
          <div className="space-y-1.5">
            {UPDATE_HIGHLIGHTS.map((item, i) => {
              const Icon = item.icon;
              const interactive = Boolean(item.to);
              const content = (
                <>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15 transition ${
                      interactive ? "group-hover/highlight:bg-primary/20" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      {item.to && item.cta && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary/80 opacity-0 transition group-hover/highlight:opacity-100">
                          {item.cta}
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-white/65">
                      {item.body}
                    </p>
                  </div>
                </>
              );

              if (interactive && item.to) {
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => openFeature(item.to!)}
                    className="group/highlight flex w-full cursor-pointer items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-3 text-left transition hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                    style={{
                      animation: `fadeInUp 0.3s ease-out ${i * 0.05 + 0.15}s both`,
                    }}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-3"
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${i * 0.05 + 0.15}s both`,
                  }}
                >
                  {content}
                </div>
              );
            })}
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
          <p className="mt-2 text-center text-[10px] text-white/35">
            Won't show again until next update
          </p>
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

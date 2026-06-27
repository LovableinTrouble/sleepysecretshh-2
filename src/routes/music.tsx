import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Music as MusicIcon, ExternalLink, X, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/music")({
  head: () => ({
    meta: [
      { title: "Music — Sleepy" },
      { name: "description", content: "Listen to music powered by monochrome.tf." },
      { property: "og:title", content: "Music — Sleepy" },
      { property: "og:description", content: "Listen to music powered by monochrome.tf." },
    ],
  }),
  component: MusicPage,
});

function MusicPage() {
  const KEY = "sleepy:music:thirdparty-ack";
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShowNotice(true);
    } catch {
      setShowNotice(true);
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setShowNotice(false);
  };

  return (
    <div className="fixed inset-0 z-0 bg-background">
      <iframe
        src="https://monochrome.tf"
        title="Monochrome Music"
        className="h-full w-full border-0"
        allow="autoplay; encrypted-media; clipboard-read; clipboard-write; fullscreen; microphone; camera; midi; payment; accelerometer; gyroscope; picture-in-picture"
        allowFullScreen
      />

      {showNotice && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-md animate-fade-in">
          <div className="glass-strong w-full max-w-md rounded-2xl p-6 ring-1 ring-white/10 shadow-[var(--shadow-glow)]">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold tracking-tight">Third-party site</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Music is powered by <span className="font-medium text-foreground">monochrome.tf</span>, an external service we don't control. Use at your own discretion.
                </p>
              </div>
              <button
                onClick={dismiss}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={dismiss}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Got it
              </button>
              <a
                href="https://monochrome.tf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/10 transition hover:bg-white/10 hover:text-foreground"
              >
                Open <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      <MusicIcon className="hidden" />
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { Music as MusicIcon, ExternalLink } from "lucide-react";

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
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-3 pb-28 pt-4 md:px-6 md:pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
            <MusicIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">Music</h1>
            <p className="text-xs text-muted-foreground md:text-sm">Powered by monochrome.tf</p>
          </div>
        </div>
        <a
          href="https://monochrome.tf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/10 transition hover:bg-white/10 hover:text-foreground md:text-sm"
        >
          Open site <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="glass-strong relative flex-1 overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-[var(--shadow-glow)]">
        <iframe
          src="https://monochrome.tf"
          title="Monochrome Music"
          className="h-[calc(100dvh-9rem)] w-full border-0"
          allow="autoplay; encrypted-media; clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
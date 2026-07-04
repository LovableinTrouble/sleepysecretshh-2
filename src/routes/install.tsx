import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  Shield,
  Zap,
  Smartphone,
  Star,
  Check,
  Sparkles,
  Wifi,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Get the Sleepy App — Install on Android" },
      {
        name: "description",
        content:
          "Download Sleepy for Android. Movies, TV, anime, sports and live channels in one beautiful, fast app.",
      },
    ],
  }),
  component: InstallPage,
});

const APK_URL =
  "https://media.quizizz.com/_mdserver/main/media/resource/gs/quizizz-media/uploadedFiles/7b41babe-b5db-4b2e-8c24-19a37ba314e0-v2";

const features = [
  { icon: Zap, title: "Instant startup", desc: "Snappy launches, buttery scrolls." },
  { icon: Wifi, title: "Offline downloads", desc: "Save anything, watch anywhere." },
  { icon: Sparkles, title: "No ads, ever", desc: "Zero interruptions, zero trackers." },
  { icon: Lock, title: "Private by default", desc: "No accounts, no data collection." },
] as const;

const highlights = [
  "Movies, TV, anime, live sports & IPTV",
  "Continue watching synced across sessions",
  "Beautiful player with subtitle + source picker",
  "Regular updates with new features",
] as const;

function InstallPage() {
  return (
    <div className="min-h-screen px-4 pb-32 pt-16 md:px-8 md:pt-24 animate-page-in">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_28%,transparent)_0%,transparent_70%)]" />

      <div className="mx-auto max-w-6xl">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-glass-border bg-gradient-to-b from-white/[0.06] to-transparent p-6 md:p-12">
          <div className="grid gap-10 md:grid-cols-[1.15fr_1fr] md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                v2.0 — Now available
              </div>
              <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
                Sleepy for
                <br />
                <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Android.
                </span>
              </h1>
              <p className="mt-4 max-w-md text-base text-muted-foreground md:text-lg">
                Everything you love about streaming — in one native app. Fast, private, and free forever.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={APK_URL}
                  download
                  className="group inline-flex items-center gap-3 rounded-2xl bg-primary px-6 py-3.5 text-base font-bold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 active:scale-[0.98]"
                >
                  <Download className="h-5 w-5 transition group-hover:-translate-y-0.5" />
                  Download APK
                </a>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5" /> Android 6.0+
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-400" /> Virus-free
                  </span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="ml-2 text-xs text-muted-foreground">
                  Loved by 50k+ streamers
                </span>
              </div>
            </div>

            {/* Phone mockup */}
            <div className="relative mx-auto">
              <div className="relative mx-auto aspect-[9/19] w-[220px] rounded-[2.5rem] border-[10px] border-zinc-900 bg-black shadow-2xl md:w-[260px]">
                <div className="absolute left-1/2 top-2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-black" />
                <div className="absolute inset-0 overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary/30 via-background to-background">
                  <div className="flex h-full flex-col p-4 pt-8">
                    <div className="h-6 w-24 rounded-md bg-white/15" />
                    <div className="mt-3 h-32 rounded-xl bg-gradient-to-br from-primary/60 to-primary/20" />
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="aspect-[2/3] rounded-md bg-white/10" />
                      ))}
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 w-3/4 rounded bg-white/25" />
                        <div className="h-2 w-1/2 rounded bg-white/15" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-primary/20 blur-3xl" />
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-glass-border bg-white/[0.03] p-5 transition hover:border-primary/40 hover:bg-white/[0.05]"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary transition group-hover:bg-primary/25">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Highlights + install steps */}
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-glass-border bg-white/[0.03] p-6">
            <h2 className="text-xl font-bold">Why the app?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Faster, richer, and fully offline-capable.
            </p>
            <ul className="mt-5 space-y-3">
              {highlights.map((h) => (
                <li key={h} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground/85">{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-glass-border bg-white/[0.03] p-6">
            <h2 className="text-xl font-bold">Install in 30 seconds</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Three simple steps — no store account required.
            </p>
            <ol className="mt-5 space-y-4">
              {[
                { title: "Download the APK", desc: "Tap the download button above." },
                {
                  title: "Allow install",
                  desc: "Enable install from unknown sources when prompted.",
                },
                {
                  title: "Open & enjoy",
                  desc: "Launch Sleepy from your app drawer and start streaming.",
                },
              ].map((s, i) => (
                <li key={s.title} className="flex items-start gap-4">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-[var(--shadow-glow)]">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Bottom download CTA */}
        <section className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
          <p className="text-lg font-semibold">Ready when you are.</p>
          <a
            href={APK_URL}
            download
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-95"
          >
            <Download className="h-4 w-4" /> Get Sleepy APK
          </a>
          <p className="text-xs text-muted-foreground">Free • ~15 MB • Android 6.0+</p>
        </section>
      </div>
    </div>
  );
}
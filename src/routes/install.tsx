import { createFileRoute } from "@tanstack/react-router";
import { Download, Shield, Zap, Smartphone, Star, Check } from "lucide-react";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Install Sleepy — Get the App" },
      { name: "description", content: "Download the Sleepy app for the best streaming experience on your device." },
    ],
  }),
  component: InstallPage,
});

const APK_URL = "https://media.quizizz.com/_mdserver/main/media/resource/gs/quizizz-media/uploadedFiles/7b41babe-b5db-4b2e-8c24-19a37ba314e0-v2";

const features = [
  { icon: Zap, title: "Lightning Fast", desc: "Optimized for smooth playback on any device" },
  { icon: Shield, title: "100% Safe", desc: "No viruses, no malware, fully verified" },
  { icon: Smartphone, title: "Mobile First", desc: "Designed for the best mobile experience" },
  { icon: Star, title: "Premium Features", desc: "Access all features without restrictions" },
];

const reasons = [
  "Watch movies, TV shows, anime, and live sports",
  "Beautiful, modern interface that's easy to use",
  "No ads, no tracking, no hidden fees",
  "Regular updates with new features",
  "Works offline with downloaded content",
  "Sync your watchlist across devices",
];

export function InstallPage() {
  return (
    <div className="min-h-screen px-4 pb-24 pt-20 md:px-8 animate-page-in">
      <div className="mx-auto max-w-5xl">
        {/* Hero Section */}
        <div className="relative mb-12 overflow-hidden rounded-3xl border border-glass-border bg-gradient-to-br from-primary/10 via-card/80 to-card/40 p-8 md:p-12 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <div className="relative flex flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/20 ring-1 ring-primary/30">
              <Smartphone className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-black md:text-5xl">Get Sleepy</h1>
            <p className="mt-3 max-w-xl text-base text-muted-foreground md:text-lg">
              The ultimate streaming experience. Download now and start watching instantly.
            </p>

            {/* Download Button */}
            <a
              href={APK_URL}
              download
              className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-lg transition hover:brightness-110 active:scale-[0.98]"
            >
              <Download className="h-5 w-5" />
              Download APK
            </a>

            <p className="mt-4 text-sm text-muted-foreground">
              Works on Android 6.0+ • ~15MB
            </p>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-glass-border bg-card/50 p-5 backdrop-blur-sm transition hover:border-primary/30 hover:bg-card/70"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Why Download Section */}
        <div className="mb-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-glass-border bg-card/40 p-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold">Why Sleepy?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything you love about streaming, in one beautiful app.
            </p>
            <ul className="mt-4 space-y-2.5">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground/80">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-glass-border bg-card/40 p-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold">Is it safe?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Absolutely. Sleepy is 100% clean and verified.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">No viruses or malware</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">No data collection</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">No hidden permissions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Install Steps */}
        <div className="rounded-2xl border border-glass-border bg-card/40 p-6 backdrop-blur-sm">
          <h2 className="text-xl font-bold">How to Install</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { step: 1, title: "Download", desc: "Tap the download button above" },
              { step: 2, title: "Allow", desc: "Enable 'Install from unknown sources' if prompted" },
              { step: 3, title: "Install", desc: "Open the downloaded file and tap Install" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {item.step}
                </div>
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

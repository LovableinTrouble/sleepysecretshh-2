import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { DEFAULT_SETTINGS, useSettings, type Settings } from "@/lib/store";
import { THEMES } from "@/lib/themes";
import { REGION_OPTIONS, detectRegion, type Region } from "@/lib/detectRegion";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sleepy" },
      { name: "description", content: "Customize every part of your Sleepy experience." },
    ],
  }),
  component: SettingsPage,
});

/* ---------- primitives ---------- */

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="relative rounded-3xl border border-glass-border bg-card/40 p-6 backdrop-blur-xl">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-glass-border pb-4 last:border-0 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 ${
        value
          ? "border-primary/70 bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
          : "border-white/15 bg-white/10 hover:bg-white/15"
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-lg ring-1 ring-black/10 transition-transform duration-200 ${
          value ? "translate-x-[1.55rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex w-64 items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="range-clean"
        style={{
          background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((value - min) / (max - min)) * 100}%, color-mix(in oklab, var(--foreground) 10%, transparent) ${((value - min) / (max - min)) * 100}%, color-mix(in oklab, var(--foreground) 10%, transparent) 100%)`,
        }}
      />
      <div className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {value}
        {suffix ?? ""}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-[10rem]" style={{ zIndex: open ? 100 : "auto" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 text-sm font-semibold text-foreground ring-1 ring-white/10 transition hover:bg-white/[0.07]"
        aria-expanded={open}
      >
        <span className="truncate">{active?.label}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        className={`absolute right-0 top-12 z-[200] w-52 overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.16_0.02_280)] p-1.5 text-white shadow-2xl transition duration-150 ${open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}
      >
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className={`flex h-9 w-full items-center justify-between rounded-xl px-3 text-left text-xs font-semibold transition ${value === o.value ? "bg-primary/20 text-white ring-1 ring-primary/35" : "text-white/65 hover:bg-white/8 hover:text-white"}`}
          >
            {o.label}
            {value === o.value && (
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-full border border-glass-border bg-background/60 px-4 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
    />
  );
}

function IntegrationCard({
  name,
  desc,
  placeholder,
  value,
  onChange,
}: {
  name: string;
  desc: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const connected = value.trim().length > 0;
  return (
    <div className="rounded-2xl border border-glass-border bg-background/30 p-4 transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {name}
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-400/30">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Connected
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
        </div>
        {connected && (
          <button onClick={() => onChange("")} className="text-xs text-muted-foreground hover:text-destructive">
            Clear
          </button>
        )}
      </div>
      <div className="mt-3">
        <TextField value={value} onChange={onChange} placeholder={placeholder} type="password" />
      </div>
    </div>
  );
}

function RegionDetectButton({ onPicked }: { onPicked: (r: Region) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={async () => {
        setLoading(true);
        setResult(null);
        try {
          if (typeof window !== "undefined") localStorage.removeItem("sleepy.region.v1");
          const r = await detectRegion();
          onPicked(r);
          setResult(r);
        } finally {
          setLoading(false);
        }
      }}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-primary/15 px-4 text-xs font-semibold text-primary ring-1 ring-primary/30 transition hover:bg-primary/25 disabled:opacity-60"
      disabled={loading}
    >
      {loading ? "Detecting…" : result ? `Detected: ${result}` : "Detect now"}
    </button>
  );
}

function SettingsPage() {
  // Every change persists IMMEDIATELY via setSaved — no draft / save-bar dance.
  // Previously toggles updated a local draft and looked "broken" until the user
  // clicked Save; this applies on the spot.
  const [s, setSaved] = useSettings();
  const set = (patch: Partial<Settings>) => setSaved(patch);
  const setInt = (patch: Partial<Settings["integrations"]>) =>
    setSaved({ integrations: { ...s.integrations, ...patch } });
  const ints = s.integrations;

  return (
    <div className="min-h-screen px-6 pb-40 pt-20 md:px-10 animate-page-in">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-primary/80">Customize</div>
          <h1 className="mt-2 text-4xl font-black md:text-6xl">Settings</h1>
          <p className="mt-2 text-muted-foreground">
            Themes, playback, sources and integrations — all clean, all yours.
          </p>
        </div>

        <a
          href="/install"
          className="group flex items-center gap-4 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-5 transition hover:border-primary/50 hover:from-primary/20"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/20 ring-1 ring-primary/30">
            <Download className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Get the Android app</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Instant startup, offline downloads, no ads.</div>
          </div>
          <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition group-hover:brightness-110">
            Download
          </span>
        </a>

        {/* FebBox — surfaced first because it gates the primary direct source. */}
        <Section
          title="FebBox Cookie"
          desc="Primary direct source. Paste your FebBox ui= cookie to unlock direct HLS streams up to 4K. Without it, the player falls back to embed backups."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Status</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  ints.febboxCookie?.trim()
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                    : "bg-amber-500/15 text-amber-300 ring-amber-400/30"
                }`}
              >
                {ints.febboxCookie?.trim() ? "Connected" : "Not configured"}
              </span>
            </div>
            <TextField
              value={ints.febboxCookie}
              onChange={(v) => setInt({ febboxCookie: v })}
              placeholder="ui=… cookie"
            />
            <p className="text-[11px] text-muted-foreground">
              Tip: in your browser DevTools → Application → Cookies for febbox.com, copy the value of the{" "}
              <code className="rounded bg-white/5 px-1">ui</code> cookie and paste it here.
            </p>
          </div>
        </Section>

        {/* p-stream region — picks the closest CDN/proxy edge for FebBox + subtitles. */}
        <Section
          title="Streaming region"
          desc="Pick the closest p-stream edge for lower latency. Auto detects the closest one by IP."
        >
          <Row label="Region" hint={`Detected: ${ints.pstreamRegion === "auto" ? "Auto" : ints.pstreamRegion}`}>
            <Select
              value={ints.pstreamRegion}
              onChange={(v) => setInt({ pstreamRegion: v as Settings["integrations"]["pstreamRegion"] })}
              options={REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Row>
          <Row label="Detect now" hint="Refresh the IP-based region cache.">
            <RegionDetectButton
              onPicked={(r) =>
                setInt({ pstreamRegion: r === "unknown" ? "auto" : (r as Settings["integrations"]["pstreamRegion"]) })
              }
            />
          </Row>
        </Section>

        {/* Sources */}
        <Section
          title="Sources"
          desc="FebBox is the primary direct source. Zxcstream is a third-party embed used as a fallback."
        >
          <Row
            label="Preferred source"
            hint="FebBox runs first when a cookie is configured; Zxcstream is used as a fallback."
          >
            <Select
              value={s.preferredSource}
              onChange={(v) => set({ preferredSource: v })}
              options={[
                { value: "febbox", label: "FebBox — direct HLS, up to 4K" },
                { value: "zxcstream", label: "Zxcstream — embed backup" },
              ]}
            />
          </Row>
          <Row label="FebBox" hint="Direct HLS streams up to 4K. Requires a FebBox ui= cookie pasted below.">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${s.integrations.febboxCookie?.trim() ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" : "bg-amber-500/15 text-amber-300 ring-amber-400/30"}`}
            >
              {s.integrations.febboxCookie?.trim() ? "Connected" : "Not configured"}
            </span>
          </Row>
          <Row label="Zxcstream" hint="Third-party iframe embed fallback, used when FebBox has no stream.">
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              Backup ready
            </span>
          </Row>
        </Section>

        {/* Theme picker */}
        <Section title="Theme" desc="Pick a preset. Every surface, button and accent updates instantly when you save.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {THEMES.map((t) => {
              const active = s.theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => set({ theme: t.id })}
                  className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition ${active ? "border-primary ring-2 ring-primary/40" : "border-glass-border hover:border-primary/40"}`}
                >
                  <div className="flex h-14 overflow-hidden rounded-xl">
                    {t.swatch.map((c, i) => (
                      <div key={i} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>
                  <div className="mt-2 truncate text-sm font-semibold">{t.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t.description}</div>
                  {active && (
                    <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
            {/* Custom theme card */}
            <button
              onClick={() =>
                set({ theme: "custom", customTheme: s.customTheme ?? { primary: "#b06bff", background: "#0f0a1c" } })
              }
              className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition ${s.theme === "custom" ? "border-primary ring-2 ring-primary/40" : "border-glass-border hover:border-primary/40"}`}
            >
              <div className="flex h-14 overflow-hidden rounded-xl">
                <div className="flex-1" style={{ background: s.customTheme?.background ?? "#0f0a1c" }} />
                <div className="flex-1" style={{ background: s.customTheme?.primary ?? "#b06bff" }} />
                <div
                  className="flex-1 bg-gradient-to-br"
                  style={{
                    background: `linear-gradient(135deg, ${s.customTheme?.background ?? "#0f0a1c"}, ${s.customTheme?.primary ?? "#b06bff"})`,
                  }}
                />
              </div>
              <div className="mt-2 truncate text-sm font-semibold">Custom</div>
              <div className="truncate text-[11px] text-muted-foreground">Pick your own colors</div>
              {s.theme === "custom" && (
                <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
              )}
            </button>
          </div>
          {s.theme === "custom" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-glass-border bg-background/30 p-3">
                <div>
                  <div className="text-sm font-semibold">Primary</div>
                  <div className="text-[11px] text-muted-foreground">Buttons, accents, links</div>
                </div>
                <input
                  type="color"
                  value={s.customTheme?.primary ?? "#b06bff"}
                  onChange={(e) => {
                    const primary = e.target.value;
                    const bg = s.customTheme?.background ?? "#0f0a1c";
                    set({ customTheme: { primary, background: bg } });
                  }}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-glass-border bg-transparent color-picker"
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-glass-border bg-background/30 p-3">
                <div>
                  <div className="text-sm font-semibold">Background</div>
                  <div className="text-[11px] text-muted-foreground">Base surface color</div>
                </div>
                <input
                  type="color"
                  value={s.customTheme?.background ?? "#0f0a1c"}
                  onChange={(e) => {
                    const background = e.target.value;
                    const primary = s.customTheme?.primary ?? "#b06bff";
                    set({ customTheme: { primary, background } });
                  }}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-glass-border bg-transparent color-picker"
                />
              </div>
            </div>
          )}
        </Section>

        <Section title="Appearance" desc="Customize how Sleepy looks and feels.">
          <Row label="Animated background" hint="Soft drifting orbs behind the UI.">
            <Toggle value={s.animatedBg} onChange={(v) => set({ animatedBg: v })} />
          </Row>
          <Row label="Site-wide animations" hint="Hovers, transitions and motion effects.">
            <Toggle value={s.animationsEnabled} onChange={(v) => set({ animationsEnabled: v })} />
          </Row>
          <Row label="Reduce motion" hint="Honor system reduce-motion preference.">
            <Toggle value={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
          </Row>
          <Row label="Show ratings" hint="Display IMDb/TMDB scores on media cards.">
            <Toggle value={s.showRatings} onChange={(v) => set({ showRatings: v })} />
          </Row>
        </Section>

        <Section title="Integrations" desc="Paste an API key to connect — a green check confirms it's saved.">
          <div className="grid gap-3 md:grid-cols-2">
            <IntegrationCard
              name="FebBox Cookie"
              desc="Primary direct source. Paste your FebBox ui= cookie to unlock direct HLS streams up to 4K. Without it, the player uses embed backups."
              placeholder="ui=… cookie"
              value={ints.febboxCookie}
              onChange={(v) => setInt({ febboxCookie: v })}
            />

            <IntegrationCard
              name="Real-Debrid"
              desc="Premium high-speed links from hosters."
              placeholder="Real-Debrid API token"
              value={ints.realDebrid}
              onChange={(v) => setInt({ realDebrid: v })}
            />
            <IntegrationCard
              name="AllDebrid"
              desc="Alternative debrid network."
              placeholder="AllDebrid API key"
              value={ints.allDebrid}
              onChange={(v) => setInt({ allDebrid: v })}
            />
            <IntegrationCard
              name="Premiumize"
              desc="Cloud download + streaming."
              placeholder="Premiumize API key"
              value={ints.premiumize}
              onChange={(v) => setInt({ premiumize: v })}
            />
            <IntegrationCard
              name="Trakt.tv"
              desc="Sync your watch history and lists."
              placeholder="Trakt OAuth token"
              value={ints.traktToken}
              onChange={(v) => setInt({ traktToken: v })}
            />
            <IntegrationCard
              name="Simkl"
              desc="Track anime, TV and movies."
              placeholder="Simkl OAuth token"
              value={ints.simklToken}
              onChange={(v) => setInt({ simklToken: v })}
            />
            <IntegrationCard
              name="OpenSubtitles"
              desc="Multi-language subtitles."
              placeholder="OpenSubtitles API key"
              value={ints.openSubtitles}
              onChange={(v) => setInt({ openSubtitles: v })}
            />
          </div>
        </Section>

        <Section title="Catalog">
          <Row label="Custom TMDB API key" hint="Leave blank to use the built-in key.">
            <div className="w-72">
              <TextField value={s.tmdbApiKey} onChange={(v) => set({ tmdbApiKey: v })} placeholder="optional" />
            </div>
          </Row>
          <Row label="Region">
            <div className="w-24">
              <TextField value={s.region} onChange={(v) => set({ region: v })} />
            </div>
          </Row>
          <Row label="Language">
            <Select
              value={s.language}
              onChange={(v) => set({ language: v as Settings["language"] })}
              options={[
                { value: "en", label: "English" },
                { value: "es", label: "Español" },
                { value: "fr", label: "Français" },
                { value: "ja", label: "日本語" },
                { value: "de", label: "Deutsch" },
              ]}
            />
          </Row>
          <Row label="Show mature content">
            <Toggle value={s.matureContent} onChange={(v) => set({ matureContent: v })} />
          </Row>
        </Section>

        <button
          onClick={() => {
            localStorage.removeItem("sleepy.settings.v2");
            location.reload();
          }}
          className="rounded-full border border-glass-border px-5 py-2.5 text-sm text-muted-foreground transition hover:bg-background/40 hover:text-foreground"
        >
          Reset to defaults
        </button>
        <p className="text-xs text-muted-foreground">Default theme: {DEFAULT_SETTINGS.theme}</p>
      </div>
    </div>
  );
}

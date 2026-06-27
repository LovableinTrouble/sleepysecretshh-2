import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CATALOG, similarTo, type Media } from "@/lib/catalog";
import { MediaCard } from "@/components/MediaCard";

export const Route = createFileRoute("/ai")({
  head: () => ({ meta: [{ title: "AI Recommendations — Sleepy" }, { name: "description", content: "Get personalized AI recommendations from Luna." }] }),
  component: AiPage,
});

const MOODS = ["Cozy", "Mind-bending", "Action-packed", "Heartwarming", "Dark", "Funny", "Romantic", "Epic"];
const GENRES = ["Action", "Drama", "Sci-Fi", "Horror", "Animation", "Fantasy", "Crime", "Comedy"];

function AiPage() {
  const [mood, setMood] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [picks, setPicks] = useState<Media[]>([]);
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const generate = () => {
    const scored = CATALOG.map((m) => ({
      m,
      score: genres.filter((g) => m.genres.includes(g)).length * 2 +
             (custom && (m.title + m.overview).toLowerCase().includes(custom.toLowerCase()) ? 3 : 0) +
             (mood.length ? Math.random() : 0),
    })).sort((a, b) => b.score - a.score);
    setPicks(scored.slice(0, 8).map((s) => s.m));
  };

  return (
    <main className="min-h-screen px-5 pb-32 pt-20 md:px-10 animate-page-in">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-primary/80">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_oklch(0.72_0.18_305)]" />
          Luna AI
        </div>
        <h1 className="mt-1 text-4xl font-black tracking-tight md:text-6xl">What are you in the mood for?</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Pick a vibe, a few genres, or describe what you want. Luna will sift through the catalog.
        </p>

        <div className="mt-10 space-y-8 rounded-3xl border border-white/5 bg-white/[0.02] p-6 md:p-8">
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mood</div>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button key={m} onClick={() => toggle(mood, m, setMood)}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${mood.includes(m) ? "bg-primary text-primary-foreground shadow-[0_0_18px_oklch(0.72_0.18_305_/_0.45)]" : "glass hover:bg-white/10"}`}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Genres</div>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button key={g} onClick={() => toggle(genres, g, setGenres)}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${genres.includes(g) ? "bg-primary text-primary-foreground shadow-[0_0_18px_oklch(0.72_0.18_305_/_0.45)]" : "glass hover:bg-white/10"}`}>{g}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Describe what you want</div>
            <textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={3}
              placeholder="e.g. A slow-burn thriller with a twist ending"
              className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:bg-black/30" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {mood.length + genres.length === 0 && !custom ? "Tap a mood or genre to start" : `${mood.length + genres.length} filters${custom ? " · custom prompt" : ""}`}
            </div>
            <button onClick={generate} className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:scale-105">
              Get Recommendations
            </button>
          </div>
        </div>

        {picks.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-5 text-xl font-semibold">Luna picked for you</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4">
              {picks.map((p) => <MediaCard key={p.id} media={p} fill />)}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


// reference to silence unused import warnings in some bundlers
void similarTo;

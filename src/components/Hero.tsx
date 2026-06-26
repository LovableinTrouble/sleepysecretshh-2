import { useEffect, useState } from "react";
import type { Media } from "@/lib/catalog";

interface Props {
  items: Media[];
  onPlay: (m: Media) => void;
  onMore: (m: Media) => void;
  intervalMs?: number;
}

export function Hero({ items, onPlay, onMore, intervalMs = 7000 }: Props) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, items.length, intervalMs]);

  if (!items.length) return null;

  return (
    <section
      className="relative h-[80vh] min-h-[560px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((media, i) => (
        <div
          key={`${media.type}-${media.id}`}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            i === idx ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <img
            src={media.backdrop}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[8000ms] ease-out ${
              i === idx ? "scale-105" : "scale-100"
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" style={{ backgroundImage: "linear-gradient(to top, var(--color-background) 0%, color-mix(in oklab, var(--color-background) 70%, transparent) 35%, transparent 60%)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/30 to-transparent" style={{ width: "55%" }} />
          <div className="relative z-10 flex h-full max-w-3xl flex-col justify-end px-6 pb-32 md:px-12 md:pb-40">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {media.genres.slice(0, 3).map((g) => (
                <span key={g} className="rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 text-xs text-white/85">{g}</span>
              ))}
            </div>
            <h1 className="max-w-4xl text-balance text-5xl font-black uppercase leading-none tracking-tight animate-fade-in md:text-7xl">
              {media.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 text-foreground">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-primary"><path d="m12 17.3 6.18 3.7-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                {media.rating.toFixed(1)}
              </span>
              <span>·</span>
              <span>{media.year}</span>
              {media.runtime && <><span>·</span><span>{media.runtime}</span></>}
            </div>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-foreground/80 animate-fade-in md:text-base line-clamp-3">{media.overview}</p>
            <div className="mt-7 flex gap-3">
              <button onClick={() => onPlay(media)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 h-11 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M8 5v14l11-7z"/></svg>
                Play
              </button>
              <button onClick={() => onMore(media)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-6 h-11 text-sm font-semibold text-foreground hover:bg-white/15">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <line x1="12" y1="11" x2="12" y2="16"/>
                  <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/>
                </svg>
                More Info
              </button>
            </div>
          </div>
        </div>
      ))}

      {items.length > 1 && (
        <div className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx ? "w-6 bg-primary" : "w-1.5 bg-white/30 hover:bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}


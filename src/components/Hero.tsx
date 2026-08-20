import { useEffect, useState } from "react";
import { Play, Plus, Info, Star, Calendar, Clapperboard, Check } from "lucide-react";
import type { Media } from "@/lib/catalog";
import { getWatchlist, toggleWatchlist } from "@/lib/store";

interface Props {
  items: Media[];
  onPlay: (m: Media) => void;
  onMore: (m: Media) => void;
  intervalMs?: number;
}

export function Hero({ items, onPlay, onMore, intervalMs = 7000 }: Props) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [wl, setWl] = useState<number[]>([]);

  useEffect(() => setWl(getWatchlist()), []);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, items.length, intervalMs]);

  if (!items.length) return null;

  return (
    <section
      className="relative h-[100svh] min-h-[620px] w-full overflow-hidden"
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
          <div
            className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent"
            style={{
              backgroundImage:
                "linear-gradient(to top, var(--color-background) 0%, color-mix(in oklab, var(--color-background) 70%, transparent) 35%, transparent 60%)",
            }}
          />
          <div
            className="absolute inset-0 hidden bg-gradient-to-r from-background/90 via-background/40 to-transparent md:block"
            style={{ width: "60%" }}
          />
          <div className="relative z-10 flex h-full w-full max-w-3xl flex-col justify-end px-5 pb-28 sm:px-8 md:px-12 md:pb-36">
            <h1 className="max-w-4xl text-balance text-4xl font-black uppercase leading-[0.92] tracking-tight animate-fade-in sm:text-5xl md:text-7xl">
              {media.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] font-medium text-foreground/85 md:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-4 w-4 shrink-0 fill-current" />
                {media.rating.toFixed(1)}/10
              </span>
              <span className="h-1 w-1 rounded-full bg-foreground/40" />
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" />
                {media.year}
              </span>
              {media.genres[0] && (
                <>
                  <span className="h-1 w-1 rounded-full bg-foreground/40" />
                  <span className="inline-flex items-center gap-1.5">
                    <Clapperboard className="h-4 w-4 shrink-0" />
                    {media.genres[0]}
                  </span>
                </>
              )}
            </div>

            <p className="mt-5 max-w-xl text-sm font-medium leading-relaxed text-foreground/85 animate-fade-in md:text-base line-clamp-3">
              {media.overview}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onPlay(media)}
                className="inline-flex h-12 items-center gap-2.5 rounded-full bg-foreground px-7 text-[15px] font-bold text-background shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] transition-all duration-200 hover:scale-[1.03] hover:bg-foreground/90 active:scale-95"
              >
                <Play className="h-4 w-4 fill-current" />
                Play
              </button>

              <div className="flex h-12 items-center gap-1 rounded-full border border-white/10 bg-white/[0.07] px-1.5 backdrop-blur">
                <button
                  onClick={() => {
                    toggleWatchlist(media.id);
                    setWl(getWatchlist());
                  }}
                  aria-label="Add to watchlist"
                  className="grid h-9 w-9 place-items-center rounded-full text-foreground/90 transition hover:bg-white/15 hover:text-foreground active:scale-95"
                >
                  {wl.includes(media.id) ? (
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  ) : (
                    <Plus className="h-5 w-5" strokeWidth={2.5} />
                  )}
                </button>
                <span className="h-5 w-px bg-white/15" />
                <button
                  onClick={() => onMore(media)}
                  aria-label="More info"
                  className="grid h-9 w-9 place-items-center rounded-full text-foreground/90 transition hover:bg-white/15 hover:text-foreground active:scale-95"
                >
                  <Info className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {items.length > 1 && (
        <div className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 md:left-auto md:right-10 md:translate-x-0">
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

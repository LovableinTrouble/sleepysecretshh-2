import { useRef } from "react";
import type { Media } from "@/lib/catalog";
import { MediaCard } from "./MediaCard";

interface Props {
  title: string;
  items: Media[];
}

export function MediaRow({ title, items }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  return (
    <section className="relative overflow-visible">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 md:px-8">
        <h2 className="min-w-0 truncate text-lg font-bold tracking-tight md:text-2xl">{title}</h2>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-foreground/70 backdrop-blur transition hover:scale-105 hover:bg-white/15 hover:text-foreground active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-foreground/70 backdrop-blur transition hover:scale-105 hover:bg-white/15 hover:text-foreground active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="no-scrollbar flex gap-3 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-9 pt-3 md:gap-4 md:px-7 animate-page-in"
      >
        {items.map((m) => (
          <MediaCard key={`${m.type}-${m.id}`} media={m} />
        ))}
      </div>
    </section>
  );
}

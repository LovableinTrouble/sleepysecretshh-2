import { useRef } from "react";
import type { Media } from "@/lib/catalog";
import { MediaCard } from "./MediaCard";

interface Props { title: string; items: Media[]; }

export function MediaRow({ title, items }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  return (
    <section className="relative overflow-visible">
      <div className="mb-3 flex items-end justify-between px-4 md:px-8">
        <h2 className="text-base font-semibold tracking-tight md:text-lg">
          <span className="mr-2 inline-block h-4 w-1 translate-y-0.5 rounded-full bg-primary align-middle" />
          {title}
        </h2>
        <div className="flex gap-1">
          <button onClick={() => scroll(-1)} aria-label="Scroll left" className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.08] text-white/70 hover:bg-white/15 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button onClick={() => scroll(1)} aria-label="Scroll right" className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.08] text-white/70 hover:bg-white/15 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar flex gap-3 overflow-x-auto overflow-y-hidden scroll-smooth px-3 pb-10 pt-3 md:px-7 animate-page-in">
        {items.map((m) => <MediaCard key={`${m.type}-${m.id}`} media={m} />)}
      </div>
    </section>
  );
}


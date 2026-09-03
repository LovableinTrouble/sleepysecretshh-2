import type { Media } from "@/lib/catalog";
import { Link } from "@tanstack/react-router";
import { useSettings } from "@/lib/store";
import { stashWatchMedia } from "@/lib/watch-stash";
import { Play } from "lucide-react";
import { AddToWatchlistButton } from "@/components/AddToWatchlistButton";

interface Props {
  media: Media;
  size?: "sm" | "md";
  /** When true, fill the parent (use inside CSS grid). When false, fixed width (for horizontal rows). */
  fill?: boolean;
}

export function MediaCard({ media, size = "md", fill = false }: Props) {
  const [s] = useSettings();
  const radius =
    s.posterStyle === "circle"
      ? "rounded-full"
      : s.posterStyle === "square"
        ? "rounded-md"
        : "rounded-xl";
  const width = fill ? "w-full" : size === "sm" ? "w-32" : "w-40 md:w-44";
  return (
    <div className={`group relative isolate shrink-0 overflow-visible ${width}`}>
      <AddToWatchlistButton media={media} className="absolute right-2 top-2 z-30" />
      <Link
        to="/media/$type/$id"
        params={{ type: media.type, id: String(media.id) }}
        onClick={() => stashWatchMedia(media)}
        className="block w-full text-left"
      >
        <div
          className={`media-poster lift-smooth relative aspect-[2/3] overflow-hidden ${radius} bg-foreground/5 ring-1 ring-foreground/8 group-hover:-translate-y-1.5 group-hover:scale-[1.03] group-hover:ring-foreground/20`}
        >

          <img
            src={media.poster}
            alt={media.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          {s.showRatings && media.rating > 0 && (
            <div className="absolute left-2 top-2 inline-flex h-6 items-center gap-1 rounded-md bg-background/75 px-2 text-[10px] font-semibold leading-none ring-1 ring-foreground/10 backdrop-blur-md">
              <svg
                viewBox="0 0 16 16"
                className="h-2.5 w-2.5 shrink-0 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="8" r="5.2" />
                <path d="M8 4.8v3.4l2.4 1.4" />
              </svg>
              <span className="tabular-nums">{media.rating.toFixed(1)}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-all duration-500 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-foreground text-background shadow-lg transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
              <Play className="h-4 w-4 fill-current" />
            </div>
          </div>
        </div>
        <div className="mt-3 px-0.5">
          <div className="truncate text-sm font-semibold text-foreground/95">{media.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {media.year}
            {media.genres[0] ? ` · ${media.genres[0]}` : ""}
          </div>
        </div>
      </Link>
    </div>
  );
}

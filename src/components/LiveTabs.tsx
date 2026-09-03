import { Link } from "@tanstack/react-router";
import { RadioTower, Trophy } from "lucide-react";

/** Shared segmented switcher between Live TV and Sports. */
export function LiveTabs({ active }: { active: "tv" | "sports" }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-glass-border bg-card/50 p-1">
      <Link
        to="/iptv"
        preload="intent"
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide transition-colors duration-150 ${
          active === "tv"
            ? "bg-primary text-primary-foreground"
            : "text-foreground/60 hover:text-foreground"
        }`}
      >
        <RadioTower className="h-3.5 w-3.5" strokeWidth={2.4} />
        Live TV
      </Link>
      <Link
        to="/sports"
        preload="intent"
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide transition-colors duration-150 ${
          active === "sports"
            ? "bg-amber-400 text-black"
            : "text-foreground/60 hover:text-foreground"
        }`}
      >
        <Trophy className="h-3.5 w-3.5" strokeWidth={2.4} />
        Sports
      </Link>
    </div>
  );
}

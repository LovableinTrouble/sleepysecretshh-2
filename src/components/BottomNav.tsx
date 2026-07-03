import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  Compass,
  Search,
  Bookmark,
  RadioTower,
  Music2,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

const items: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/iptv", label: "Live TV", icon: RadioTower },
  { to: "/music", label: "Music", icon: Music2 },
  { to: "/watchlist", label: "Watchlist", icon: Bookmark },
  { to: "/search", label: "Search", icon: Search },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const DISCORD_URL = "https://discord.gg/WHyuYVS6UG";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z" />
    </svg>
  );
}

export function BottomNav() {
  const loc = useLocation();
  // Don't render over the immersive player — it covers the bottom control bar.
  // Use exact "/watch/" prefix so /watchlist still gets the nav.
  if (
    loc.pathname === "/watch" ||
    loc.pathname.startsWith("/watch/") ||
    loc.pathname.startsWith("/sports/")
  ) return null;
  return (
    <nav className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1rem)] max-w-3xl -translate-x-1/2 animate-fade-in md:bottom-6 md:w-auto">
      <div className="glass-strong flex items-center justify-between gap-0.5 rounded-2xl px-1.5 py-1.5 shadow-[var(--shadow-glow)] md:gap-1 md:rounded-full md:px-2.5 md:py-2.5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className={`group relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-sm font-semibold transition-colors duration-150 md:flex-none md:rounded-full md:px-4 md:py-2.5 ${
                active
                  ? "bg-primary/20 text-foreground ring-1 ring-primary/40 shadow-[0_0_20px_oklch(0.72_0.18_305_/_0.35)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon className="h-[1.15rem] w-[1.15rem] shrink-0 md:h-5 md:w-5" strokeWidth={2.15} />
              <span
                className={`hidden overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 md:inline-block ${
                  active ? "max-w-[88px] opacity-100" : "max-w-0 opacity-0 group-hover:max-w-[88px] group-hover:opacity-100"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join our Discord"
          title="Join our Discord"
          className="group relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-sm font-semibold text-[#5865F2] transition-colors duration-150 hover:bg-[#5865F2]/15 hover:text-[#7983f7] md:flex-none md:rounded-full md:px-4 md:py-2.5"
        >
          <DiscordIcon className="h-[1.15rem] w-[1.15rem] shrink-0 md:h-5 md:w-5" />
          <span className="hidden overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 md:inline-block max-w-0 opacity-0 group-hover:max-w-[88px] group-hover:opacity-100">
            Discord
          </span>
        </a>
      </div>
    </nav>
  );
}

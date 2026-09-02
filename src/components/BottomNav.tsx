import { Link, useLocation } from "@tanstack/react-router";
import { useAvatarUrl } from "@/lib/avatar";
import {
  Home,
  Compass,
  Search,
  Bookmark,
  RadioTower,
  Settings as SettingsIcon,
  UserRound,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

const items: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/iptv", label: "Live TV", icon: RadioTower },
  { to: "/shorts", label: "Shorts", icon: Smartphone },
  { to: "/watchlist", label: "Watchlist", icon: Bookmark },
  { to: "/search", label: "Search", icon: Search },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
  { to: "/account", label: "Account", icon: UserRound },
];


export function BottomNav() {
  const loc = useLocation();

  // Don't render over the immersive player — it covers the bottom control bar.
  if (
    loc.pathname === "/watch" ||
    loc.pathname.startsWith("/watch/") ||
    loc.pathname.startsWith("/sports/")
  )
    return null;

  return (
    <nav className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1rem)] max-w-3xl -translate-x-1/2 animate-fade-in md:bottom-6 md:w-auto">
      <div className="nav-dock flex items-center justify-between gap-0.5 rounded-2xl px-1.5 py-1.5 md:gap-1 md:rounded-[1.35rem] md:px-2 md:py-2">
        {items.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <Link
              key={to + label}
              to={to}
              aria-label={label}
              className={`group relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-sm font-semibold transition-all duration-300 md:flex-none md:px-3.5 md:py-2.5 ${
                active
                  ? "bg-foreground/10 text-foreground ring-1 ring-foreground/10 shadow-inner"
                  : "text-muted-foreground hover:bg-foreground/6 hover:text-foreground"
              }`}
            >
              <Icon className="h-[1.15rem] w-[1.15rem] shrink-0 md:h-5 md:w-5" strokeWidth={2.15} />
              <span
                className={`hidden overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 md:inline-block ${
                  active
                    ? "max-w-[88px] opacity-100"
                    : "max-w-0 opacity-0 group-hover:max-w-[88px] group-hover:opacity-100"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

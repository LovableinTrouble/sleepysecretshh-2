import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import sleepyOg from "../assets/sleepy-og.jpg";
import voidIcon from "../assets/void-icon.png.asset.json";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { BootLoader } from "../components/BootLoader";
import { BottomNav } from "../components/BottomNav";
import { LogoWord } from "../components/Logo";
import { SharePopup } from "../components/SharePopup";
import { MusicMiniPlayer } from "../components/MusicMiniPlayer";
import { useSettings } from "../lib/store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "Sleepy — Stream Everything" },
      { name: "description", content: "Sleepy — stream movies, TV shows, anime, live sports and IPTV channels in one beautiful, fast UI." },
      { name: "author", content: "Sleepy" },
      { name: "theme-color", content: "#0b0b12" },
      { property: "og:site_name", content: "Sleepy" },
      { property: "og:title", content: "Sleepy — Stream Everything" },
      { property: "og:description", content: "Stream movies, TV, anime, live sports and IPTV in one beautiful, fast UI." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://xullys.xyz" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Sleepy — Stream Everything" },
      { name: "twitter:description", content: "Stream movies, TV, anime, live sports and IPTV in one beautiful, fast UI." },
      { property: "og:image", content: sleepyOg },
      { property: "og:image:width", content: "1280" },
      { property: "og:image:height", content: "672" },
      { name: "twitter:image", content: sleepyOg },
    ],
   links: [
  { rel: "stylesheet", href: appCss },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", type: "image/png", href: voidIcon.url },
  { rel: "apple-touch-icon", href: voidIcon.url },
  { rel: "preconnect", href: "https://image.tmdb.org", crossOrigin: "anonymous" },
  { rel: "dns-prefetch", href: "https://image.tmdb.org" },
  { rel: "preconnect", href: "https://api.themoviedb.org" },
  { rel: "dns-prefetch", href: "https://api.themoviedb.org" },
],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

function AppShell() {
  const [settings] = useSettings();
  const animOn = settings.animationsEnabled !== false;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Scroll to top on route change
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  // Global keyboard shortcuts: "/" focuses search, "g h" home
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const isTyping = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (isTyping) return;
      if (e.key === "/") { e.preventDefault(); navigate({ to: "/search" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", settings.theme || "midnight-violet");
  }, [settings.theme]);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  return (
    <div className={animOn ? "" : "no-anim"}>
      <AnimatedBackground />
      <BootLoader />
      {settings.showLogo && (
        <header className="fixed left-0 right-0 top-0 z-40 pointer-events-none px-5 py-4 md:hidden">
          <div className="pointer-events-auto inline-flex rounded-full glass-strong px-2 py-1 shadow-[var(--shadow-glass)]">
            <LogoWord size={28} />
          </div>
        </header>
      )}
      <Outlet />
      <BottomNav />
      <SiteFooter />
      <SharePopup />
      <MusicMiniPlayer />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="relative z-10 mt-16 pb-24 md:pb-10 px-5">
      <div className="mx-auto max-w-7xl rounded-2xl glass-strong px-6 py-6 text-sm text-white/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold text-white tracking-tight">Sleepy</div>
            <p className="max-w-xl text-white/60">
              Stream movies, TV shows, anime, live sports and IPTV channels in one beautiful, fast UI.
            </p>
          </div>
          <div className="text-xs text-white/50 md:text-right">
            <div>DMCA / Takedown</div>
            <a href="mailto:slinkingtox@outlook.com" className="text-white/80 hover:text-white underline-offset-4 hover:underline">
              slinkingtox@outlook.com
            </a>
          </div>
        </div>
        <div className="mt-4 border-t border-white/10 pt-3 text-xs text-white/40">
          © {new Date().getFullYear()} Sleepy. All trademarks belong to their respective owners.
        </div>
      </div>
    </footer>
  );
}

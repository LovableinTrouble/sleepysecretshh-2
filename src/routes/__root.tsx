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
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "Sleepy — Stream Everything" },
      {
        name: "description",
        content:
          "Sleepy — stream movies, TV shows, anime, live sports and IPTV channels in one beautiful, fast UI.",
      },
      { name: "author", content: "Sleepy" },
      { name: "theme-color", content: "#0b0b12" },
      { property: "og:site_name", content: "Sleepy" },
      { property: "og:title", content: "Sleepy — Stream Everything" },
      {
        property: "og:description",
        content: "Stream movies, TV, anime, live sports and IPTV in one beautiful, fast UI.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://xullys.xyz" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Sleepy — Stream Everything" },
      {
        name: "twitter:description",
        content: "Stream movies, TV, anime, live sports and IPTV in one beautiful, fast UI.",
      },
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

  // Block right-click context menu across the whole site.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onCtx = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // Global keyboard shortcuts: "/" focuses search, "g h" home
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const isTyping =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (isTyping) return;
      if (e.key === "/") {
        e.preventDefault();
        navigate({ to: "/search" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", settings.theme || "midnight-violet");
    const root = document.documentElement;
    // Custom theme: derive full token set from primary + background.
    if (settings.theme === "custom" && settings.customTheme) {
      applyCustomTheme(root, settings.customTheme.primary, settings.customTheme.background);
    } else {
      clearCustomTheme(root);
    }
  }, [settings.theme, settings.customTheme?.primary, settings.customTheme?.background]);
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
      <Outlet />
      <BottomNav />
      <SiteFooter pathname={pathname} />
      <SharePopup />
    </div>
  );
}

function SiteFooter({ pathname }: { pathname: string }) {
  // Hide the footer on immersive/player routes so it doesn't briefly flash
  // in during route transitions before those pages take over the viewport.
  const HIDE = ["/watch", "/live", "/sports/", "/iptv", "/shorts"];
  if (HIDE.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) {
    return null;
  }
  return (
    <footer className="relative z-10 mt-16 pb-24 md:pb-10 px-5">
      <div className="mx-auto max-w-7xl rounded-2xl glass-strong px-6 py-6 text-sm text-white/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold text-white tracking-tight">Sleepy</div>
            <p className="max-w-xl text-white/60">
              Stream movies, TV shows, anime, live sports and IPTV channels in one beautiful, fast
              UI.
            </p>
          </div>
          <div className="text-xs text-white/50 md:text-right">
            <div>DMCA / Takedown</div>
            <a
              href="mailto:slinkingtox@outlook.com"
              className="text-white/80 hover:text-white underline-offset-4 hover:underline"
            >
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

// ---------- Custom theme derivation ----------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const int = parseInt(n, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}
function rgbStr(r: number, g: number, b: number, a?: number) {
  return a != null
    ? `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`
    : `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}
function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function luminance([r, g, b]: [number, number, number]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const CUSTOM_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--glass",
  "--glass-border",
  "--gradient-primary",
  "--gradient-bg",
  "--shadow-glow",
  "--shadow-glass",
  "--radius",
];

// Debounce helper to prevent rapid updates
let themeRaf: number | null = null;
let pendingTheme: { primary: string; background: string } | null = null;

function applyCustomTheme(root: HTMLElement, primaryHex: string, bgHex: string) {
  const bg = hexToRgb(bgHex);
  const pr = hexToRgb(primaryHex);
  const isLight = luminance(bg) > 0.55;
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const tint = isLight ? black : white;
  const fg = isLight ? black : white;
  const s = root.style;

  // Batch all style updates in a single operation
  const styles: [string, string][] = [
    ["--radius", "1rem"],
    ["--background", rgbStr(...bg)],
    ["--foreground", rgbStr(...fg)],
    ["--card", rgbStr(...mix(bg, tint, 0.06))],
    ["--card-foreground", rgbStr(...fg)],
    ["--popover", rgbStr(...mix(bg, tint, 0.04))],
    ["--popover-foreground", rgbStr(...fg)],
    ["--primary", rgbStr(...pr)],
    ["--primary-foreground", rgbStr(...(luminance(pr) > 0.55 ? black : white))],
    ["--secondary", rgbStr(...mix(bg, tint, 0.12))],
    ["--secondary-foreground", rgbStr(...fg)],
    ["--muted", rgbStr(...mix(bg, tint, 0.1))],
    ["--muted-foreground", rgbStr(...mix(fg, bg, 0.35))],
    ["--accent", rgbStr(...mix(pr, tint, 0.15))],
    ["--accent-foreground", rgbStr(...fg)],
    ["--destructive", "rgb(220, 60, 60)"],
    ["--destructive-foreground", rgbStr(...white)],
    ["--border", rgbStr(mix(fg, bg, 0.7)[0], mix(fg, bg, 0.7)[1], mix(fg, bg, 0.7)[2], 0.35)],
    ["--input", rgbStr(...mix(bg, tint, 0.14))],
    ["--ring", rgbStr(...pr)],
    ["--glass", rgbStr(mix(bg, tint, 0.1)[0], mix(bg, tint, 0.1)[1], mix(bg, tint, 0.1)[2], 0.55)],
    ["--glass-border", rgbStr(fg[0], fg[1], fg[2], 0.12)],
    [
      "--gradient-primary",
      `linear-gradient(135deg, ${rgbStr(...mix(pr, tint, 0.15))}, ${rgbStr(...pr)})`,
    ],
    [
      "--gradient-bg",
      `radial-gradient(ellipse at top, ${rgbStr(...mix(bg, pr, 0.2))} 0%, ${rgbStr(...bg)} 60%)`,
    ],
    ["--shadow-glow", `0 10px 60px -10px ${rgbStr(pr[0], pr[1], pr[2], 0.45)}`],
    ["--shadow-glass", `0 8px 32px 0 ${rgbStr(0, 0, 0, 0.5)}`],
  ];

  // Apply all at once using requestAnimationFrame for smooth updates
  if (themeRaf) cancelAnimationFrame(themeRaf);
  pendingTheme = { primary: primaryHex, background: bgHex };

  themeRaf = requestAnimationFrame(() => {
    if (!pendingTheme) return;
    for (const [prop, val] of styles) {
      s.setProperty(prop, val);
    }
    themeRaf = null;
  });
}

function clearCustomTheme(root: HTMLElement) {
  for (const k of CUSTOM_TOKENS) root.style.removeProperty(k);
}

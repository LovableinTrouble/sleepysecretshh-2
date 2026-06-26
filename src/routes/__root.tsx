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
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "VOID" },
      { name: "description", content: "Stream your favorite movies, tv and more in one beautiful UI" },
      { name: "author", content: "VOID" },
      { property: "og:title", content: "VOID" },
      { property: "og:description", content: "Stream your favorite movies, tv and more in one beautiful UI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "VOID" },
      { name: "twitter:description", content: "Stream your favorite movies, tv and more in one beautiful UI" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5c7fedab-6d8e-4334-bc61-0259e81ca6d9/id-preview-58b95613--1c6205fc-0ad2-4c96-b540-95c04d82d13f.lovable.app-1782512932262.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5c7fedab-6d8e-4334-bc61-0259e81ca6d9/id-preview-58b95613--1c6205fc-0ad2-4c96-b540-95c04d82d13f.lovable.app-1782512932262.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Warm up upstream connections so first image / first stream byte
      // arrives in one RTT instead of three (DNS + TCP + TLS).
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
      <SharePopup />
    </div>
  );
}

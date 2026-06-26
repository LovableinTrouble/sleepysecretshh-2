import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ArrowLeft, AlertTriangle, Maximize2, Volume2, VolumeX, RefreshCw, Tv2 } from "lucide-react";
import { CURATED_CHANNELS } from "@/lib/iptv-curated";

export const Route = createFileRoute("/live/$id")({
  head: () => ({
    meta: [
      { title: "Live TV — SLEEPY" },
      { name: "description", content: "Live IPTV channel player." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    url: typeof s.url === "string" ? s.url : undefined,
    name: typeof s.name === "string" ? s.name : undefined,
    logo: typeof s.logo === "string" ? s.logo : undefined,
    group: typeof s.group === "string" ? s.group : undefined,
  }),
  component: LivePage,
});

function LivePage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  // Prefer search params (passed during navigation). Fall back to curated lookup.
  const curated = CURATED_CHANNELS.find((c) => c.id === id);
  const channel = {
    id,
    name: search.name || curated?.name || "Live Channel",
    url: search.url || curated?.url || "",
    logo: search.logo || curated?.logo,
    group: search.group || curated?.group || "Live",
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Route every IPTV URL through the server proxy. Most free IPTV CDNs
  // restrict CORS to their own origin (pluto.tv, etc.) — fetching them
  // directly from the browser stalls hls.js forever.
  const proxiedUrl = channel.url
    ? `/api/public/iptv-proxy?u=${btoa(channel.url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`
    : "";

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !proxiedUrl) {
      setErr("No stream URL provided.");
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    let hls: Hls | null = null;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (v.readyState < 2) {
          setErr("This channel didn't start in time. It may be geo-blocked or offline.");
          setLoading(false);
        }
      }, 20000);
    };

    const onPlaying = () => {
      setLoading(false);
      if (stallTimer) clearTimeout(stallTimer);
    };
    const onWaiting = () => setLoading(true);
    const onLoadedData = () => setLoading(false);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("loadeddata", onLoadedData);

    const canNative = v.canPlayType("application/vnd.apple.mpegurl") !== "";

    if (Hls.isSupported() && !canNative) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        manifestLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 15000,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 4,
      });
      hls.loadSource(proxiedUrl);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        v.play().catch(() => {
          v.muted = true;
          setMuted(true);
          void v.play().catch(() => {});
        });
      });
      hls.on(Hls.Events.ERROR, (_e: unknown, d: { fatal?: boolean; type?: string; details?: string }) => {
        if (!d?.fatal) return;
        if (d.type === "mediaError") {
          try { hls?.recoverMediaError(); return; } catch { /* fallthrough */ }
        }
        setErr(
          d.type === "networkError"
            ? "Network error. The channel may be geo-blocked or offline."
            : "This channel isn't responding. It may be geo-blocked or offline.",
        );
        setLoading(false);
        if (stallTimer) clearTimeout(stallTimer);
      });
    } else {
      v.src = proxiedUrl;
      v.play().catch(() => {
        v.muted = true;
        setMuted(true);
        void v.play().catch(() => {});
      });
    }
    armStallTimer();

    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("loadeddata", onLoadedData);
      if (stallTimer) clearTimeout(stallTimer);
      hls?.destroy();
    };
  }, [proxiedUrl, reloadKey]);

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ to: "/iptv" });
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/15"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex min-w-0 items-center gap-3">
          {channel.logo ? (
            <img
              src={`https://images.weserv.nl/?url=${encodeURIComponent(channel.logo.replace(/^https?:\/\//, ""))}&w=80&h=80&fit=contain&output=png&n=-1`}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallback !== "1" && channel.logo) {
                  img.dataset.fallback = "1";
                  img.src = channel.logo;
                  return;
                }
                img.style.display = "none";
              }}
              className="h-8 w-8 shrink-0 rounded-md bg-white/5 object-contain"
            />
          ) : (
            <Tv2 className="h-6 w-6 text-white/60" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{channel.name}</div>
            <div className="truncate text-[11px] uppercase tracking-[0.16em] text-white/45">
              {channel.group} · Live
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Reload"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/15"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/15"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/15"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Player */}
      <div ref={containerRef} className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          autoPlay
          className="h-full w-full bg-black"
        />
        {loading && !err && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/60">Tuning in…</p>
            </div>
          </div>
        )}
        {err && (
          <div className="absolute inset-0 grid place-items-center bg-black/85 px-6 text-center">
            <div className="max-w-md">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-3 text-sm text-white">{err}</p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Try again
                </button>
                <button
                  onClick={onBack}
                  className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Browse channels
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

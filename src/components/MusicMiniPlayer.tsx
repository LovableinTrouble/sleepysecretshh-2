import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Play, Pause, SkipBack, SkipForward, X, Loader2 } from "lucide-react";
import { useMusicPlayer, toggle, next, prev, close, seek } from "@/lib/music-player";

const HIDDEN_PREFIXES = ["/music"]; // never show on the music page itself
const STOP_PREFIXES = ["/watch", "/sports/", "/live/"]; // entering any video/sports/iptv player kills music

export function MusicMiniPlayer() {
  const s = useMusicPlayer();
  const loc = useLocation();
  const [closing, setClosing] = useState(false);

  // If we land on a "player" route, stop music + remove popup.
  useEffect(() => {
    if (STOP_PREFIXES.some((p) => loc.pathname.startsWith(p))) {
      close();
    }
  }, [loc.pathname]);

  // Reset closing flag when a new track starts.
  useEffect(() => { if (s.current) setClosing(false); }, [s.current?.id]);

  const onMusicRoute = HIDDEN_PREFIXES.some((p) => loc.pathname.startsWith(p));
  if (!s.current || onMusicRoute) return null;

  const dismiss = () => {
    setClosing(true);
    window.setTimeout(() => close(), 220);
  };

  const pct = s.duration ? (s.progress / s.duration) * 100 : 0;

  return (
    <div
      className={`fixed bottom-20 right-3 z-[60] w-[min(340px,calc(100vw-1.5rem))] md:bottom-6 md:right-6 transition-all duration-200 ease-out ${
        closing ? "opacity-0 translate-y-3 scale-95 pointer-events-none" : "opacity-100 translate-y-0 scale-100 animate-fade-in"
      }`}
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2.5 p-2.5">
          <Link to="/music" className="relative shrink-0" aria-label="Open music">
            <img src={s.current.artwork} alt="" className="h-11 w-11 rounded-md object-cover" />
            {s.loading && (
              <div className="absolute inset-0 grid place-items-center rounded-md bg-black/50">
                <Loader2 className="h-4 w-4 animate-spin text-white/90" />
              </div>
            )}
          </Link>
          <Link to="/music" className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">{s.current.title}</div>
            <div className="truncate text-[11px] text-white/60">{s.current.artist}</div>
          </Link>
          <div className="flex items-center gap-0.5">
            <button onClick={prev} aria-label="Previous" className="rounded-full p-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={toggle}
              aria-label={s.playing ? "Pause" : "Play"}
              className="grid h-8 w-8 place-items-center rounded-full bg-white text-black transition active:scale-95"
            >
              {s.playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            </button>
            <button onClick={next} aria-label="Next" className="rounded-full p-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              onClick={dismiss}
              aria-label="Close player"
              className="ml-0.5 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          className="h-1 cursor-pointer bg-white/10"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
          }}
        >
          <div className="h-full bg-white/90 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
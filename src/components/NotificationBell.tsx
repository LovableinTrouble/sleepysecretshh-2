import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellRing, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useFolders } from "@/lib/store";
import { loadStashedMedia } from "@/lib/watch-stash";
import { fetchEpisodeAirStatus } from "@/lib/tmdb";
import type { Media } from "@/lib/catalog";

const SEEN_KEY = "sleepy.notifications.seenAt";
const WINDOW_DAYS = 21;

interface Item {
  media: Media;
  season: number;
  episode: number;
  name: string;
  airDate: string;
  ts: number;
}

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) || 0);
  } catch {
    return 0;
  }
}

/** New-episode notifications for series saved in the user's watchlist. */
export function NotificationBell() {
  const [folders] = useFolders();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setSeenAt(readSeen()), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const series = useMemo(() => {
    const ids = [...new Set(folders.flatMap((f) => f.mediaIds))];
    return ids
      .map((id) => loadStashedMedia(id))
      .filter((m): m is Media => !!m && (m.type === "tv" || m.type === "anime"))
      .slice(0, 14);
  }, [folders]);

  const { data } = useQuery<Item[]>({
    queryKey: ["episode-notifications", series.map((m) => m.id).join(",")],
    enabled: series.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
      const out: Item[] = [];
      const statuses = await Promise.all(
        series.map((m) => fetchEpisodeAirStatus(m.id).catch(() => null)),
      );
      statuses.forEach((s, i) => {
        const last = s?.lastAired;
        if (!last?.airDate) return;
        const ts = new Date(last.airDate).getTime();
        if (!Number.isFinite(ts) || ts < cutoff || ts > Date.now() + 86_400_000) return;
        out.push({ media: series[i], ...last, ts });
      });
      return out.sort((a, b) => b.ts - a.ts);
    },
  });

  const items = data ?? [];
  const unread = items.filter((i) => i.ts > seenAt).length;

  const markSeen = () => {
    const now = Date.now();
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* no-op */
    }
    setSeenAt(now);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) markSeen();
        }}
        aria-label={unread ? `${unread} new episodes` : "Notifications"}
        className="liquid-glass grid h-11 w-11 place-items-center rounded-full text-foreground/90 hover:text-foreground"
      >
        {unread ? <BellRing className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[19rem] overflow-hidden rounded-3xl border border-white/10 bg-popover/95 shadow-2xl backdrop-blur-xl animate-modal-in sm:w-[22rem]">
          <div className="flex items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
            <div>
              <div className="text-sm font-black tracking-tight">New episodes</div>
              <div className="text-[11px] text-muted-foreground">From your watchlist</div>
            </div>
            {items.length > 0 && (
              <button
                onClick={markSeen}
                className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
              >
                <Check className="h-3 w-3" /> Read
              </button>
            )}
          </div>
          <div className="max-h-[22rem] overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                {series.length === 0
                  ? "Save a series to your watchlist to get episode alerts."
                  : "No new episodes in the last 3 weeks."}
              </div>
            ) : (
              items.map((i) => (
                <Link
                  key={`${i.media.id}-${i.season}-${i.episode}`}
                  to="/media/$type/$id"
                  params={{ type: i.media.type, id: String(i.media.id) }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/[0.06]"
                >
                  <span className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
                    {i.media.poster && (
                      <img src={i.media.poster} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{i.media.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      S{i.season} · E{i.episode} — {i.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-primary/85">
                      {i.airDate}
                    </span>
                  </span>
                  {i.ts > seenAt && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

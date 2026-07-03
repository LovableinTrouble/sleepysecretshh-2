import { Link } from "@tanstack/react-router";
import { Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { useContinueWatching, removeProgress } from "@/lib/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function tmdbBackdrop(path?: string | null, fallback?: string | null) {
  return path || fallback || "";
}

export function ContinueWatchingRow() {
  const { items } = useContinueWatching();
  const [pending, setPending] = useState<null | { mediaId: number | string; mediaType: string; title: string; season?: number | null; episode?: number | null }>(null);
  if (!items.length) return null;

  return (
    <section className="px-4 md:px-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Continue Watching</h2>
        <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{items.length} {items.length === 1 ? "item" : "items"}</span>
      </div>
      <div className="no-scrollbar -mx-2 flex gap-4 overflow-x-auto px-2 pb-6 pt-2">
        {items.map((it) => {
          const pct = it.durationSeconds > 0 ? Math.min(100, Math.max(0, (it.positionSeconds / it.durationSeconds) * 100)) : 0;
          const remaining = it.durationSeconds > 0 ? Math.max(0, Math.floor((it.durationSeconds - it.positionSeconds) / 60)) : 0;
          const unknownDuration = it.durationSeconds <= 0;
          return (
            <div key={`${it.mediaId}-${it.mediaType}`} className="group relative w-64 shrink-0 md:w-72">
              <Link
                to="/watch/$id"
                params={{ id: String(it.mediaId) }}
                search={{ t: it.mediaType as any, s: it.season ?? undefined, e: it.episode ?? undefined }}
                className="block overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all duration-200 ease-out hover:-translate-y-1 hover:ring-primary/40 hover:shadow-lg hover:shadow-primary/10"
              >
                <div className="relative aspect-video bg-black">
                  {tmdbBackdrop(it.backdrop, it.poster) && (
                    <img
                      src={tmdbBackdrop(it.backdrop, it.poster)}
                      alt={it.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                      <Play className="h-5 w-5 fill-current" />
                    </div>
                  </div>
                  <div className="absolute inset-x-3 bottom-3">
                    <div className="truncate text-sm font-semibold text-white drop-shadow">
                      {it.title}
                      {it.season != null && it.episode != null && (
                        <span className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium">S{it.season} · E{it.episode}</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/75">
                      <span>{unknownDuration ? "Continue watching" : remaining > 0 ? `${remaining}m left` : "Almost done"}</span>
                    </div>
                    {!unknownDuration && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/20">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPending({ mediaId: it.mediaId, mediaType: it.mediaType, title: it.title, season: it.season, episode: it.episode }); }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Remove from continue watching"
                className="pointer-events-auto absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/70 opacity-0 group-hover:opacity-100 ring-1 ring-white/20 backdrop-blur-sm transition-all duration-200 hover:bg-destructive hover:text-white hover:ring-destructive/50 active:scale-90"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Continue Watching?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? (
                <>
                  <span className="font-medium text-foreground">{pending.title}</span>
                  {pending.season != null && pending.episode != null && <> · S{pending.season} E{pending.episode}</>}
                  {" "}will be removed from your list. Your playback position will be cleared.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pending) void removeProgress(pending.mediaId as any, pending.season ?? null, pending.episode ?? null);
                setPending(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

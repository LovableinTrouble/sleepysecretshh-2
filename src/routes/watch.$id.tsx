/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Media, MediaKind } from "@/lib/catalog";
import { StreamPlayer } from "@/components/StreamPlayer";
import { loadStashedMedia } from "@/lib/watch-stash";
import { fetchMediaById } from "@/lib/tmdb";

export const Route = createFileRoute("/watch/$id")({
  head: () => ({ meta: [{ title: "Now Playing — Sleepy" }] }),
  validateSearch: (s: Record<string, any>) => ({
    s: s.s ? Number(s.s) : undefined,
    e: s.e ? Number(s.e) : undefined,
    t: typeof s.t === "string" ? (s.t as MediaKind) : undefined,
    party: typeof s.party === "string" ? s.party : undefined,
  } as { s?: number; e?: number; t?: MediaKind; party?: string }),
  component: WatchPage,
});

function WatchPage() {
  const { id } = Route.useParams();
  const { s, e, t } = Route.useSearch();
  const navigate = useNavigate();
  const [media, setMedia] = useState<Media | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const numeric = Number(id);
    const cached = loadStashedMedia(numeric);
    if (cached) {
      setMedia(cached);
      return;
    }
    const kind: MediaKind = t ?? (s ? "tv" : "movie");
    fetchMediaById(numeric, kind)
      .then(setMedia)
      .catch((err) => setError(err?.message || "Couldn't load title"));
  }, [id, t, s]);

  const onClose = () => {
    if (media) {
      navigate({
        to: "/media/$type/$id",
        params: { type: media.type, id: String(media.id) },
        replace: true,
      });
      return;
    }
    navigate({ to: "/", replace: true });
  };

  if (!media) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-white/40">Loading title</div>
          <div className="mt-2 text-lg">{error ?? "Preparing your stream…"}</div>
          {error && (
            <button
              onClick={onClose}
              className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Go back
            </button>
          )}
        </div>
      </div>
    );
  }

  return <StreamPlayer media={media} season={s} episode={e} onClose={onClose} />;
}

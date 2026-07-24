/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import type { Media } from "@/lib/catalog";
import { scrapePStream, type PStreamStream } from "@/lib/pstream/resolve";
import { CustomPlayer } from "@/components/CustomPlayer";
import type { DirectSource, StreamQuality, StreamSubtitle } from "@/lib/streams";

interface Props {
  media: Media;
  season?: number;
  episode?: number;
  startAt: number;
  autoplay: boolean;
  autoNext: boolean;
  hasNext: boolean;
  onProgress: (t: number, d: number, ended: boolean) => void;
  onNextEpisode?: () => void;
  onClose: () => void;
  onFallback: (reason: string) => void;
}

function toDirectSource(s: PStreamStream): DirectSource {
  const qualities: StreamQuality[] = [];
  if (s.type === "hls") {
    qualities.push({
      url: s.url,
      label: "Auto (HLS)",
      quality: "auto",
      format: "hls",
      headers: s.headers,
    });
  } else if (s.qualities) {
    const order = ["4k", "1080", "720", "480", "360", "unknown"];
    for (const k of order) {
      const q = s.qualities[k];
      if (!q?.url) continue;
      qualities.push({
        url: q.url,
        label: k === "4k" ? "4K" : k === "unknown" ? "Auto" : `${k}p`,
        quality: k,
        format: "mp4",
        headers: s.headers,
      });
    }
  } else {
    qualities.push({
      url: s.url, label: "Direct", quality: "auto", format: "mp4", headers: s.headers,
    });
  }
  const subtitles: StreamSubtitle[] = (s.captions ?? []).map((c) => ({
    url: c.url, language: c.language, label: c.language, type: c.type,
  }));
  return {
    kind: "direct",
    id: `pstream:${s.sourceId}${s.embedId ? `:${s.embedId}` : ""}`,
    name: `P-Stream · ${s.sourceId}`,
    badge: "P-Stream",
    qualities,
    subtitles,
  };
}

export function PStreamPlayer(props: Props) {
  const { media, season, episode, startAt, autoplay, autoNext, hasNext,
    onProgress, onNextEpisode, onClose, onFallback } = props;

  const [stream, setStream] = useState<PStreamStream | null>(null);
  const [status, setStatus] = useState("Contacting providers…");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    setStream(null); setError(null); setStatus("Contacting providers…");
    const yearNum = parseInt(media.year, 10);
    scrapePStream(
      {
        tmdbId: String(media.id),
        title: media.title,
        releaseYear: Number.isFinite(yearNum) ? yearNum : undefined,
        type: media.type === "movie" ? "movie" : "show",
        season, episode,
      },
      (e) => {
        if (dead) return;
        if (e.type === "start") setStatus(`Trying ${e.detail}…`);
        else if (e.type === "discoverEmbeds") setStatus(`Found ${e.detail}`);
        else if (e.type === "init") setStatus(`Scanning ${e.detail}`);
      },
    )
      .then((s) => {
        if (dead) return;
        if (!s) { setError("No P-Stream sources available"); onFallback("no-stream"); return; }
        setStream(s);
      })
      .catch((err) => {
        if (dead) return;
        const msg = err?.message || "Scrape error";
        setError(msg); onFallback(msg);
      });
    return () => { dead = true; };
  }, [media.id, media.title, media.year, media.type, season, episode, attempt, onFallback]);

  if (!stream) {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin" />
        </div>
        <p className="text-sm font-semibold text-white">{media.title}</p>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">{error ?? status}</p>
        {error && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
            <button
              onClick={onClose}
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white"
            >
              Close
            </button>
          </div>
        )}
      </div>
    );
  }

  const source = toDirectSource(stream);
  return (
    <CustomPlayer
      source={source}
      title={media.title}
      season={season}
      episode={episode}
      startAt={startAt}
      onProgress={onProgress}
      onClose={onClose}
      onSelectSource={() => {}}
      onNextEpisode={hasNext ? onNextEpisode : undefined}
      hasNext={hasNext}
      autoplay={autoplay}
      autoNext={autoNext}
    />
  );
}
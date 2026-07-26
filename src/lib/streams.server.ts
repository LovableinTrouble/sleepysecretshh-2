/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StreamQuality {
  url: string;
  label: string;
  quality: string;
  format: "hls" | "mp4" | "mkv" | "unknown";
  headers?: Record<string, string>;
  size?: string;
  resolution?: number;
}
export interface StreamSubtitle {
  url: string;
  language: string;
  label: string;
  type: "srt" | "vtt";
}
export interface DirectSource {
  kind: "direct";
  id: string;
  name: string;
  badge: string;
  qualities: StreamQuality[];
  subtitles: StreamSubtitle[];
}
export interface EmbedSource {
  kind: "embed";
  id: string;
  name: string;
  badge: string;
  url: string;
}
export type ResolvedSource = DirectSource | EmbedSource;
export interface ResolveInput {
  tmdbId: string;
  title: string;
  type: "movie" | "show";
  season?: number;
  episode?: number;
}
export interface ResolveResult {
  sources: ResolvedSource[];
  primary?: string;
}

/** Scrape VidPhantom SSE endpoint for raw HLS streams (multi-provider). */
export async function resolveVidPhantom(i: ResolveInput): Promise<ResolveResult> {
  const isShow = i.type !== "movie";
  const path = isShow
    ? `tv/${i.tmdbId}/${i.season ?? 1}/${i.episode ?? 1}`
    : `movie/${i.tmdbId}`;
  const url = `https://vidphantom.com/api/hls/${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  const providers: { name: string; proxiedUrl: string; subtitles?: any[] }[] = [];
  const subtitles: StreamSubtitle[] = [];
  const seenSubs = new Set<string>();

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/event-stream",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      },
    });
    if (!res.ok || !res.body) throw new Error(`VidPhantom ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const obj = JSON.parse(jsonStr);
          if (obj.done) {
            controller.abort();
            break;
          }
          if (obj.proxiedUrl && obj.name) {
            providers.push(obj);
            if (Array.isArray(obj.subtitles)) {
              for (const s of obj.subtitles) {
                const sUrl = s?.url || s?.file;
                if (!sUrl || seenSubs.has(sUrl)) continue;
                seenSubs.add(sUrl);
                const lang = (s?.language || s?.lang || s?.label || "en").toString();
                subtitles.push({
                  url: sUrl,
                  language: lang.slice(0, 5).toLowerCase(),
                  label: (s?.label || s?.name || lang).toString(),
                  type: sUrl.toLowerCase().endsWith(".srt") ? "srt" : "vtt",
                });
              }
            }
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch {
    /* fall through — return whatever we collected */
  } finally {
    clearTimeout(timeout);
  }

  if (!providers.length) return { sources: [] };

  const qualities: StreamQuality[] = providers.map((p) => ({
    url: p.proxiedUrl,
    label: p.name,
    quality: "auto",
    format: "hls",
  }));

  const direct: DirectSource = {
    kind: "direct",
    id: "vidphantom",
    name: "VidPhantom",
    badge: "HLS",
    qualities,
    subtitles,
  };
  return { sources: [direct], primary: direct.id };
}
